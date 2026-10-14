"""Unit tests: text utilities, call parsing, document classification and fact extraction."""
from __future__ import annotations

import unittest
from datetime import date

import helpers  # noqa: F401  (sets sys.path)
from clairform.analysis import taxonomy
from clairform.analysis.call_parser import parse_call, parse_deadline
from clairform.analysis.evidence import analyse_budget, classify_dates, has_signature_cue, requested_amount_in_text
from clairform.analysis.text import add_months, find_amounts, find_dates, norm, parse_number


class TextUtilities(unittest.TestCase):
    def test_french_and_iso_dates(self):
        found = [d.value for d in find_dates("Date limite : 1er décembre 2026, puis 2027-01-15 et 03/02/2027.")]
        self.assertEqual(found, [date(2026, 12, 1), date(2027, 1, 15), date(2027, 2, 3)])

    def test_english_dates(self):
        self.assertEqual([d.value for d in find_dates("Deadline: March 3, 2027")], [date(2027, 3, 3)])

    def test_invalid_dates_are_ignored(self):
        self.assertEqual(find_dates("31/02/2026 et 45/13/2026"), [])

    def test_amounts_in_several_formats(self):
        values = [(a.value, a.currency) for a in find_amounts("50 000 €, 25 000 000 FCFA, USD 12,500.50 et 3 millions EUR")]
        self.assertEqual(values, [(50000.0, "EUR"), (25000000.0, "FCFA"), (12500.5, "USD"), (3000000.0, "EUR")])

    def test_parse_number(self):
        self.assertEqual(parse_number("42 000"), 42000)
        self.assertEqual(parse_number("42.000,50"), 42000.5)
        self.assertEqual(parse_number("42,000.50"), 42000.5)
        self.assertEqual(parse_number("12,5"), 12.5)
        self.assertIsNone(parse_number("abc"))
        self.assertIsNone(parse_number(True))

    def test_norm_and_months(self):
        self.assertEqual(norm("Pièce d’identité — À JOINDRE"), "piece d identite a joindre")
        self.assertEqual(add_months(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(add_months(date(2026, 3, 15), -5), date(2025, 10, 15))


SAMPLE_CALL_EN = [{"n": 1, "text": "\n".join([
    "CALL FOR PROPOSALS - GREEN CITIES MICRO-GRANTS (fictional)",
    "1. Eligibility",
    "- Applicants must be registered non-profit organisations.",
    "- The lead applicant must be at least 21 years old.",
    "2. Funding",
    "The requested amount must not exceed USD 20,000 (up to USD 20,000 per project).",
    "3. Required documents",
    "- Certificate of incorporation;",
    "- Two letters of support from local partners;",
    "- A project proposal of no more than 5 pages;",
    "- Detailed budget plan;",
    "- Optional: a short pitch video.",
    "4. Deadline",
    "Applications must be submitted by March 3, 2027.",
])}]


class CallParsing(unittest.TestCase):
    def setUp(self):
        from clairform import samples

        self.today = date(2026, 10, 12)
        from clairform.config import Settings
        from clairform.ingest.files import extract

        self.pages = extract("appel.pdf", samples.call_pdf(self.today), helpers.make_settings()).pages
        self.reqs, self.facts = parse_call("doc_x", self.pages)
        self.by_type = {r.proof_type: r for r in self.reqs if r.proof_type}

    def test_document_list_is_extracted_with_provenance(self):
        expected = {"application_form", "identity", "registration", "project_note", "budget", "timeline", "cv", "support_letter", "declaration", "media"}
        self.assertEqual(set(self.by_type), expected)
        for r in self.by_type.values():
            self.assertEqual(r.source_page, 2)
            self.assertIn(r.excerpt[:20], self.pages[1]["text"].replace("\n", " "))

    def test_constraints_are_attached_to_the_right_document(self):
        self.assertEqual(self.by_type["registration"].constraints.get("max_age_months"), 3)
        self.assertEqual(self.by_type["project_note"].constraints.get("max_pages"), 10)
        self.assertTrue(self.by_type["identity"].constraints.get("must_be_valid"))
        self.assertTrue(self.by_type["support_letter"].constraints.get("signed"))
        self.assertEqual(self.by_type["cv"].min_count, 2)

    def test_optional_and_critical_flags(self):
        self.assertFalse(self.by_type["media"].required)
        self.assertTrue(self.by_type["identity"].critical, "« sous peine d'irrecevabilité » propagates to the list")
        self.assertFalse(self.by_type["media"].critical)

    def test_conditions_and_rules(self):
        kinds = [(r.kind, r.constraints.get("rule")) for r in self.reqs if r.kind != "document"]
        self.assertEqual(sum(1 for k, _ in kinds if k == "condition"), 3)
        self.assertIn(("rule", "max_amount"), kinds)
        self.assertIn(("rule", "min_cofinancing_pct"), kinds)
        self.assertIn(("rule", "max_duration_months"), kinds)

    def test_call_facts(self):
        facts = {f.key: f for f in self.facts}
        self.assertEqual(facts["max_amount"].value, 50000)
        self.assertEqual(facts["max_amount"].currency, "EUR")
        self.assertEqual(facts["min_cofinancing_pct"].value, 20)
        self.assertEqual(facts["max_duration_months"].value, 12)
        self.assertEqual(parse_deadline(self.facts), date(2026, 11, 21))

    def test_selection_criteria_and_organiser_duties_are_not_requirements(self):
        texts = " ".join(r.statement for r in self.reqs).lower()
        self.assertNotIn("comité de sélection", texts)
        self.assertNotIn("pertinence", texts)

    def test_ids_are_stable(self):
        again, _ = parse_call("doc_x", self.pages)
        self.assertEqual([r.id for r in self.reqs], [r.id for r in again])

    def test_english_call(self):
        reqs, facts = parse_call("doc_en", SAMPLE_CALL_EN)
        types = {r.proof_type: r for r in reqs if r.proof_type}
        self.assertIn("registration", types)
        self.assertEqual(types["support_letter"].min_count, 2)
        self.assertEqual(types["project_note"].constraints.get("max_pages"), 5)
        self.assertFalse(types["media"].required)
        f = {x.key: x for x in facts}
        self.assertEqual((f["max_amount"].value, f["max_amount"].currency), (20000, "USD"))
        self.assertEqual(parse_deadline(facts), date(2027, 3, 3))

    def test_article_style_headings_in_docx(self):
        from clairform.ingest.files import extract

        data = helpers.docx_bytes([
            "ARTICLE 1 – OBJET",
            "Le présent concours récompense des initiatives citoyennes (texte fictif).",
            "ARTICLE 2 – COMPOSITION DU DOSSIER",
            "Chaque candidat doit joindre :",
            "a) une lettre de motivation signée ;",
            "b) un relevé d'identité bancaire (RIB) au nom de la structure ;",
            "c) l'attestation de non redevance fiscale datée de moins de six mois ;",
            "ARTICLE 3 – CLÔTURE",
            "Les dossiers doivent parvenir au plus tard le 15/01/2027.",
        ])
        pages = extract("reglement.docx", data, helpers.make_settings()).pages
        reqs, facts = parse_call("doc_docx", pages)
        types = {r.proof_type: r for r in reqs if r.proof_type}
        self.assertIn("bank", types)
        self.assertEqual(types["tax"].constraints.get("max_age_months"), 6)
        self.assertTrue(any("motivation" in r.label.lower() for r in reqs))
        self.assertEqual(parse_deadline(facts), date(2027, 1, 15))

    def test_text_without_obligations_gives_no_requirement(self):
        reqs, facts = parse_call("d", [{"n": 1, "text": "Bonjour.\nCeci est une lettre d'information sur nos activités.\nMerci de votre lecture."}])
        self.assertEqual(reqs, [])
        self.assertEqual(facts, [])


class Classification(unittest.TestCase):
    def test_filename_and_content(self):
        self.assertEqual(taxonomy.classify_document("CNI_recto_verso.pdf", "République ... Carte nationale d'identité, date de naissance")[:2], ("identity", "high"))
        self.assertEqual(taxonomy.classify_document("scan001.pdf", "Relevé d'identité bancaire IBAN CM21 ... titulaire du compte")[0], "bank")
        self.assertEqual(taxonomy.classify_document("budget.xlsx", "Total dépenses | 1000")[0], "budget")

    def test_unknown_document(self):
        self.assertEqual(taxonomy.classify_document("IMG_2034.jpg", ""), ("other", "low", ["aucun indice reconnu"]))

    def test_requirement_detection_prefers_first_mention(self):
        self.assertEqual(taxonomy.detect_in_requirement("Une courte vidéo de présentation du projet"), "media")
        self.assertEqual(taxonomy.detect_in_requirement("Une note de présentation du projet"), "project_note")


class Evidence(unittest.TestCase):
    def test_dates_roles(self):
        d = classify_dates("Né le 14/03/1996. Délivré le 12/05/2026. Valable jusqu'au 11/05/2031.")
        self.assertEqual(d["issue_date"], "2026-05-12")
        self.assertEqual(d["expiry_date"], "2031-05-11")
        self.assertNotIn("1996-03-14", d["dates"])

    def test_signature_cue(self):
        self.assertTrue(has_signature_cue("Fait à Douala... Signature : (signé)"))
        self.assertFalse(has_signature_cue("Un texte sans aucune mention particulière."))

    def test_requested_amount(self):
        self.assertEqual(requested_amount_in_text("Montant demandé : 45 000 €"), (45000.0, "EUR"))

    def test_budget_table(self):
        rows = [["Poste", "Montant (EUR)"], ["Personnel", 1000], ["Matériel", 500], ["Total dépenses", 1600], [],
                ["Montant demandé", 1200], ["Apport propre", 400], ["Total ressources", 1600]]
        b = analyse_budget([{"name": "B", "rows": rows}], "")
        self.assertEqual(b["currency"], "EUR")
        self.assertEqual(b["totals"][0]["lines_sum"], 1500)
        self.assertEqual(b["totals"][0]["amount"], 1600)
        self.assertEqual(b["totals"][1]["lines_sum"], 1600)
        self.assertEqual(b["requested"]["amount"], 1200)
        self.assertEqual(b["cofinancing"]["amount"], 400)
        self.assertEqual(b["expense_total"], 1600)

    def test_budget_from_text_lines(self):
        text = "Budget\nSalaires ........ 3 000 €\nLoyer ........ 1 000 €\nTotal ........ 4 000 €\n"
        b = analyse_budget([], text)
        self.assertEqual((b["totals"][0]["amount"], b["totals"][0]["lines_sum"]), (4000, 4000))

    def test_no_budget_structure(self):
        self.assertIsNone(analyse_budget([{"name": "x", "rows": [["a", "b"], ["c", "d"]]}], "rien"))


if __name__ == "__main__":
    unittest.main()
