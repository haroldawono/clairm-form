"""HTTP integration and security tests against a real uvicorn server (stdlib client only)."""
from __future__ import annotations

import hashlib
import http.client
import io
import json
import socket
import time
import unittest
import zipfile
from datetime import date

import helpers
from clairform import samples

H = {"X-ClairForm": "1"}


class Client:
    def __init__(self, port: int):
        self.port = port

    def call(self, method, path, body=None, headers=None, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        hdrs = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            hdrs.setdefault("Content-Type", "application/json")
        conn.request(method, path, body=data, headers=hdrs)
        r = conn.getresponse()
        payload = r.read()
        conn.close()
        ctype = r.getheader("Content-Type") or ""
        parsed = json.loads(payload) if "json" in ctype and payload else payload
        return r.status, parsed, {k.lower(): v for k, v in r.getheaders()}


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = helpers.Server(CLAIRFORM_MAX_UPLOAD_MB=2).__enter__()
        cls.c = Client(cls.server.port)

    @classmethod
    def tearDownClass(cls):
        cls.server.__exit__(None, None, None)
        assert "Traceback" not in cls.server.output, cls.server.output

    def new_dossier(self, title="Dossier test", deadline=None):
        status, body, _ = self.c.call("POST", "/api/dossiers", {"title": title, "program": "", "deadline": deadline}, H)
        self.assertEqual(status, 201)
        return body["state"]["dossier"]["id"]

    def upload(self, did, role, name, data):
        from urllib.parse import quote

        return self.c.call("POST", f"/api/dossiers/{did}/documents?role={role}&filename={quote(name)}", raw=data,
                           headers={**H, "Content-Type": "application/octet-stream"})

    # ------------------------------------------------------------------ functional
    def test_health_and_ui(self):
        status, body, _ = self.c.call("GET", "/api/health")
        self.assertEqual((status, body["status"]), (200, "ok"))
        status, html, headers = self.c.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b'<div id="root">', html)
        self.assertIn("script-src 'self'", headers["content-security-policy"])

    def test_full_flow_over_http(self):
        did = self.new_dossier()
        status, body, _ = self.upload(did, "call", "règlement appel.pdf", samples.call_pdf(date.today()))
        self.assertEqual(status, 201, body)
        self.assertEqual(body["document"]["name"], "règlement appel.pdf")
        reqs = body["state"]["requirements"]
        self.assertGreaterEqual(len(reqs), 15)
        for name, data in samples.demo_pieces(date.today()):
            status, body, _ = self.upload(did, "piece", name, data)
            self.assertEqual(status, 201, body)
        state = body["state"]
        self.assertEqual(len([d for d in state["documents"] if d["role"] == "piece"]), 8)
        self.assertEqual(state["assessment"]["readiness"]["code"], "blocked")

        cond = next(r for r in state["requirements"] if r["kind"] == "condition")
        status, body, _ = self.c.call("PATCH", f"/api/dossiers/{did}/requirements/{cond['id']}", {"declared": True}, H)
        self.assertEqual(status, 200)
        self.assertEqual(body["state"]["assessment"]["requirements"][cond["id"]]["status"], "covered")

        cv_req = next(r for r in state["requirements"] if r["proof_type"] == "cv")
        cv_doc = next(d for d in state["documents"] if d["proof_type"] == "cv")
        status, body, _ = self.c.call("PUT", f"/api/dossiers/{did}/requirements/{cv_req['id']}/links/{cv_doc['id']}", {"decision": "rejected"}, H)
        self.assertEqual(body["state"]["assessment"]["requirements"][cv_req["id"]]["status"], "missing")
        status, body, _ = self.c.call("PUT", f"/api/dossiers/{did}/requirements/{cv_req['id']}/links/{cv_doc['id']}", {"decision": None}, H)
        self.assertEqual(body["state"]["assessment"]["requirements"][cv_req["id"]]["status"], "partial")

        status, body, _ = self.c.call("POST", f"/api/dossiers/{did}/requirements", {"label": "Photo du porteur", "kind": "document"}, H)
        self.assertEqual(status, 201)
        status, text, _ = self.c.call("GET", f"/api/dossiers/{did}/documents/{cv_doc['id']}/text")
        self.assertIn("Curriculum", text["pages"][0]["text"])

        status, pdf, headers = self.c.call("GET", f"/api/dossiers/{did}/export/report.pdf")
        self.assertEqual(status, 200)
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn("attachment", headers["content-disposition"])
        status, data, _ = self.c.call("GET", f"/api/dossiers/{did}/export/package.zip")
        z = zipfile.ZipFile(io.BytesIO(data))
        manifest = json.loads(z.read([n for n in z.namelist() if n.endswith("manifest.json")][0]))
        self.assertGreaterEqual(len(manifest["files"]), 7)
        for f in manifest["files"]:
            member = next(n for n in z.namelist() if n.endswith("/" + f["file"]))
            self.assertEqual(hashlib.sha256(z.read(member)).hexdigest(), f["sha256"], "files are packaged byte-for-byte")
        status, data, _ = self.c.call("GET", f"/api/dossiers/{did}/export/data.json")
        exported = data if isinstance(data, dict) else json.loads(data)
        self.assertTrue(exported["events"])

        status, body, _ = self.c.call("GET", f"/api/dossiers/{did}/documents/{cv_doc['id']}/file")
        self.assertEqual(status, 200)
        status, _, _ = self.c.call("DELETE", f"/api/dossiers/{did}", headers=H)
        self.assertEqual(status, 204)
        self.assertEqual(self.c.call("GET", f"/api/dossiers/{did}")[0], 404)

    def test_demo_endpoint(self):
        status, body, _ = self.c.call("POST", "/api/demo", headers=H)
        self.assertEqual(status, 201)
        self.assertTrue(body["state"]["dossier"]["is_demo"])
        status, body, _ = self.c.call("GET", "/api/dossiers")
        self.assertTrue(any(d["is_demo"] for d in body["dossiers"]))

    # ------------------------------------------------------------------ errors
    def test_upload_errors_are_explained(self):
        did = self.new_dossier()
        cases = [("vide.txt", b"", 400, "DOC-EMPTY"), ("faux.pdf", b"juste du texte", 400, "DOC-MISMATCH"),
                 ("virus.exe", b"MZ", 400, "DOC-FORMAT"), ("casse.pdf", b"%PDF-1.4 garbage", 422, "DOC-CORRUPT")]
        for name, data, status_expected, code in cases:
            status, body, _ = self.upload(did, "piece", name, data)
            self.assertEqual((status, body["error"]["code"]), (status_expected, code), name)
            self.assertTrue(body["error"]["message"])
        status, body, _ = self.upload(did, "call", "budget.xlsx", samples.budget(date.today(), True))
        self.assertEqual(body["error"]["code"], "DOC-FORMAT")
        status, body, _ = self.c.call("GET", f"/api/dossiers/{did}")
        self.assertEqual(body["state"]["documents"], [], "rejected files leave no trace")

    def test_size_limit_is_enforced_server_side(self):
        did = self.new_dossier()
        status, body, _ = self.upload(did, "piece", "gros.txt", b"a" * (2 * 1024 * 1024 + 10))
        self.assertEqual((status, body["error"]["code"]), (413, "DOC-TOO-LARGE"))

    def test_validation_errors(self):
        self.assertEqual(self.c.call("POST", "/api/dossiers", {"title": ""}, H)[0], 422)
        self.assertEqual(self.c.call("POST", "/api/dossiers", {"title": "x", "deadline": "31/12/2026"}, H)[0], 422)
        self.assertEqual(self.c.call("POST", "/api/dossiers", {"title": "x", "admin": True}, H)[0], 422)
        status, body, _ = self.c.call("POST", "/api/dossiers", raw=b"{not json", headers={**H, "Content-Type": "application/json"})
        self.assertEqual((status, body["error"]["code"]), (400, "BAD-JSON"))
        did = self.new_dossier()
        self.assertEqual(self.c.call("PATCH", f"/api/dossiers/{did}/requirements/R-00000000", {"declared": True}, H)[0], 404)
        self.assertEqual(self.c.call("PATCH", f"/api/dossiers/{did}/requirements/x'%20OR%20'1'%3D'1", {"declared": True}, H)[0], 404)
        self.assertEqual(self.c.call("POST", f"/api/dossiers/{did}/documents?role=admin&filename=a.txt", raw=b"x", headers=H)[0], 400)
        self.assertEqual(self.c.call("POST", f"/api/dossiers/{did}/requirements", {"label": "Abc", "kind": "document", "proof_type": "nope"}, H)[0], 409)

    def test_unknown_ids_and_traversal(self):
        for path in ("/api/dossiers/dos_0000000000000000", "/api/dossiers/..%2F..%2Fetc", "/api/dossiers/dos_zz/documents/doc_1/file",
                     "/api/nothing-here"):
            status, body, _ = self.c.call("GET", path)
            self.assertEqual(status, 404, path)
            self.assertIn("error", body)

    # ------------------------------------------------------------------ security
    def test_csrf_guard(self):
        self.assertEqual(self.c.call("POST", "/api/dossiers", {"title": "x"})[0], 403)
        status, body, _ = self.c.call("POST", "/api/dossiers", {"title": "x"}, {**H, "Origin": "https://evil.example"})
        self.assertEqual((status, body["error"]["code"]), (403, "CSRF"))
        self.assertEqual(self.c.call("POST", "/api/dossiers", {"title": "x"}, {**H, "Origin": f"http://127.0.0.1:{self.server.port}"})[0], 201)

    def test_dns_rebinding_guard(self):
        status, body, _ = self.c.call("GET", "/api/dossiers", headers={"Host": "attacker.example"})
        self.assertEqual((status, body["error"]["code"]), (400, "BAD-HOST"))

    def test_security_headers(self):
        _, _, h = self.c.call("GET", "/api/health")
        self.assertEqual(h["x-content-type-options"], "nosniff")
        self.assertEqual(h["x-frame-options"], "DENY")
        self.assertEqual(h["cache-control"], "no-store")
        self.assertIn("frame-ancestors 'none'", h["content-security-policy"])

    def test_filename_cannot_escape_storage(self):
        did = self.new_dossier()
        status, body, _ = self.upload(did, "piece", "../../../../tmp/evil.txt", b"contenu du document")
        self.assertEqual(status, 201)
        self.assertEqual(body["document"]["name"], "evil.txt")
        stored = list((helpers.Path(self.server.data_dir) / "files" / did).iterdir())
        self.assertEqual([p.suffix for p in stored], [".bin"])
        self.assertTrue(all(p.name.startswith("doc_") for p in stored))

    def test_html_in_names_is_returned_as_data(self):
        did = self.new_dossier(title="<img src=x onerror=alert(1)>")
        status, body, _ = self.c.call("GET", f"/api/dossiers/{did}")
        self.assertEqual(body["state"]["dossier"]["title"], "<img src=x onerror=alert(1)>")  # escaped by React at render time

    def test_interrupted_upload_stores_nothing(self):
        did = self.new_dossier()
        s = socket.create_connection(("127.0.0.1", self.server.port))
        s.sendall((f"POST /api/dossiers/{did}/documents?role=piece&filename=coupe.txt HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                   "X-ClairForm: 1\r\nContent-Type: application/octet-stream\r\nContent-Length: 100000\r\n\r\n").encode() + b"x" * 5000)
        time.sleep(0.3)
        s.close()
        time.sleep(0.5)
        status, body, _ = self.c.call("GET", f"/api/dossiers/{did}")
        self.assertEqual(body["state"]["documents"], [])

    def test_cancel_upload_is_authoritative(self):
        did = self.new_dossier()
        path = f"/api/dossiers/{did}/documents?role=piece&filename=a.txt&upload_id=abcdef123456"
        status, body, _ = self.c.call("POST", path, raw=b"premier document", headers=H)
        self.assertEqual(status, 201)
        status, body, _ = self.c.call("POST", f"/api/dossiers/{did}/uploads/abcdef123456/cancel", headers=H)
        self.assertEqual(status, 200)
        self.assertTrue(body["removed_after_storage"], "a completed upload is removed when cancelled late")
        self.assertEqual(body["state"]["documents"], [])
        self.c.call("POST", f"/api/dossiers/{did}/uploads/zzzzzzzz9999/cancel", headers=H)
        status, body, _ = self.c.call("POST", path.replace("abcdef123456", "zzzzzzzz9999"), raw=b"second document", headers=H)
        self.assertEqual((status, body["error"]["code"]), (409, "UPLOAD-CANCELLED"), "an upload cancelled early is discarded on arrival")
        self.assertEqual(self.c.call("POST", path.replace("abcdef123456", "bad%20id!"), raw=b"x", headers=H)[0], 400)

    def test_no_stack_trace_in_errors(self):
        did = self.new_dossier()
        _, body, _ = self.upload(did, "piece", "casse.docx", b"PK\x03\x04garbage")
        self.assertNotIn("Traceback", json.dumps(body))
        self.assertNotIn("File \"", json.dumps(body))


class PublicMode(unittest.TestCase):
    """Online deployment: every browser gets a private space (cookie), nobody can reach another space."""

    def call(self, srv, method, path, body=None, cookie=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=60)
        h = {**H}
        if body is not None:
            h["Content-Type"] = "application/json"
        if cookie:
            h["Cookie"] = cookie
        if host:
            h["Host"] = host
        conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        r = conn.getresponse()
        data = r.read()
        conn.close()
        return r.status, (json.loads(data) if data and "json" in (r.getheader("Content-Type") or "") else data), r.getheader("Set-Cookie")

    def test_isolation_between_visitors(self):
        with helpers.Server(CLAIRFORM_MODE="public") as srv:
            status, body, cookie = self.call(srv, "GET", "/api/health", host="clairform.example.org")
            self.assertEqual((status, body["mode"]), (200, "public"))
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=Lax", cookie)
            alice = cookie.split(";")[0]
            _, _, bob_cookie = self.call(srv, "GET", "/api/health")
            bob = bob_cookie.split(";")[0]
            self.assertNotEqual(alice, bob)
            status, body, _ = self.call(srv, "POST", "/api/dossiers", {"title": "Dossier d'Alice"}, cookie=alice)
            self.assertEqual(status, 201)
            did = body["state"]["dossier"]["id"]
            self.assertEqual(len(self.call(srv, "GET", "/api/dossiers", cookie=alice)[1]["dossiers"]), 1)
            self.assertEqual(self.call(srv, "GET", "/api/dossiers", cookie=bob)[1]["dossiers"], [])
            for method, path in (("GET", f"/api/dossiers/{did}"), ("DELETE", f"/api/dossiers/{did}"),
                                 ("GET", f"/api/dossiers/{did}/export/report.pdf")):
                self.assertEqual(self.call(srv, method, path, cookie=bob)[0], 404, path)
            self.assertEqual(self.call(srv, "GET", f"/api/dossiers/{did}", cookie=alice)[0], 200)

    def test_allowed_hosts_are_enforced_when_configured(self):
        with helpers.Server(CLAIRFORM_MODE="public", CLAIRFORM_ALLOWED_HOSTS="clairform.example.org") as srv:
            self.assertEqual(self.call(srv, "GET", "/api/health", host="clairform.example.org")[0], 200)
            self.assertEqual(self.call(srv, "GET", "/api/health", host="evil.example")[0], 400)

    def test_iframe_embedding_option(self):
        with helpers.Server(CLAIRFORM_MODE="public", CLAIRFORM_FRAME_ANCESTORS="https://huggingface.co") as srv:
            conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=30)
            conn.request("GET", "/")
            r = conn.getresponse()
            r.read()
            self.assertIn("frame-ancestors https://huggingface.co", r.getheader("Content-Security-Policy"))
            self.assertIsNone(r.getheader("X-Frame-Options"))
            self.assertIn("SameSite=None; Secure", r.getheader("Set-Cookie"))

    def test_dossier_quota(self):
        with helpers.Server(CLAIRFORM_MODE="public", CLAIRFORM_MAX_DOSSIERS=2) as srv:
            _, _, cookie = self.call(srv, "GET", "/api/health")
            c = cookie.split(";")[0]
            for _ in range(2):
                self.assertEqual(self.call(srv, "POST", "/api/dossiers", {"title": "x"}, cookie=c)[0], 201)
            status, body, _ = self.call(srv, "POST", "/api/dossiers", {"title": "x"}, cookie=c)
            self.assertEqual((status, body["error"]["code"]), (409, "WORKSPACE-FULL"))


class RateLimit(unittest.TestCase):
    def test_rate_limit(self):
        with helpers.Server(CLAIRFORM_RATE_LIMIT=20) as srv:
            c = Client(srv.port)
            statuses = [c.call("GET", "/api/health")[0] for _ in range(25)]
            first = statuses.index(429)
            self.assertGreaterEqual(first, 15, "the limit is not hit too early (startup probes count too)")
            self.assertTrue(all(x == 429 for x in statuses[first:]), statuses)
            status, body, _ = c.call("GET", "/api/health")
            self.assertEqual(body["error"]["code"], "RATE-LIMIT")


if __name__ == "__main__":
    unittest.main()
