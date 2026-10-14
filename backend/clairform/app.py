"""HTTP layer (Starlette). Run with: python scripts/run.py  (or uvicorn clairform.app:app)."""
from __future__ import annotations

import json
import os
import logging
import secrets
import re
import time
from collections import defaultdict, deque
from typing import Literal
from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect, Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from . import __version__
from .analysis import taxonomy
from .config import Settings
from .export import package_zip, report_pdf, slug
from .ingest.files import UploadRejected
from .service import Conflict, NotFound, Service

log = logging.getLogger("clairform")

ID_DOSSIER = re.compile(r"^dos_[0-9a-f]{16}$")
ID_DOCUMENT = re.compile(r"^doc_[0-9a-f]{16}$")
UPLOAD_ID = re.compile(r"^[A-Za-z0-9_-]{8,40}$")
ID_REQUIREMENT = re.compile(r"^(?:R-[0-9a-f]{8}|M-[0-9a-f]{8})$")
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; "
       "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


# ---------------------------------------------------------------------------- request models
class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _iso_date(v: str | None) -> str | None:
    if v in (None, ""):
        return None
    from datetime import date

    try:
        return date.fromisoformat(v).isoformat()
    except ValueError:
        raise ValueError("date attendue au format AAAA-MM-JJ")


class DossierIn(Strict):
    title: str = Field(min_length=1, max_length=160)
    program: str = Field(default="", max_length=200)
    deadline: str | None = None

    @field_validator("deadline")
    @classmethod
    def _check_deadline(cls, v):
        return _iso_date(v)


class DossierPatch(Strict):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    program: str | None = Field(default=None, max_length=200)
    deadline: str | None = None

    @field_validator("deadline")
    @classmethod
    def _check_deadline(cls, v):
        return _iso_date(v)


class RequirementIn(Strict):
    label: str = Field(min_length=3, max_length=300)
    kind: Literal["document", "condition", "rule"] = "document"
    proof_type: str | None = Field(default=None, max_length=40)
    critical: bool = False
    required: bool = True


class RequirementPatch(Strict):
    label: str | None = Field(default=None, min_length=3, max_length=300)
    kind: Literal["document", "condition", "rule"] | None = None
    proof_type: str | None = Field(default=None, max_length=40)
    required: bool | None = None
    critical: bool | None = None
    status: Literal["active", "ignored"] | None = None
    declared: bool | None = None
    reviewed: bool | None = None
    note: str | None = Field(default=None, max_length=2000)
    min_count: int | None = Field(default=None, ge=1, le=20)


class DocumentPatch(Strict):
    proof_type: str = Field(min_length=2, max_length=40)


class LinkIn(Strict):
    decision: Literal["confirmed", "rejected"] | None


# ---------------------------------------------------------------------------- helpers
async def body_model(request: Request, model: type[BaseModel]) -> BaseModel:
    raw = await request.body()
    if len(raw) > 64 * 1024:
        raise ApiError(413, "BODY-TOO-LARGE", "Requête trop volumineuse.")
    try:
        data = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        raise ApiError(400, "BAD-JSON", "Le corps de la requête n'est pas un JSON valide.")
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        first = exc.errors()[0]
        field = ".".join(str(x) for x in first.get("loc", [])) or "requête"
        raise ApiError(422, "INVALID", f"Champ « {field} » invalide : {first.get('msg', 'valeur refusée')}.")


def workspace(request: Request) -> str:
    return request.scope.get("state", {}).get("workspace", "local")


def path_id(request: Request, name: str, rx: re.Pattern) -> str:
    value = request.path_params[name]
    if not rx.match(value):
        raise ApiError(404, "NOT-FOUND", "Élément introuvable.")
    if name == "dossier_id" and not svc(request).owns(value, workspace(request)):
        # Same answer for "does not exist" and "belongs to someone else": no information leak.
        raise ApiError(404, "NOT-FOUND", "Dossier introuvable.")
    return value


def svc(request: Request) -> Service:
    return request.app.state.service


def state_response(request: Request, dossier_id: str, status: int = 200, **extra) -> JSONResponse:
    return JSONResponse({**extra, "state": svc(request).state(dossier_id)}, status_code=status)


def attachment(name: str) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", name) or "fichier"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


# ---------------------------------------------------------------------------- endpoints
async def maybe_purge(request: Request) -> None:
    settings = request.app.state.settings
    if settings.public:
        removed = await run_in_threadpool(svc(request).purge_inactive, settings.retention_days)
        if removed:
            log.info("%s dossier(s) inactif(s) supprimé(s)", removed)


async def health(request: Request):
    from .ingest.files import reader_status

    problems = request.app.state.reader_problems
    return JSONResponse({"status": "ok" if not problems else "degraded", "version": __version__, "reader": reader_status(),
                         "problems": problems, "mode": request.app.state.settings.mode,
                         "retention_days": request.app.state.settings.retention_days if request.app.state.settings.public else None})


async def list_dossiers(request: Request):
    return JSONResponse({"dossiers": await run_in_threadpool(svc(request).list_dossiers, workspace(request))})


async def create_dossier(request: Request):
    body = await body_model(request, DossierIn)
    await maybe_purge(request)
    d = await run_in_threadpool(svc(request).create_dossier, body.title, body.program, body.deadline, False, workspace(request))
    return state_response(request, d["id"], 201)


async def create_demo(request: Request):
    await maybe_purge(request)
    d = await run_in_threadpool(svc(request).create_demo, None, workspace(request))
    return state_response(request, d["id"], 201)


async def get_dossier(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    return JSONResponse({"state": await run_in_threadpool(svc(request).state, did)})


async def patch_dossier(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    body = await body_model(request, DossierPatch)
    await run_in_threadpool(svc(request).update_dossier, did, **body.model_dump(exclude_unset=True))
    return state_response(request, did)


async def delete_dossier(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    await run_in_threadpool(svc(request).delete_dossier, did)
    return Response(status_code=204)


async def upload_document(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    service = svc(request)
    if not service.db.dossier(did):
        raise ApiError(404, "NOT-FOUND", "Dossier introuvable.")
    role = request.query_params.get("role", "piece")
    if role not in {"call", "piece"}:
        raise ApiError(400, "BAD-ROLE", "Le paramètre role doit valoir « call » ou « piece ».")
    filename = request.query_params.get("filename", "").strip()
    if not filename or len(filename) > 255:
        raise ApiError(400, "BAD-NAME", "Nom de fichier manquant.")
    limit = service.settings.max_upload_bytes
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ApiError(413, "DOC-TOO-LARGE", f"Le fichier dépasse la limite de {limit // (1024 * 1024)} Mo.")
    chunks, size = [], 0
    try:
        async for chunk in request.stream():
            size += len(chunk)
            if size > limit:
                raise ApiError(413, "DOC-TOO-LARGE", f"Le fichier dépasse la limite de {limit // (1024 * 1024)} Mo.")
            chunks.append(chunk)
    except ClientDisconnect:
        log.info("upload cancelled by client before completion (%s bytes received)", size)
        return Response(status_code=499)
    data = b"".join(chunks)
    upload_id = request.query_params.get("upload_id") or None
    if upload_id and not UPLOAD_ID.match(upload_id):
        raise ApiError(400, "BAD-UPLOAD-ID", "Identifiant d'import invalide.")
    doc = await run_in_threadpool(service.add_document, did, role, filename, data, upload_id)
    return state_response(request, did, 201, document=doc)


async def cancel_upload(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    upload_id = path_id(request, "upload_id", UPLOAD_ID)
    removed = await run_in_threadpool(svc(request).cancel_upload, did, upload_id)
    return state_response(request, did, removed_after_storage=removed)


async def document_text(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    doc_id = path_id(request, "document_id", ID_DOCUMENT)
    return JSONResponse(await run_in_threadpool(svc(request).document_text, did, doc_id))


async def document_file(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    doc_id = path_id(request, "document_id", ID_DOCUMENT)
    doc, data = await run_in_threadpool(svc(request).document_file, did, doc_id)
    media = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(doc["ext"], "application/octet-stream")
    return Response(data, media_type=media, headers={"Content-Disposition": attachment(doc["name"]), "Cache-Control": "no-store"})


async def patch_document(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    doc_id = path_id(request, "document_id", ID_DOCUMENT)
    body = await body_model(request, DocumentPatch)
    await run_in_threadpool(svc(request).update_document, did, doc_id, body.proof_type)
    return state_response(request, did)


async def delete_document(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    doc_id = path_id(request, "document_id", ID_DOCUMENT)
    await run_in_threadpool(svc(request).delete_document, did, doc_id)
    return state_response(request, did)


async def add_requirement(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    body = await body_model(request, RequirementIn)
    await run_in_threadpool(svc(request).add_requirement, did, body.label, body.kind, body.proof_type, body.critical, body.required)
    return state_response(request, did, 201)


async def patch_requirement(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    rid = path_id(request, "requirement_id", ID_REQUIREMENT)
    body = await body_model(request, RequirementPatch)
    await run_in_threadpool(svc(request).update_requirement, did, rid, body.model_dump(exclude_unset=True))
    return state_response(request, did)


async def delete_requirement(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    rid = path_id(request, "requirement_id", ID_REQUIREMENT)
    await run_in_threadpool(svc(request).delete_requirement, did, rid)
    return state_response(request, did)


async def put_link(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    rid = path_id(request, "requirement_id", ID_REQUIREMENT)
    doc_id = path_id(request, "document_id", ID_DOCUMENT)
    body = await body_model(request, LinkIn)
    await run_in_threadpool(svc(request).set_link, did, rid, doc_id, body.decision)
    return state_response(request, did)


async def events(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    return JSONResponse({"events": await run_in_threadpool(svc(request).events, did)})


async def export_report(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    service = svc(request)
    state = await run_in_threadpool(service.state, did)
    pdf = await run_in_threadpool(report_pdf, state)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": attachment(f"rapport_{slug(state['dossier']['title'])}.pdf"), "Cache-Control": "no-store"})


async def export_package(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    service = svc(request)

    def build():
        state = service.state(did)
        files = {}
        for d in state["documents"]:
            if d["role"] == "piece":
                files[d["id"]] = service.document_file(did, d["id"])[1]
        return state, package_zip(state, files)

    state, data = await run_in_threadpool(build)
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": attachment(f"dossier_{slug(state['dossier']['title'])}.zip"), "Cache-Control": "no-store"})


async def export_json(request: Request):
    did = path_id(request, "dossier_id", ID_DOSSIER)
    service = svc(request)
    state = await run_in_threadpool(service.state, did)
    state["events"] = await run_in_threadpool(service.events, did)
    return Response(json.dumps(state, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": attachment(f"clairform_{slug(state['dossier']['title'])}.json"), "Cache-Control": "no-store"})


async def proof_types(request: Request):
    return JSONResponse({"proof_types": [{"code": t.code, "label": t.label, "external": t.external} for t in taxonomy.TYPES]})


# ---------------------------------------------------------------------------- middleware
class SecurityMiddleware:
    """Pure ASGI middleware: Host allow-list (DNS-rebinding defence), CSRF guard for mutating API
    calls, per-client rate limiting and security headers on every response."""

    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings
        self.hits: dict[str, deque] = defaultdict(deque)
        self.allowed_hosts = {"127.0.0.1", "localhost", "[::1]", "::1", "testserver"} | set(settings.extra_hosts)
        # Pages allowed to embed ClairForm in an iframe (e.g. "https://huggingface.co" for a Hugging Face Space page).
        self.frame_ancestors = " ".join(x for x in os.environ.get("CLAIRFORM_FRAME_ANCESTORS", "").split() if re.match(r"^https://[\w.-]+$", x))
        self.csp = (CSP.replace("frame-ancestors 'none'", f"frame-ancestors {self.frame_ancestors}") if self.frame_ancestors else CSP).encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        host = headers.get("host", "")
        hostname = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
        path, method = scope.get("path", ""), scope.get("method", "GET")

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                h = list(message.get("headers", []))
                extra = {
                    b"x-content-type-options": b"nosniff", b"referrer-policy": b"no-referrer",
                    b"content-security-policy": self.csp, b"cross-origin-opener-policy": b"same-origin",
                    b"cross-origin-resource-policy": b"same-origin", b"permissions-policy": b"camera=(), microphone=(), geolocation=()",
                }
                if not self.frame_ancestors:
                    extra[b"x-frame-options"] = b"DENY"
                present = {k.lower() for k, _ in h}
                h += [(k, v) for k, v in extra.items() if k not in present]
                if path.startswith("/api/") and b"cache-control" not in present:
                    h.append((b"cache-control", b"no-store"))
                if new_cookie:
                    h.append((b"set-cookie", new_cookie))
                if self.settings.public:
                    h.append((b"strict-transport-security", b"max-age=31536000"))
                message["headers"] = h
            await send(message)

        async def reject(status, code, message):
            await JSONResponse({"error": {"code": code, "message": message}}, status_code=status)(scope, receive, send_with_headers)

        new_cookie = None
        if self.settings.public:
            cookies = headers.get("cookie", "")
            m = re.search(r"(?:^|;\s*)cf_ws=([0-9a-f]{32})(?:;|$)", cookies)
            ws = m.group(1) if m else None
            if not ws:
                ws = secrets.token_hex(16)
                secure = headers.get("x-forwarded-proto", scope.get("scheme", "http")) == "https"
                same_site = "None; Secure" if self.frame_ancestors else ("Lax" + ("; Secure" if secure else ""))
                new_cookie = f"cf_ws={ws}; Path=/; Max-Age={60 * 60 * 24 * 30}; HttpOnly; SameSite={same_site}".encode()
            scope.setdefault("state", {})["workspace"] = ws
        else:
            scope.setdefault("state", {})["workspace"] = "local"

        if not (self.settings.public and not self.settings.extra_hosts) and hostname.lower() not in self.allowed_hosts:
            return await reject(400, "BAD-HOST", "Hôte non autorisé.")
        if path.startswith("/api/"):
            client = (scope.get("client") or ("unknown", 0))[0]
            now = time.monotonic()
            bucket = self.hits[client]
            while bucket and now - bucket[0] > 60:
                bucket.popleft()
            if len(bucket) >= self.settings.rate_limit_per_minute:
                return await reject(429, "RATE-LIMIT", "Trop de requêtes en peu de temps. Réessayez dans une minute.")
            bucket.append(now)
            if method in MUTATING:
                origin = headers.get("origin")
                if headers.get("x-clairform") != "1":
                    return await reject(403, "CSRF", "Requête refusée : en-tête de sécurité manquant.")
                if origin and origin.split("://", 1)[-1].lower() != host.lower():
                    return await reject(403, "CSRF", "Requête refusée : origine différente.")
        return await self.app(scope, receive, send_with_headers)


async def handle_api_error(request: Request, exc: ApiError):
    return error(exc.status, exc.code, exc.message)


async def handle_upload_rejected(request: Request, exc: UploadRejected):
    return error(exc.status, exc.code, exc.message)


async def handle_not_found(request: Request, exc: NotFound):
    return error(404, "NOT-FOUND", f"Élément introuvable ({exc}).")


async def handle_conflict(request: Request, exc: Conflict):
    return error(409, exc.code, exc.message)


async def handle_any(request: Request, exc: Exception):
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return error(500, "INTERNAL", "Erreur interne inattendue. Le détail a été écrit dans le journal du serveur.")


async def handle_http(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return error(exc.status_code, "NOT-FOUND" if exc.status_code == 404 else "HTTP", "Ressource introuvable." if exc.status_code == 404 else str(exc.detail))
    return Response(status_code=exc.status_code)


def create_app(settings: Settings | None = None) -> Starlette:
    from starlette.exceptions import HTTPException

    settings = settings or Settings()
    D = "/api/dossiers/{dossier_id}"
    routes = [
        Route("/api/health", health),
        Route("/api/proof-types", proof_types),
        Route("/api/dossiers", list_dossiers, methods=["GET"]),
        Route("/api/dossiers", create_dossier, methods=["POST"]),
        Route("/api/demo", create_demo, methods=["POST"]),
        Route(D, get_dossier, methods=["GET"]),
        Route(D, patch_dossier, methods=["PATCH"]),
        Route(D, delete_dossier, methods=["DELETE"]),
        Route(D + "/documents", upload_document, methods=["POST"]),
        Route(D + "/uploads/{upload_id}/cancel", cancel_upload, methods=["POST"]),
        Route(D + "/documents/{document_id}", patch_document, methods=["PATCH"]),
        Route(D + "/documents/{document_id}", delete_document, methods=["DELETE"]),
        Route(D + "/documents/{document_id}/text", document_text, methods=["GET"]),
        Route(D + "/documents/{document_id}/file", document_file, methods=["GET"]),
        Route(D + "/requirements", add_requirement, methods=["POST"]),
        Route(D + "/requirements/{requirement_id}", patch_requirement, methods=["PATCH"]),
        Route(D + "/requirements/{requirement_id}", delete_requirement, methods=["DELETE"]),
        Route(D + "/requirements/{requirement_id}/links/{document_id}", put_link, methods=["PUT"]),
        Route(D + "/events", events, methods=["GET"]),
        Route(D + "/export/report.pdf", export_report, methods=["GET"]),
        Route(D + "/export/package.zip", export_package, methods=["GET"]),
        Route(D + "/export/data.json", export_json, methods=["GET"]),
    ]
    if settings.frontend_dir.is_dir():
        routes.append(Mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="ui"))
    app = Starlette(
        routes=routes,
        exception_handlers={ApiError: handle_api_error, UploadRejected: handle_upload_rejected, NotFound: handle_not_found,
                            Conflict: handle_conflict, HTTPException: handle_http, Exception: handle_any},
    )
    app.state.service = Service(settings)
    app.state.settings = settings
    from .ingest.files import self_test

    app.state.reader_problems = self_test(settings)
    for problem in app.state.reader_problems:
        log.error("Auto-test de lecture : %s", problem)
    app.add_middleware(SecurityMiddleware, settings=settings)
    return app

