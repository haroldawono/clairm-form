"""Service-level tests: ingestion, safety of file reading, assessment rules and the complete demo journey."""
from __future__ import annotations

import io
import unittest
import zipfile
from dataclasses import replace
from datetime import date, timedelta

import helpers
from clairform import samples
from clairform.analysis.assessment import assess
from clairform.ingest.files import UploadRejected, extract, safe_display_name
from clairform.service import Conflict, NotFound, Service


def svc(**overrides) -> Service:
    return Service(helpers.make_settings(**overrides))


def codes(state) -> list[str]:
    return [c["code"] for c in state["assessment"]["checks"]]


class Ingestion(unittest.TestCase):
    def setUp(self):
        from clairform.ingest.files import clear_cache

        clear_cache()
        self.s = helpers.make_settings()

    def reject(self, name, data, code, settings=None):
        with self.assertRaises(UploadRejected) as ctx:
            extract(name, data, settings or self.s)
        self.assertEqual(ctx.exception.code, code)
        return ctx.exception

    def test_rejections(self):
        self.reject("a.pdf", b"", "DOC-EMPTY")
        self.reject("a.exe", b"MZ", "DOC-FORMAT")
        self.reject("a.pdf", b"hello world", "DOC-MISMATCH")
        self.reject("a.docx", b"%PDF-1.4 not a zip", "DOC-MISMATCH")
        self.reject("a.png", b"GIF89a", "DOC-MISMATCH")
        self.reject("a.txt", b"\x00\x01\x02binary", "DOC-MISMATCH")

    def test_corrupt_pdf(self):
        err = self.reject("a.pdf", b"%PDF-1.7\n1 0 obj << /Type /Catalog >> broken", "DOC-CORRUPT")
        self.assertNotIn("Traceback", err.message)

    def test_encrypted_pdf(self):
        from pypdf import PdfReader, PdfWriter

        w = PdfWriter()
        w.append(PdfReader(io.BytesIO(helpers.text_pdf([["secret"]]))))
        w.encrypt("motdepasse")
        out = io.BytesIO()
        w.write(out)
        self.reject("a.pdf", out.getvalue(), "DOC-ENCRYPTED")

    def test_too_many_pages(self):
        self.reject("a.pdf", helpers.text_pdf([["p"]] * 6), "DOC-TOO-MANY-PAGES", replace(self.s, max_pdf_pages=5))

    def test_size_limit(self):
        err = self.reject("a.txt", b"x" * 2048, "DOC-TOO-LARGE", replace(self.s, max_upload_bytes=1024))
        self.assertEqual(err.status, 413)

    def test_zip_bomb_and_traversal(self):
        bomb = io.BytesIO()
        with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("word/document.xml", "<w/>")
            z.writestr("big.bin", b"\0" * (130 * 1024 * 1024))
        self.reject("a.docx", bomb.getvalue(), "DOC-UNSAFE")
        trav = io.BytesIO()
        with zipfile.ZipFile(trav, "w") as z:
            z.writestr("word/document.xml", "<w/>")
            z.writestr("../../evil.txt", "x")
        self.reject("a.docx", trav.getvalue(), "DOC-UNSAFE")

    def test_timeout_kills_the_reader(self):
        self.reject("a.txt", b"bonjour", "DOC-TIMEOUT", replace(self.s, extraction_timeout_s=0))

    def test_formats_accepted(self):
        self.assertTrue(extract("n.pdf", samples.project_note(date.today(), 2), self.s).has_text)
        x = extract("b.xlsx", samples.budget(date.today(), True), self.s)
        self.assertTrue(x.tables and x.tables[0]["rows"])
        d = extract("a.docx", helpers.docx_bytes(["Bonjour", "Le monde"]), self.s)
        self.assertIn("Le monde", d.text)
        c = extract("t.csv", "Poste;Montant\nLoyer;100\nTotal;100\n".encode(), self.s)
        self.assertEqual(c.tables[0]["rows"][2], ["Total", "100"])
        t = extract("t.txt", "Déclaration signée".encode("cp1252"), self.s)
        self.assertIn("Déclaration", t.text)
        import sys

        sys.path.insert(0, str(helpers.ROOT / "scripts"))
        from make_samples import photo_jpg, scanned_pdf

        self.assertFalse(extract("p.jpg", photo_jpg(), self.s).has_text)
        self.assertFalse(extract("s.pdf", scanned_pdf(), self.s).has_text)

    def test_display_name_is_sanitised(self):
        self.assertEqual(safe_display_name("../../etc/passwd"), "passwd")
        self.assertEqual(safe_display_name("C:\\Users\\x\\<script>.pdf"), "script.pdf")
        self.assertEqual(safe_display_name(""), "document")


class ReaderRobustness(unittest.TestCase):
    """Regression: a broken child process (missing libraries, cannot spawn) must never be reported as a corrupt file."""

    def setUp(self):
        from clairform.ingest import files

        self.files = files
        files._MODE.update(isolated=True, reason="")
        files.clear_cache()
        self.s = helpers.make_settings()

    def tearDown(self):
        self.files._MODE.update(isolated=True, reason="")

    def test_fallback_when_child_cannot_start(self):
        from unittest import mock

        with mock.patch.object(self.files.subprocess, "run", side_effect=OSError("spawn refusé")):
            x = extract("appel.pdf", samples.call_pdf(date.today()), self.s)
        self.assertTrue(x.has_text)
        self.assertFalse(self.files.reader_status()["isolated"])

    def test_fallback_when_child_lacks_libraries(self):
        from unittest import mock
        import subprocess as sp

        fake = sp.CompletedProcess([], 0, b'{"ok": false, "code": "READER-SETUP", "detail": "ModuleNotFoundError: pypdf"}', b"")
        with mock.patch.object(self.files.subprocess, "run", return_value=fake):
            x = extract("b.xlsx", samples.budget(date.today(), True), self.s)
        self.assertTrue(x.tables)

    def test_fallback_when_child_crashes(self):
        from unittest import mock
        import subprocess as sp

        fake = sp.CompletedProcess([], 1, b"", b"Fatal Python error: init_import_site")
        with mock.patch.object(self.files.subprocess, "run", return_value=fake):
            x = extract("a.docx", helpers.docx_bytes(["Pièces à fournir"]), self.s)
        self.assertIn("Pièces", x.text)

    def test_user_site_installation(self):
        """Libraries reachable only through the parent's sys.path (pip install --user) are found by the reader."""
        import os, subprocess, sys, tempfile, json

        venv = tempfile.mkdtemp(prefix="cf-bare-venv-")
        subprocess.run([sys.executable, "-m", "venv", "--without-pip", venv], check=True)
        py = os.path.join(venv, "Scripts" if os.name == "nt" else "bin", "python")
        env = {**os.environ, "PYTHONPATH": os.pathsep.join(p for p in sys.path if p), "CLAIRFORM_DATA_DIR": tempfile.mkdtemp()}
        code = ("import sys, json; sys.path.insert(0, %r); from datetime import date; from clairform import samples; "
                "from clairform.config import Settings; from clairform.ingest.files import extract, reader_status; "
                "x = extract('a.pdf', samples.call_pdf(date.today()), Settings()); print(json.dumps([len(x.pages), reader_status()]))"
                % str(helpers.BACKEND))
        out = subprocess.run([py, "-c", code], env=env, capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr[-2000:])
        pages, status = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertEqual(pages, 2)
        self.assertTrue(status["isolated"], "the isolated reader itself works, no fallback needed")

    def test_lone_surrogates_do_not_break_reading(self):
        import json
        from clairform.ingest.worker import _clean

        cleaned = _clean("Texte \ud800 extrait d'un PDF", 1000)
        json.dumps(cleaned).encode("utf-8")
        cleaned.encode("utf-8")
        self.assertIn("extrait", cleaned)

    def test_inprocess_reader_option(self):
        from dataclasses import replace
        from unittest import mock

        with mock.patch.object(self.files.subprocess, "run", side_effect=AssertionError("no child process expected")):
            x = extract("b.xlsx", samples.budget(date.today(), True), replace(self.s, reader="inprocess"))
        self.assertTrue(x.tables)
        self.assertTrue(self.files.reader_status()["isolated"], "the option does not count as a failure")

    def test_identical_files_are_read_once(self):
        from unittest import mock

        data = samples.budget(date.today(), False)
        extract("a.xlsx", data, self.s)
        with mock.patch.object(self.files.subprocess, "run", side_effect=AssertionError("cache expected")):
            self.assertTrue(extract("copie.xlsx", data, self.s).tables)

    def test_self_test_passes(self):
        from clairform.ingest.files import self_test

        self.assertEqual(self_test(self.s), [])


class Assessment(unittest.TestCase):
    """Rules tested on hand-built states so each check is exercised in isolation."""

    def doc(self, id, ptype, facts=None, pages=1, ext="pdf", sha=None, has_text=True):
        return {"id": id, "role": "piece", "name": f"{id}.{ext}", "ext": ext, "sha256": sha or id, "page_count": pages, "has_text": has_text,
                "pages": [{"n": 1, "text": "texte"}], "proof_type": ptype, "proof_type_source": "auto", "proof_confidence": "high",
                "facts": facts or {}}

    def req(self, id, kind="document", ptype=None, constraints=None, critical=False, required=True, min_count=1, declared=False):
        return {"id": id, "label": id, "statement": id, "kind": kind, "proof_type": ptype, "required": required, "critical": critical,
                "status": "active", "declared": declared, "constraints": constraints or {}, "min_count": min_count}

    def run_(self, reqs, docs, facts=None, links=None, deadline=None, today=date(2026, 10, 12)):
        dossier = {"call_facts": facts or [], "deadline": deadline, "deadline_source": "call" if deadline else None}
        return assess(dossier, docs, reqs, links or [], today)

    def test_missing_then_covered(self):
        r = self.run_([self.req("R1", ptype="cv")], [])
        self.assertEqual(r["requirements"]["R1"]["status"], "missing")
        self.assertEqual(r["score"], 0)
        r = self.run_([self.req("R1", ptype="cv")], [self.doc("d1", "cv")])
        self.assertEqual(r["requirements"]["R1"]["status"], "covered")
        self.assertEqual((r["score"], r["readiness"]["code"]), (100, "ready"))

    def test_medium_confidence_is_to_verify_and_user_confirmation_covers(self):
        d = self.doc("d1", "cv")
        d["proof_confidence"] = "medium"
        r = self.run_([self.req("R1", ptype="cv")], [d])
        self.assertEqual(r["requirements"]["R1"]["status"], "to_verify")
        self.assertEqual(r["score"], 50)
        r = self.run_([self.req("R1", ptype="cv")], [d], links=[{"requirement_id": "R1", "document_id": "d1", "decision": "confirmed"}])
        self.assertEqual(r["requirements"]["R1"]["status"], "covered")

    def test_rejected_link_is_not_used(self):
        r = self.run_([self.req("R1", ptype="cv")], [self.doc("d1", "cv")], links=[{"requirement_id": "R1", "document_id": "d1", "decision": "rejected"}])
        self.assertEqual(r["requirements"]["R1"]["status"], "missing")
        self.assertEqual(r["requirements"]["R1"]["rejected"], ["d1"])

    def test_min_count_needs_distinct_files(self):
        req = self.req("R1", ptype="cv", min_count=2)
        r = self.run_([req], [self.doc("a", "cv", sha="same"), self.doc("b", "cv", sha="same")])
        self.assertEqual(r["requirements"]["R1"]["status"], "partial")
        self.assertIn("DUPLICATE", [c["code"] for c in r["checks"]])
        r = self.run_([req], [self.doc("a", "cv"), self.doc("b", "cv")])
        self.assertEqual(r["requirements"]["R1"]["status"], "covered")

    def test_page_limit(self):
        r = self.run_([self.req("R1", ptype="project_note", constraints={"max_pages": 10})], [self.doc("n", "project_note", pages=12)])
        self.assertEqual(r["requirements"]["R1"]["status"], "problem")
        self.assertIn("PAGE_LIMIT", [c["code"] for c in r["checks"]])
        r = self.run_([self.req("R1", ptype="project_note", constraints={"max_pages": 10})], [self.doc("n", "project_note", pages=10)])
        self.assertEqual(r["requirements"]["R1"]["status"], "covered")

    def test_freshness_against_deadline(self):
        req = self.req("R1", ptype="registration", constraints={"max_age_months": 3})
        old = self.doc("r", "registration", {"issue_date": "2026-06-01"})
        r = self.run_([req], [old], deadline="2026-11-21")
        self.assertIn("STALE", [c["code"] for c in r["checks"]])
        fresh = self.doc("r", "registration", {"issue_date": "2026-09-01"})
        self.assertEqual(self.run_([req], [fresh], deadline="2026-11-21")["requirements"]["R1"]["status"], "covered")
        undated = self.doc("r", "registration", {})
        self.assertIn("DATE_NOT_FOUND", [c["code"] for c in self.run_([req], [undated])["checks"]])

    def test_expired_identity(self):
        r = self.run_([self.req("R1", ptype="identity")], [self.doc("i", "identity", {"expiry_date": "2026-10-01"})])
        self.assertIn("EXPIRED", [c["code"] for c in r["checks"]])

    def test_budget_checks(self):
        budget = {"budget": {"currency": "EUR", "totals": [{"label": "Total", "amount": 1000, "lines_sum": 900, "line_count": 2, "is_expenses": True}],
                             "expense_total": 1000, "requested": {"label": "Montant demandé", "amount": 60000}, "cofinancing": {"amount": 100, "lines": ["Apport"]}}}
        facts = [{"key": "max_amount", "value": 50000, "currency": "EUR", "page": 1, "excerpt": "plafond", "document_id": "c"},
                 {"key": "min_cofinancing_pct", "value": 20, "currency": None, "page": 1, "excerpt": "cofinancement", "document_id": "c"}]
        rules = [self.req("RA", kind="rule", constraints={"rule": "max_amount"}), self.req("RB", kind="rule", constraints={"rule": "min_cofinancing_pct"}),
                 self.req("R1", ptype="budget")]
        r = self.run_(rules, [self.doc("b", "budget", budget, ext="xlsx")], facts=facts)
        got = [c["code"] for c in r["checks"]]
        for code in ("BUDGET_TOTAL", "BUDGET_CEILING", "COFINANCING"):
            self.assertIn(code, got)
        self.assertEqual(r["requirements"]["RA"]["status"], "problem")
        self.assertEqual(r["requirements"]["RB"]["status"], "problem")
        self.assertEqual(r["requirements"]["R1"]["status"], "problem", "an incoherent budget cannot cover the budget requirement")
        self.assertEqual(r["readiness"]["code"], "blocked")

    def test_amount_mismatch_between_documents(self):
        docs = [self.doc("f", "application_form", {"requested_amount": {"amount": 40000, "currency": "EUR"}}),
                self.doc("b", "budget", {"budget": {"currency": "EUR", "totals": [], "requested": {"label": "x", "amount": 45000}}})]
        self.assertIn("AMOUNT_MISMATCH", [c["code"] for c in self.run_([], docs)["checks"]])

    def test_duration(self):
        facts = [{"key": "max_duration_months", "value": 12, "currency": None, "page": 1, "excerpt": "durée", "document_id": "c"}]
        doc = self.doc("t", "timeline", {"timeline": {"start": "2027-01-01", "end": "2028-06-01", "months": 17}})
        r = self.run_([self.req("RD", kind="rule", constraints={"rule": "max_duration_months"})], [doc], facts=facts)
        self.assertEqual(r["requirements"]["RD"]["status"], "problem")

    def test_conditions_need_declaration(self):
        r = self.run_([self.req("C1", kind="condition", critical=True)], [])
        self.assertEqual(r["requirements"]["C1"]["status"], "to_confirm")
        r = self.run_([self.req("C1", kind="condition", critical=True, declared=True)], [])
        self.assertEqual(r["requirements"]["C1"]["status"], "covered")

    def test_optional_and_ignored_do_not_count(self):
        reqs = [self.req("R1", ptype="cv"), self.req("R2", ptype="media", required=False)]
        r = self.run_(reqs, [self.doc("c", "cv")])
        self.assertEqual((r["score"], r["readiness"]["code"]), (100, "ready"))
        reqs[0]["status"] = "ignored"
        r = self.run_(reqs, [])
        self.assertEqual(r["requirements"]["R1"]["status"], "ignored")

    def test_deadline_checks_and_actions(self):
        r = self.run_([self.req("R1", ptype="support_letter")], [], deadline="2026-10-10")
        self.assertIn("DEADLINE_PASSED", [c["code"] for c in r["checks"]])
        r = self.run_([self.req("R1", ptype="support_letter")], [], deadline="2026-10-15")
        self.assertIn("DEADLINE_SOON", [c["code"] for c in r["checks"]])
        self.assertEqual(r["actions"][0]["verb"], "Demander", "external pieces are asked for first")

    def test_critical_weighs_double(self):
        reqs = [self.req("A", ptype="cv", critical=True), self.req("B", ptype="budget")]
        self.assertEqual(self.run_(reqs, [self.doc("c", "cv")])["score"], 67)


class Journey(unittest.TestCase):
    """End-to-end through the service with real file reading: the demo dossier reaches 'ready'."""

    def test_demo_to_ready(self):
        s = svc()
        today = date.today()
        d = s.create_demo(today)
        st = s.state(d["id"])
        self.assertEqual(st["dossier"]["deadline"], (today + timedelta(days=40)).isoformat())
        self.assertEqual(st["dossier"]["deadline_source"], "call")
        self.assertEqual(sorted(codes(st)), ["BUDGET_TOTAL", "PAGE_LIMIT", "STALE"])
        self.assertEqual(st["assessment"]["readiness"]["code"], "blocked")
        first = st["assessment"]["score"]
        names = {x["name"]: x["id"] for x in st["documents"]}
        for name, data in samples.correction_pieces(today):
            s.add_document(d["id"], "piece", name, data)
        for old in ("budget_previsionnel.xlsx", "extrait_RCCM.pdf", "note_presentation_projet.pdf"):
            s.delete_document(d["id"], names[old])
        st = s.state(d["id"])
        self.assertEqual(codes(st), [])
        self.assertGreater(st["assessment"]["score"], first)
        for r in st["requirements"]:
            if st["assessment"]["requirements"][r["id"]]["status"] == "to_confirm":
                s.update_requirement(d["id"], r["id"], {"declared": True})
            if r["proof_type"] == "media":
                s.update_requirement(d["id"], r["id"], {"status": "ignored"})
        st = s.state(d["id"])
        self.assertEqual(st["assessment"]["readiness"]["code"], "ready")
        self.assertEqual(st["assessment"]["score"], 100)

    def test_user_decisions_and_manual_requirements(self):
        s = svc()
        d = s.create_dossier("Test", "", None)
        s.add_document(d["id"], "call", "appel.pdf", samples.call_pdf(date.today()))
        doc = s.add_document(d["id"], "piece", "scan_0001.jpg", _jpg())
        self.assertEqual(doc["proof_type"], "other")
        st = s.state(d["id"])
        self.assertIn("UNREAD", codes(st))
        s.update_document(d["id"], doc["id"], "identity")
        st = s.state(d["id"])
        ident = next(r for r in st["requirements"] if r["proof_type"] == "identity")
        self.assertEqual(st["assessment"]["requirements"][ident["id"]]["status"], "covered")
        self.assertNotIn("UNREAD", codes(st))
        man = s.add_requirement(d["id"], "Attestation de domiciliation bancaire", "document", "bank", True, True)
        self.assertEqual(man["origin"], "manual")
        s.set_link(d["id"], man["id"], doc["id"], "confirmed")
        st = s.state(d["id"])
        self.assertEqual(st["assessment"]["requirements"][man["id"]]["links"][0]["origin"], "user")
        s.delete_requirement(d["id"], man["id"])
        with self.assertRaises(Conflict):
            s.delete_requirement(d["id"], ident["id"])  # extracted requirements are ignored, not deleted
        with self.assertRaises(Conflict):
            cond = next(r for r in st["requirements"] if r["kind"] == "condition")
            s.set_link(d["id"], cond["id"], doc["id"], "confirmed")
        with self.assertRaises(NotFound):
            s.set_link(d["id"], ident["id"], "doc_0000000000000000", "confirmed")

    def test_removing_the_call_removes_its_requirements_and_facts(self):
        s = svc()
        d = s.create_dossier("Test", "", None)
        call = s.add_document(d["id"], "call", "appel.pdf", samples.call_pdf(date.today()))
        self.assertGreater(len(s.state(d["id"])["requirements"]), 10)
        s.delete_document(d["id"], call["id"])
        st = s.state(d["id"])
        self.assertEqual(st["requirements"], [])
        self.assertEqual(st["dossier"]["call_facts"], [])
        self.assertIsNone(st["dossier"]["deadline"])

    def test_user_deadline_wins_over_the_call(self):
        s = svc()
        d = s.create_dossier("Test", "", "2026-12-24")
        s.add_document(d["id"], "call", "appel.pdf", samples.call_pdf(date.today()))
        self.assertEqual(s.state(d["id"])["dossier"]["deadline"], "2026-12-24")

    def test_scanned_call_is_refused_with_guidance(self):
        import sys

        sys.path.insert(0, str(helpers.ROOT / "scripts"))
        from make_samples import scanned_pdf

        s = svc()
        d = s.create_dossier("Test", "", None)
        with self.assertRaises(UploadRejected) as ctx:
            s.add_document(d["id"], "call", "scan.pdf", scanned_pdf())
        self.assertEqual(ctx.exception.code, "DOC-NO-TEXT")
        self.assertIn("OCR", ctx.exception.message)
        self.assertEqual(s.state(d["id"])["documents"], [], "nothing is stored after a refusal")

    def test_limits(self):
        s = svc(max_documents_per_dossier=2)
        d = s.create_dossier("Test", "", None)
        s.add_document(d["id"], "piece", "a.txt", b"premier document")
        s.add_document(d["id"], "piece", "b.txt", b"second document")
        with self.assertRaises(Conflict):
            s.add_document(d["id"], "piece", "c.txt", b"troisieme")
        with self.assertRaises(UploadRejected):
            s.add_document(s.create_dossier("T2", "", None)["id"], "call", "budget.xlsx", samples.budget(date.today(), True))

    def test_delete_dossier_removes_files(self):
        s = svc()
        d = s.create_demo()
        folder = s.settings.files_dir / d["id"]
        self.assertTrue(any(folder.iterdir()))
        s.delete_dossier(d["id"])
        self.assertFalse(folder.exists())
        with self.assertRaises(NotFound):
            s.state(d["id"])


def _jpg() -> bytes:
    import sys

    sys.path.insert(0, str(helpers.ROOT / "scripts"))
    from make_samples import photo_jpg

    return photo_jpg()


if __name__ == "__main__":
    unittest.main()
