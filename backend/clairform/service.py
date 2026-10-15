"""Application service: the only layer that combines storage, file reading and analysis."""
from __future__ import annotations

import secrets
from dataclasses import asdict
from datetime import date
from pathlib import Path

from . import i18n, samples
from .analysis import taxonomy
from .analysis.assessment import assess
from .analysis.call_parser import parse_call
from .analysis.evidence import document_facts
from .config import CALL_EXTENSIONS, Settings
from .db import Database
from .ingest.files import ERROR_MESSAGES, UploadRejected, extension_of, extract, safe_display_name


class NotFound(Exception):
    pass


class Conflict(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def light_document(doc: dict) -> dict:
    facts = dict(doc.get("facts") or {})
    facts.pop("call_facts", None)
    return {
        "id": doc["id"], "role": doc["role"], "name": doc["name"], "ext": doc["ext"], "size": doc["size"],
        "sha256": doc["sha256"], "page_count": doc["page_count"], "has_text": doc["has_text"],
        "proof_type": doc["proof_type"], "proof_type_label": taxonomy.label(doc["proof_type"]),
        "proof_type_source": doc["proof_type_source"], "proof_confidence": doc["proof_confidence"],
        "proof_reasons": [i18n.reason(x) for x in (doc["proof_reasons"] or [])], "facts": facts, "created_at": doc["created_at"],
        "requirement_count": (doc.get("facts") or {}).get("requirement_count"),
    }


class Service:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.db = Database(settings.db_path)
        settings.files_dir.mkdir(parents=True, exist_ok=True)
        import threading

        self._upload_lock = threading.Lock()
        self._cancelled: dict[str, float] = {}

    # ------------------------------------------------------------------ helpers
    def _dossier(self, dossier_id: str) -> dict:
        d = self.db.dossier(dossier_id)
        if not d:
            raise NotFound("dossier")
        return d

    def _file_path(self, dossier_id: str, doc_id: str) -> Path:
        # Both ids are generated server-side and validated by the router's regex; never user filenames.
        return self.settings.files_dir / dossier_id / f"{doc_id}.bin"

    # ------------------------------------------------------------------ dossiers
    def owns(self, dossier_id: str, workspace: str) -> bool:
        d = self.db.dossier(dossier_id)
        return bool(d) and d.get("workspace", "local") == workspace

    def purge_inactive(self, days: int) -> int:
        """Public mode: delete dossiers untouched for `days` days (files included)."""
        from datetime import datetime, timedelta, timezone

        limit = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
        ids = self.db.stale_dossiers(limit)
        for did in ids:
            self.delete_dossier(did)
        return len(ids)

    def list_dossiers(self, workspace: str = "local") -> list[dict]:
        out = []
        for d in self.db.dossiers(workspace):
            state = self.assessment(d["id"])
            out.append({**self._public_dossier(d), "score": state["score"], "readiness": state["readiness"],
                        "counts": state["counts"], "document_count": len(self.db.documents(d["id"]))})
        return out

    def _public_dossier(self, d: dict) -> dict:
        return {k: d[k] for k in ("id", "title", "program", "deadline", "deadline_source", "call_facts", "is_demo", "created_at", "updated_at")}

    def create_dossier(self, title: str, program: str = "", deadline: str | None = None, is_demo: bool = False, workspace: str = "local") -> dict:
        if workspace != "local" and len(self.db.dossiers(workspace)) >= self.settings.max_dossiers_per_workspace:
            raise Conflict("WORKSPACE-FULL", f"Cet espace contient déjà {self.settings.max_dossiers_per_workspace} dossiers : supprimez-en un pour en créer un autre.")
        d = self.db.create_dossier(new_id("dos"), title, program, deadline, is_demo, workspace)
        self.db.log(d["id"], "dossier.created", {"title": title})
        return self._public_dossier(d)

    def update_dossier(self, dossier_id: str, **fields) -> dict:
        self._dossier(dossier_id)
        if "deadline" in fields:
            fields["deadline_source"] = "user" if fields["deadline"] else None
        d = self.db.update_dossier(dossier_id, **fields)
        self.db.log(dossier_id, "dossier.updated", {k: v for k, v in fields.items() if k != "call_facts"})
        return self._public_dossier(d)

    def delete_dossier(self, dossier_id: str) -> None:
        self._dossier(dossier_id)
        folder = self.settings.files_dir / dossier_id
        self.db.delete_dossier(dossier_id)
        if folder.is_dir():
            for f in folder.glob("*.bin"):
                f.unlink(missing_ok=True)
            folder.rmdir()

    # ------------------------------------------------------------------ documents
    def cancel_upload(self, dossier_id: str, upload_id: str) -> bool:
        """Cancel an upload whatever its stage: a later completion is discarded, an already stored file is removed."""
        import time

        self._dossier(dossier_id)
        with self._upload_lock:
            now = time.time()
            self._cancelled = {k: v for k, v in self._cancelled.items() if now - v < 3600}
            self._cancelled[upload_id] = now
            stored = [d for d in self.db.documents(dossier_id) if (d.get("meta") or {}).get("upload_id") == upload_id]
        for d in stored:
            self.delete_document(dossier_id, d["id"])
        if stored:
            self.db.log(dossier_id, "upload.cancelled_after_storage", {"upload_id": upload_id})
        return bool(stored)

    def add_document(self, dossier_id: str, role: str, filename: str, data: bytes, upload_id: str | None = None) -> dict:
        dossier = self._dossier(dossier_id)
        name = safe_display_name(filename)
        ext = extension_of(name)
        docs = self.db.documents(dossier_id)
        if len(docs) >= self.settings.max_documents_per_dossier:
            raise Conflict("DOSSIER-FULL", f"Ce dossier contient déjà {len(docs)} documents, le maximum autorisé.")
        if role == "call":
            if ext not in CALL_EXTENSIONS:
                raise UploadRejected("DOC-FORMAT", "Pour l'appel, utilisez un PDF, un document Word (.docx) ou un fichier texte.")
            if sum(1 for d in docs if d["role"] == "call") >= self.settings.max_call_documents:
                raise Conflict("CALL-FULL", f"Un dossier accepte au plus {self.settings.max_call_documents} documents d'appel.")
        extracted = extract(name, data, self.settings)
        doc_id = new_id("doc")
        record = {
            "id": doc_id, "dossier_id": dossier_id, "role": role, "name": name, "ext": extracted.ext, "size": len(data),
            "sha256": extracted.sha256, "page_count": extracted.page_count, "has_text": extracted.has_text,
            "pages": extracted.pages, "tables": extracted.tables, "meta": {**extracted.meta, "upload_id": upload_id}, "created_at": None,
        }
        from .db import now_iso

        record["created_at"] = now_iso()
        if role == "call":
            if not extracted.has_text:
                raise UploadRejected("DOC-NO-TEXT", ERROR_MESSAGES["DOC-NO-TEXT"] + " ClairForm n'intègre pas d'OCR : utilisez la version "
                                     "numérique du règlement (PDF texte, Word) ou copiez son texte dans un fichier .txt.", 422)
            reqs, facts = parse_call(doc_id, extracted.pages)
            record["facts"] = {"call_facts": [asdict(f) | {"document_id": doc_id} for f in facts], "requirement_count": len(reqs)}
            self._store(record, data)
            self.db.replace_extracted_requirements(dossier_id, doc_id, [self._req_row(r) for r in reqs])
            self._refresh_call_facts(dossier_id)
            self.db.log(dossier_id, "call.added", {"document_id": doc_id, "name": name, "requirements": len(reqs)})
        else:
            ptype, confidence, reasons = taxonomy.classify_document(name, extracted.text)
            record.update(proof_type=ptype, proof_type_source="auto", proof_confidence=confidence, proof_reasons=reasons)
            record["facts"] = document_facts(ptype, extracted.text, extracted.tables, extracted.page_count, extracted.meta)
            self._store(record, data)
            self.db.log(dossier_id, "piece.added", {"document_id": doc_id, "name": name, "proof_type": ptype})
        return light_document(self.db.document(dossier_id, doc_id))

    def _store(self, record: dict, data: bytes) -> None:
        with self._upload_lock:
            if record["meta"].get("upload_id") and record["meta"]["upload_id"] in self._cancelled:
                raise Conflict("UPLOAD-CANCELLED", "Import annulé : le fichier n'a pas été ajouté.")
            self._store_unlocked(record, data)

    def _store_unlocked(self, record: dict, data: bytes) -> None:
        path = self._file_path(record["dossier_id"], record["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        try:
            self.db.add_document(record)
        except Exception:
            path.unlink(missing_ok=True)
            raise

    @staticmethod
    def _req_row(r) -> dict:
        return {"id": r.id, "label": r.label, "statement": r.statement, "kind": r.kind, "proof_type": r.proof_type,
                "required": int(r.required), "critical": int(r.critical), "source_page": r.source_page, "excerpt": r.excerpt,
                "section": r.section, "reason": r.reason, "constraints": r.constraints, "min_count": r.min_count}

    def _refresh_call_facts(self, dossier_id: str) -> None:
        dossier = self._dossier(dossier_id)
        merged: dict[str, dict] = {}
        for doc in self.db.documents(dossier_id, "call"):
            for f in (doc["facts"] or {}).get("call_facts", []):
                merged.setdefault(f["key"], f)
        facts = list(merged.values())
        fields: dict = {"call_facts": facts}
        deadline = merged.get("deadline")
        if dossier["deadline_source"] != "user":
            fields["deadline"] = deadline["value"] if deadline else None
            fields["deadline_source"] = "call" if deadline else None
        self.db.update_dossier(dossier_id, **fields)

    def documents(self, dossier_id: str) -> list[dict]:
        self._dossier(dossier_id)
        return [light_document(d) for d in self.db.documents(dossier_id)]

    def document_text(self, dossier_id: str, doc_id: str) -> dict:
        doc = self.db.document(dossier_id, doc_id)
        if not doc:
            raise NotFound("document")
        return {"id": doc_id, "name": doc["name"], "role": doc["role"], "pages": doc["pages"], "has_text": doc["has_text"]}

    def document_file(self, dossier_id: str, doc_id: str) -> tuple[dict, bytes]:
        doc = self.db.document(dossier_id, doc_id)
        if not doc:
            raise NotFound("document")
        path = self._file_path(dossier_id, doc_id)
        if not path.is_file():
            raise NotFound("fichier")
        return doc, path.read_bytes()

    def update_document(self, dossier_id: str, doc_id: str, proof_type: str | None) -> dict:
        doc = self.db.document(dossier_id, doc_id)
        if not doc or doc["role"] != "piece":
            raise NotFound("document")
        if proof_type not in taxonomy.LABELS:
            raise Conflict("TYPE-UNKNOWN", "Type de pièce inconnu.")
        text = "\n\n".join(p["text"] for p in doc["pages"])
        facts = document_facts(proof_type, text, doc["tables"], doc["page_count"], doc["meta"])
        self.db.update_document(dossier_id, doc_id, proof_type=proof_type, proof_type_source="user", proof_confidence="high",
                                proof_reasons=["type choisi par vous"], facts=facts)
        self.db.log(dossier_id, "piece.typed", {"document_id": doc_id, "proof_type": proof_type})
        return light_document(self.db.document(dossier_id, doc_id))

    def delete_document(self, dossier_id: str, doc_id: str) -> None:
        doc = self.db.document(dossier_id, doc_id)
        if not doc:
            raise NotFound("document")
        if doc["role"] == "call":
            self.db.replace_extracted_requirements(dossier_id, doc_id, [])
        self.db.delete_document(dossier_id, doc_id)
        self._file_path(dossier_id, doc_id).unlink(missing_ok=True)
        if doc["role"] == "call":
            self._refresh_call_facts(dossier_id)
        self.db.log(dossier_id, f"{doc['role']}.deleted", {"document_id": doc_id, "name": doc["name"]})

    # ------------------------------------------------------------------ requirements
    def add_requirement(self, dossier_id: str, label: str, kind: str, proof_type: str | None, critical: bool, required: bool) -> dict:
        self._dossier(dossier_id)
        if proof_type and proof_type not in taxonomy.BY_CODE:
            raise Conflict("TYPE-UNKNOWN", "Type de pièce inconnu.")
        rid = "M-" + secrets.token_hex(4)
        self.db.add_requirement(dossier_id, {"id": rid, "origin": "manual", "label": label, "statement": label, "kind": kind,
                                             "proof_type": proof_type if kind == "document" else None, "critical": int(critical),
                                             "required": int(required), "reviewed": 1, "reason": "ajoutée par vous"})
        self.db.log(dossier_id, "requirement.added", {"requirement_id": rid})
        return self.db.requirement(dossier_id, rid)

    def update_requirement(self, dossier_id: str, rid: str, fields: dict) -> dict:
        req = self.db.requirement(dossier_id, rid)
        if not req:
            raise NotFound("exigence")
        if "proof_type" in fields and fields["proof_type"] and fields["proof_type"] not in taxonomy.BY_CODE:
            raise Conflict("TYPE-UNKNOWN", "Type de pièce inconnu.")
        if fields.get("kind") and fields["kind"] != "document":
            fields["proof_type"] = None
        updated = self.db.update_requirement(dossier_id, rid, **fields)
        self.db.log(dossier_id, "requirement.updated", {"requirement_id": rid, "fields": sorted(fields)})
        return updated

    def delete_requirement(self, dossier_id: str, rid: str) -> None:
        req = self.db.requirement(dossier_id, rid)
        if not req:
            raise NotFound("exigence")
        if req["origin"] != "manual":
            raise Conflict("REQ-EXTRACTED", "Une exigence lue dans l'appel ne se supprime pas : écartez-la si elle ne vous concerne pas.")
        self.db.delete_requirement(dossier_id, rid)
        self.db.log(dossier_id, "requirement.deleted", {"requirement_id": rid})

    def set_link(self, dossier_id: str, rid: str, doc_id: str, decision: str | None) -> None:
        req = self.db.requirement(dossier_id, rid)
        doc = self.db.document(dossier_id, doc_id)
        if not req or not doc or doc["role"] != "piece":
            raise NotFound("lien")
        if req["kind"] != "document":
            raise Conflict("LINK-KIND", "Seules les exigences de type « pièce » reçoivent des documents.")
        self.db.set_link(dossier_id, rid, doc_id, decision)
        self.db.log(dossier_id, "link." + (decision or "reset"), {"requirement_id": rid, "document_id": doc_id})

    # ------------------------------------------------------------------ assessment
    def assessment(self, dossier_id: str, today: date | None = None) -> dict:
        d = self._dossier(dossier_id)
        return assess(d, self.db.documents(dossier_id), self.db.requirements(dossier_id), self.db.links(dossier_id), today)

    def state(self, dossier_id: str) -> dict:
        d = self._dossier(dossier_id)
        requirements = self.db.requirements(dossier_id)
        docs = self.db.documents(dossier_id)
        return {
            "dossier": self._public_dossier(d),
            "documents": [light_document(x) for x in docs],
            "requirements": [{k: v for k, v in r.items() if k not in {"dossier_id"}} | {"proof_type_label": taxonomy.label(r["proof_type"]), "reason": i18n.reason(r.get("reason"))}
                             for r in requirements],
            "assessment": assess(d, docs, requirements, self.db.links(dossier_id)),
            "proof_types": taxonomy.types_payload() + [{"code": "other", "label": taxonomy.label("other"), "external": False}],
        }

    def events(self, dossier_id: str) -> list[dict]:
        self._dossier(dossier_id)
        return self.db.events(dossier_id)

    # ------------------------------------------------------------------ demo
    def create_demo(self, today: date | None = None, workspace: str = "local") -> dict:
        today = today or date.today()
        d = self.create_dossier(samples.DEMO_TITLE, samples.PROGRAM_NAME, None, is_demo=True, workspace=workspace)
        call, pieces = samples.demo_bundle(today)
        self.add_document(d["id"], "call", "appel_a_projets_tremplin_impact.pdf", call)
        for name, data in pieces:
            self.add_document(d["id"], "piece", name, data)
        self.db.log(d["id"], "demo.created", {})
        return self._public_dossier(self._dossier(d["id"]))
