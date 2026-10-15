"""Browser end-to-end tests (Playwright + Chromium) against a real server.

Skipped automatically when Playwright or its Chromium build is not installed.
Run:  python -m unittest test_e2e_browser   (from backend/tests)
"""
from __future__ import annotations

import io
import json
import re
import tempfile
import unittest
import urllib.request
import zipfile
from pathlib import Path

import helpers

try:
    from playwright.sync_api import expect, sync_playwright

    HAVE_PLAYWRIGHT = True
except ImportError:  # pragma: no cover
    HAVE_PLAYWRIGHT = False

SAMPLES = helpers.ROOT / "data" / "samples"
EXPECTED_NOISE = ("net::ERR_FAILED", "Failed to load resource")


def ensure_samples():
    if not (SAMPLES / "1_appel").is_dir():
        import subprocess
        import sys

        subprocess.run([sys.executable, str(helpers.ROOT / "scripts" / "make_samples.py")], check=True)


FR_INIT = "try { if (!localStorage.getItem('cf_lang')) localStorage.setItem('cf_lang', 'fr'); } catch (e) {}"


@unittest.skipUnless(HAVE_PLAYWRIGHT, "Playwright non installé")
class Browser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_samples()
        cls.server = helpers.Server(CLAIRFORM_MAX_UPLOAD_MB=1).__enter__()
        cls.pw = sync_playwright().start()
        try:
            cls.browser = cls.pw.chromium.launch()
        except Exception as exc:  # pragma: no cover
            cls.pw.stop()
            cls.server.__exit__(None, None, None)
            raise unittest.SkipTest(f"Chromium indisponible : {exc}")
        cls.shots = Path(tempfile.mkdtemp(prefix="clairform-e2e-"))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.__exit__(None, None, None)
        assert "Traceback" not in cls.server.output, cls.server.output

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
        if not self._testMethodName.startswith("test_english"):
            self.ctx.add_init_script(FR_INIT)  # the detailed journeys below are written against the French interface
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(20000)
        self.console: list[str] = []
        self.page.on("console", lambda m: m.type in ("error", "warning") and self.console.append(m.text))
        self.page.on("pageerror", lambda e: self.console.append(f"pageerror: {e}"))

    def tearDown(self):
        self.ctx.close()

    def assert_clean_console(self, allow_network=False):
        bad = [m for m in self.console if not (allow_network and any(n in m for n in EXPECTED_NOISE))]
        self.assertEqual(bad, [], "console errors / CSP violations")

    def api(self, path):
        # Reuse the browser's cookies so the call sees the same private space in public mode.
        cookie = "; ".join(f"{c['name']}={c['value']}" for c in self.ctx.cookies())
        req = urllib.request.Request(self.server.url + path, headers={"Cookie": cookie} if cookie else {})
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    def open_home(self):
        self.page.goto(self.server.url + "/")
        expect(self.page.get_by_role("heading", name="Mes dossiers")).to_be_visible()

    def create_dossier(self, title="Dossier E2E"):
        self.page.get_by_role("button", name="Nouveau dossier").click()
        dialog = self.page.get_by_role("dialog", name="Nouveau dossier")
        dialog.get_by_label("Nom du dossier").fill(title)
        dialog.get_by_role("button", name="Créer le dossier").click()
        expect(self.page.locator(".dossier-title")).to_have_text(title)
        return re.search(r"#/d/(dos_[0-9a-f]+)", self.page.url).group(1)

    def tab(self, label, slug):
        self.page.get_by_role("link", name=re.compile("^" + label)).click()
        expect(self.page).to_have_url(re.compile(f"/{slug}$"))
        expect(self.page.locator(".tab-active")).to_contain_text(label)

    def wait_uploads_done(self, n):
        expect(self.page.locator(".upload-row.up-done")).to_have_count(n, timeout=60000)

    # ------------------------------------------------------------------ the main journey
    def test_complete_journey(self):
        p = self.page
        self.open_home()

        # Modal: opens, keeps focus inside, closes with Escape and returns focus.
        trigger = p.get_by_role("button", name="Nouveau dossier")
        trigger.click()
        dialog = p.get_by_role("dialog", name="Nouveau dossier")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_label("Nom du dossier")).to_be_focused()
        for _ in range(8):
            p.keyboard.press("Tab")
            self.assertTrue(p.evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), "focus trapped in the dialog")
        p.keyboard.press("Escape")
        expect(dialog).to_be_hidden()
        expect(trigger).to_be_focused()

        # Validation then creation.
        trigger.click()
        p.get_by_role("dialog").get_by_role("button", name="Créer le dossier").click()
        expect(p.get_by_role("alert").filter(has_text="Donnez un nom")).to_be_visible()
        p.keyboard.press("Escape")
        did = self.create_dossier("Kits solaires — test navigateur")
        expect(p.get_by_text("Commencez par l’appel à projets")).to_be_visible()

        # Import the call: real PDF through the file chooser.
        p.get_by_role("button", name="Importer l’appel").click()
        expect(p).to_have_url(re.compile(r"/appel$"))
        p.locator("input[type=file]").set_input_files(str(SAMPLES / "1_appel" / "appel_a_projets_tremplin_impact.pdf"))
        self.wait_uploads_done(1)
        expect(p.locator(".upload-row.up-done")).to_contain_text("exigence(s) lue(s)")
        highlights = p.locator(".reader mark.hl")
        self.assertGreaterEqual(highlights.count(), 15)
        expect(p.locator(".dh-meta .deadline")).to_contain_text("lue dans l’appel")

        # Clicking a highlighted passage opens the requirement drawer; Escape closes it.
        highlights.filter(has_text="Deux CV").click()
        drawer = p.get_by_role("dialog")
        expect(drawer).to_contain_text("Deux CV")
        expect(drawer).to_contain_text("Manquant")
        expect(p).to_have_url(re.compile(r"/appel/R-[0-9a-f]{8}$"))
        p.keyboard.press("Escape")
        expect(drawer).to_be_hidden()
        expect(p).to_have_url(re.compile(r"/appel$"))

        # Import the first set of pieces in one go (multiple selection).
        self.tab("Pièces", "pieces")
        files = sorted(str(f) for f in (SAMPLES / "2_pieces").iterdir())
        p.locator("input[type=file]").set_input_files(files)
        self.wait_uploads_done(len(files))
        expect(p.locator(".piece")).to_have_count(len(files))
        expect(p.locator(".dh-score .score-label")).to_have_text("Corrections nécessaires")
        p.screenshot(path=str(self.shots / "pieces.png"), full_page=True)

        # The three planted problems are reported with explanations.
        self.tab("Contrôles", "controles")
        errors = p.locator(".check-group").filter(has_text="À corriger").locator(".check-item")
        expect(errors).to_have_count(3)
        for title in ("Total du budget incohérent", "Nombre de pages dépassé", "Document trop ancien"):
            expect(errors.filter(has_text=title)).to_have_count(1)

        # Confirm an automatic link from the drawer, then reject it and restore it.
        self.tab("Checklist", "checklist")
        p.locator(".req-row").filter(has_text="Un calendrier de mise en œuvre").click()
        drawer = p.get_by_role("dialog")
        drawer.get_by_role("button", name="Pas la bonne pièce").click()
        expect(drawer.locator(".explain")).to_contain_text("Aucune pièce")
        drawer.get_by_role("button", name="rétablir").click()
        expect(drawer.locator(".chip").first).to_have_text("Couvert")
        drawer.get_by_role("button", name="Terminé").click()

        # Fix the problems: upload corrections, delete the faulty versions through the confirm dialog.
        self.tab("Pièces", "pieces")
        corr = sorted(str(f) for f in (SAMPLES / "3_corrections").iterdir())
        p.locator("input[type=file]").set_input_files(corr)
        self.wait_uploads_done(len(corr))
        for name in ("budget_previsionnel.xlsx", "extrait_RCCM.pdf", "note_presentation_projet.pdf"):
            p.get_by_role("button", name=f"Supprimer {name}").click()
            confirm = p.get_by_role("dialog", name="Supprimer cette pièce ?")
            confirm.get_by_role("button", name="Supprimer").click()
            expect(confirm).to_be_hidden()
            expect(p.get_by_role("button", name=f"Supprimer {name}")).to_have_count(0)
        expect(p.locator(".tab-count-alert")).to_have_count(0)

        # Confirm the eligibility conditions and remaining rule, set aside the optional video.
        self.tab("Checklist", "checklist")
        p.get_by_label("Statut").select_option("to_confirm")
        rows = p.locator(".req-row")
        n = rows.count()
        self.assertGreaterEqual(n, 3)
        for _ in range(n):
            rows.first.click()
            drawer = p.get_by_role("dialog")
            drawer.get_by_role("button", name=re.compile("^Je confirme")).click()
            expect(drawer.locator(".chip").first).to_have_text("Couvert")
            p.keyboard.press("Escape")
            expect(drawer).to_be_hidden()
        expect(p.get_by_text("Aucune exigence ne correspond à ces filtres.")).to_be_visible()
        p.get_by_role("button", name="Effacer les filtres").click()
        p.locator(".req-row").filter(has_text="vidéo").click()
        p.get_by_role("dialog").get_by_role("button", name=re.compile("Écarter")).click()
        expect(p.get_by_role("dialog").locator(".chip").first).to_have_text("Écartée")
        p.keyboard.press("Escape")

        expect(p.locator(".dh-score .score-label")).to_have_text("Prêt à déposer")
        expect(p.locator(".dh-score .score-num")).to_have_text("100 %")

        # State survives a reload (server-side persistence + hash routing).
        p.reload()
        expect(p.locator(".dh-score .score-label")).to_have_text("Prêt à déposer")
        expect(p.locator(".tab-active")).to_contain_text("Checklist")

        # Exports really download files with valid content.
        p.get_by_role("link", name="Exporter").click()
        with p.expect_download() as dl:
            p.get_by_role("link", name="Télécharger le rapport").click()
        self.assertTrue(Path(dl.value.path()).read_bytes().startswith(b"%PDF"))
        with p.expect_download() as dl:
            p.get_by_role("link", name="Télécharger le paquet").click()
        z = zipfile.ZipFile(io.BytesIO(Path(dl.value.path()).read_bytes()))
        names = z.namelist()
        self.assertTrue(any(n.endswith("00_rapport_clairform.pdf") for n in names))
        manifest = json.loads(z.read(next(n for n in names if n.endswith("manifest.json"))))
        self.assertEqual(manifest["readiness"]["code"], "ready")
        self.assertEqual(len(manifest["files"]), 10)  # les 10 pièces rattachées

        p.get_by_role("link", name="Synthèse").click()
        expect(p.locator(".all-clear")).to_be_visible()
        state = self.api(f"/api/dossiers/{did}")["state"]
        self.assertEqual(state["assessment"]["readiness"]["code"], "ready")
        self.assert_clean_console()

    # ------------------------------------------------------------------ failures the user must understand
    def test_upload_errors_cancel_and_server_failures(self):
        p = self.page
        self.open_home()
        did = self.create_dossier("Cas limites")
        self.tab("Pièces", "pieces")
        edge = SAMPLES / "4_cas_limites"
        p.locator("input[type=file]").set_input_files([str(edge / "faux_document.pdf"), str(edge / "fichier_vide.txt"), str(edge / "programme.exe")])
        expect(p.locator(".upload-row.up-error")).to_have_count(3, timeout=30000)
        expect(p.locator(".upload-row.up-error").nth(0)).to_contain_text("ne correspond pas à son extension")
        expect(p.locator(".upload-row.up-error").nth(1)).to_contain_text("vide")
        expect(p.locator(".upload-row.up-error").nth(2)).to_contain_text("Format non pris en charge")
        expect(p.locator(".upload-row.up-error").first.get_by_role("button", name="Réessayer")).to_be_visible()
        p.get_by_role("button", name="Retirer faux_document.pdf de la liste").click()
        expect(p.locator(".upload-row.up-error")).to_have_count(2)

        # A photo without text is accepted as a piece and flagged for manual typing.
        p.locator("input[type=file]").set_input_files(str(edge / "photo_carte_identite.jpg"))
        self.wait_uploads_done(1)
        expect(p.locator(".upload-row.up-done")).to_contain_text("Classé d’après son nom : Pièce d'identité. Aucun texte lisible")
        card = p.locator(".piece").filter(has_text="photo_carte_identite.jpg")
        card.get_by_label("Type").select_option("address")
        expect(card.locator(".confidence")).to_have_text("choisi par vous")

        # Over the server limit (1 Mo in this test server): refused by the server, not just the browser.
        big = Path(tempfile.mkdtemp()) / "trop_gros.txt"
        big.write_bytes(b"a" * (1024 * 1024 + 200_000))
        p.locator("input[type=file]").set_input_files(str(big))
        expect(p.locator(".upload-row.up-error").filter(has_text="trop_gros.txt")).to_contain_text("dépasse", timeout=30000)

        # A scanned call is refused with an explanation (no OCR) and leaves no requirement.
        self.tab("Appel", "appel")
        p.locator("input[type=file]").set_input_files(str(edge / "appel_scanne_sans_texte.pdf"))
        expect(p.locator(".upload-row.up-error")).to_contain_text("OCR", timeout=30000)

        # Cancelling a slow transfer: nothing is stored on the server.
        cdp = self.ctx.new_cdp_session(p)
        cdp.send("Network.enable")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 50, "downloadThroughput": 500_000, "uploadThroughput": 20_000})
        slow = Path(tempfile.mkdtemp()) / "lent.txt"
        slow.write_bytes(b"Document de test.\n" * 50_000)
        self.tab("Pièces", "pieces")
        before = len(self.api(f"/api/dossiers/{did}")["state"]["documents"])
        p.locator("input[type=file]").set_input_files(str(slow))
        row = p.locator(".upload-row").filter(has_text="lent.txt")
        expect(row.get_by_role("progressbar")).to_be_visible()
        row.get_by_role("button", name="Annuler").click()
        expect(row).to_contain_text("Import annulé")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})
        p.wait_for_timeout(800)
        self.assertEqual(len(self.api(f"/api/dossiers/{did}")["state"]["documents"]), before)

        # Invalid server responses and network failures are explained, and the UI stays usable.
        self.tab("Checklist", "checklist")
        p.get_by_role("button", name="Ajouter une exigence").click()
        dialog = p.get_by_role("dialog", name="Ajouter une exigence")
        dialog.get_by_label("Exigence").fill("Attestation bancaire")
        p.route("**/api/dossiers/*/requirements", lambda r: r.fulfill(status=200, body="<html>proxy error</html>", content_type="text/html"))
        dialog.get_by_role("button", name="Ajouter").click()
        expect(p.locator(".toast-error")).to_contain_text("Réponse inattendue du serveur")
        expect(dialog).to_be_visible()
        p.unroute("**/api/dossiers/*/requirements")
        p.route("**/api/dossiers/*/requirements", lambda r: r.abort())
        dialog.get_by_role("button", name="Ajouter").click()
        expect(p.locator(".toast-error").last).to_contain_text("Impossible de joindre ClairForm")
        p.unroute("**/api/dossiers/*/requirements")
        p.route("**/api/dossiers/*/requirements", lambda r: r.fulfill(status=500, body='{"error":{"code":"INTERNAL","message":"Erreur interne inattendue."}}', content_type="application/json"))
        dialog.get_by_role("button", name="Ajouter").click()
        expect(p.locator(".toast-error").last).to_contain_text("Erreur interne inattendue")
        p.unroute("**/api/dossiers/*/requirements")
        dialog.get_by_role("button", name="Ajouter").click()
        expect(dialog).to_be_hidden()
        expect(p.locator(".req-row").filter(has_text="Attestation bancaire")).to_be_visible()

        # Unknown dossier link.
        p.goto(self.server.url + "/#/d/dos_0000000000000000/checklist")
        expect(p.get_by_role("heading", name="Dossier introuvable")).to_be_visible()
        p.get_by_role("link", name="Revenir à mes dossiers").click()
        expect(p.get_by_role("heading", name="Mes dossiers")).to_be_visible()
        self.assert_clean_console(allow_network=True)

    def test_delete_dossier_from_home(self):
        p = self.page
        self.open_home()
        self.create_dossier("À supprimer")
        p.get_by_role("link", name="Mes dossiers").click()
        p.get_by_role("button", name="Supprimer le dossier À supprimer").click()
        dialog = p.get_by_role("dialog", name="Supprimer ce dossier ?")
        dialog.get_by_role("button", name="Annuler").click()
        expect(p.locator(".dossier-name").filter(has_text="À supprimer")).to_have_count(1)
        p.get_by_role("button", name="Supprimer le dossier À supprimer").click()
        p.get_by_role("dialog").get_by_role("button", name="Supprimer définitivement").click()
        expect(p.locator(".dossier-name").filter(has_text="À supprimer")).to_have_count(0)
        self.assert_clean_console()

    def test_keyboard_only_navigation(self):
        p = self.page
        self.open_home()
        p.get_by_role("button", name="Découvrir avec un dossier prérempli").focus()
        p.keyboard.press("Enter")
        expect(p.locator(".dossier-title")).to_contain_text("Kombi Solaire", timeout=30000)
        p.get_by_role("link", name=re.compile("^Appel")).focus()
        p.keyboard.press("Enter")
        mark = p.locator(".reader mark.hl").first
        mark.focus()
        p.keyboard.press("Enter")
        expect(p.get_by_role("dialog")).to_be_visible()
        p.keyboard.press("Escape")
        expect(p.get_by_role("dialog")).to_be_hidden()
        self.assert_clean_console()

    def test_mobile_layout_has_no_horizontal_overflow(self):
        for lang, demo in (("fr", "Découvrir avec un dossier prérempli"), ("en", "Try it with a sample application")):
            with self.subTest(lang=lang):
                self._mobile(lang, demo)

    def _mobile(self, lang, demo):
        ctx = self.browser.new_context(viewport={"width": 375, "height": 760}, is_mobile=True, has_touch=True)
        ctx.add_init_script(f"try {{ localStorage.setItem('cf_lang', '{lang}'); }} catch (e) {{}}")
        p = ctx.new_page()
        errors: list[str] = []
        p.on("pageerror", lambda e: errors.append(str(e)))
        p.goto(self.server.url + "/")
        p.get_by_role("button", name=demo).tap()
        expect(p.locator(".dossier-title")).to_be_visible(timeout=30000)
        did = re.search(r"#/d/(dos_[0-9a-f]+)", p.url).group(1)
        for tab in ("synthese", "appel", "checklist", "pieces", "controles", "export"):
            p.evaluate(f"location.hash = '#/d/{did}/{tab}'")
            expect(p.locator(".tab-active")).to_have_attribute("href", f"#/d/{did}/{tab}")
            p.wait_for_timeout(400)
            p.screenshot(path=str(self.shots / f"mobile_{lang}_{tab}.png"), full_page=True)
            width = p.evaluate("document.documentElement.scrollWidth")
            self.assertLessEqual(width, 375, f"horizontal overflow on {tab}: {width}px")
        p.evaluate(f"location.hash = '#/d/{did}/checklist'")
        p.locator(".req-row").first.tap()
        box = p.get_by_role("dialog").bounding_box()
        self.assertLessEqual(box["width"], 375.5)
        self.assertEqual(errors, [])
        ctx.close()

    def test_english_by_default_and_language_switch(self):
        p = self.page
        p.goto(self.server.url + "/")
        expect(p.get_by_role("heading", name="My applications")).to_be_visible()
        self.assertEqual(p.evaluate("document.documentElement.lang"), "en")
        p.get_by_role("button", name="Try it with a sample application").click()
        expect(p.locator(".dossier-title")).to_be_visible(timeout=30000)
        expect(p.locator(".dh-score .score-label")).to_have_text("Fixes needed")
        expect(p.get_by_role("heading", name="Next actions")).to_be_visible()
        p.get_by_role("link", name=re.compile("^Checks")).click()
        expect(p.get_by_text("Budget total does not add up")).to_be_visible()
        expect(p.get_by_text("Too many pages")).to_be_visible()
        p.get_by_role("link", name=re.compile("^Documents")).click()
        expect(p.locator(".piece-type select").first).to_contain_text("Application form")
        # switch to French: the page reloads and everything, including server messages, is in French
        p.get_by_role("button", name="FR", exact=True).click()
        expect(p.get_by_role("link", name=re.compile("^Pièces"))).to_be_visible()
        expect(p.locator(".dh-score .score-label")).to_have_text("Corrections nécessaires")
        self.assertEqual(p.evaluate("document.documentElement.lang"), "fr")
        p.get_by_role("link", name=re.compile("^Contrôles")).click()
        expect(p.get_by_text("Total du budget incohérent")).to_be_visible()
        # the choice is remembered
        p.goto(self.server.url + "/")
        expect(p.get_by_role("heading", name="Mes dossiers")).to_be_visible()
        p.get_by_role("button", name="EN", exact=True).click()
        expect(p.get_by_role("heading", name="My applications")).to_be_visible()
        self.assert_clean_console()


if __name__ == "__main__":
    unittest.main()
