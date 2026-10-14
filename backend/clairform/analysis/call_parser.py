"""Turn the text of a call for proposals into a reviewable checklist.

The parser is deliberately transparent: every requirement keeps the exact excerpt and page
it was read from, the reason it was selected, and the constraints detected in it. Nothing is
invented: a sentence becomes a requirement only if it contains normative wording or sits in
a list under a heading such as "Pièces à fournir".
"""
from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from . import taxonomy
from .text import find_amounts, find_dates, norm, parse_small_number

BULLET_RE = re.compile(r"^\s*(?:[-•▪◦●○■□✓✔*–—]|\(?\d{1,2}[.)]|\(?[a-hA-H][.)]|\(?[ivxIVX]{1,4}[.)])\s+")
NUMBERED_HEADING_RE = re.compile(r"^\s*(?:(?:article|section|titre|chapitre|partie)\s+[\w.]+\s*[:.\-–—]?\s*|\d{1,2}(?:\.\d{1,2})*\.?\s+|[IVX]{1,4}[.)]\s+)", re.I)
PAGE_NOISE_RE = re.compile(r"^\s*(?:page\s*)?\d{1,3}\s*(?:/|sur|of)\s*\d{1,3}\s*$|^\s*-?\s*\d{1,3}\s*-?\s*$", re.I)

NORMATIVE = (
    "doit", "doivent", "devra", "devront", "obligatoire", "obligatoires", "obligatoirement", "est exige", "sont exiges",
    "exigee", "exigees", "requis", "requise", "requises", "joindre", "fournir", "presenter", "transmettre", "comprendre",
    "comporter", "il est demande", "imperativement", "ne peut exceder", "ne peut pas exceder", "ne doit pas", "ne peuvent",
    "must", "shall", "required", "mandatory", "is expected to", "are expected to", "should include", "must include",
    "seuls sont eligibles", "sont eligibles", "est eligible", "peuvent candidater", "ouvert aux", "reserve aux",
)
OPTIONAL = ("facultatif", "facultative", "optionnel", "optionnelle", "le cas echeant", "si applicable", "si disponible",
            "eventuellement", "peut etre joint", "peuvent etre joints", "optional", "if applicable", "if available", "en option")
CRITICAL = ("sous peine", "irrecevable", "eliminatoire", "rejet", "rejete", "rejetee", "ne sera pas examine", "ne sera pas examinee",
            "ne seront pas examines", "exclu", "exclue", "automatiquement ecarte", "obligatoirement", "will be rejected", "ineligible")
ORGANISER_SUBJECTS = ("le jury", "le comite", "l organisateur", "les organisateurs", "le programme s engage", "les laureats recevront",
                      "le financeur", "nous ", "la fondation s engage", "le secretariat")

SECTION_KINDS = [
    ("documents", ("pieces a fournir", "pieces justificatives", "documents a fournir", "documents requis", "composition du dossier",
                   "dossier de candidature", "contenu du dossier", "liste des pieces", "annexes", "required documents", "supporting documents",
                   "pieces constitutives", "elements a fournir", "dossier complet")),
    ("eligibility", ("eligibilite", "conditions de participation", "qui peut", "criteres d eligibilite", "beneficiaires", "eligibility",
                     "public cible", "candidats eligibles", "conditions d admissibilite", "admissibilite")),
    ("budget", ("budget", "financement", "depenses", "dotation", "montant", "funding")),
    ("calendar", ("calendrier", "dates cles", "echeances", "date limite", "timeline", "deadline")),
    ("format", ("modalites", "format", "depot", "soumission", "submission", "presentation du dossier")),
    ("evaluation", ("criteres d evaluation", "criteres de selection", "evaluation", "selection", "notation")),
]

CONDITION_HINTS = ("etre age", "etre agee", "ages de", "agees de", "avoir moins de", "avoir au moins", "ressortissant", "resider",
                   "etre legalement", "legalement constitue", "legalement constituee", "etre une", "etre un", "sont eligibles", "est eligible",
                   "peuvent candidater", "ouvert aux", "reserve aux", "siege social", "ans au", "less than", "at least", "registered in")
RULE_HINTS = ("ne peut exceder", "ne peut pas exceder", "ne doit pas depasser", "ne doit pas exceder", "plafonne", "plafond", "maximum",
              "au moins", "minimum", "cofinancement", "apport", "duree", "pages", "format pdf", "en francais", "en anglais")


@dataclass
class Candidate:
    text: str
    page: int
    section: str
    section_kind: str
    is_bullet: bool


@dataclass
class ParsedRequirement:
    id: str
    label: str
    statement: str
    kind: str  # document | condition | rule
    proof_type: str | None
    required: bool
    critical: bool
    source_page: int
    excerpt: str
    section: str
    reason: str
    constraints: dict = field(default_factory=dict)
    min_count: int = 1


@dataclass
class CallFact:
    key: str  # deadline | max_amount | min_cofinancing_pct | max_duration_months
    value: object
    currency: str | None
    page: int
    excerpt: str


# --------------------------------------------------------------------------- layout
def _clean_line(line: str) -> str:
    return re.sub(r"[ \t  ]+", " ", line).strip()


def _lines(pages: list[dict]) -> list[tuple[int, str]]:
    per_page = [[_clean_line(l) for l in (p.get("text") or "").splitlines()] for p in pages]
    # Running headers/footers: identical short lines repeated on most pages.
    repeated: set[str] = set()
    if len(per_page) >= 3:
        counts = Counter(l for lines in per_page for l in set(lines) if l and len(l) < 90)
        repeated = {l for l, c in counts.items() if c >= max(3, int(len(per_page) * 0.6))}
    out = []
    for page, lines in zip(pages, per_page):
        for l in lines:
            if not l or l in repeated or PAGE_NOISE_RE.match(l):
                continue
            out.append((page.get("n", 1), l))
    return out


def _is_heading(line: str) -> bool:
    if len(line) > 90 or line.endswith((".", ";", ",")):
        return False
    stripped = NUMBERED_HEADING_RE.sub("", line, count=1)
    letters = [c for c in stripped if c.isalpha()]
    if not letters:
        return False
    numbered = stripped != line
    upper_ratio = sum(c.isupper() for c in letters) / len(letters)
    n = norm(stripped)
    # A numbered line naming a document ("1. Une copie de ...") is a list item, not a heading.
    if numbered and (any(f" {k} " in f" {n} " for k in NORMATIVE) or taxonomy.detect_in_requirement(stripped)):
        known_heading = any(k in n for _, kws in SECTION_KINDS for k in kws)
        if not known_heading:
            return False
    if numbered and len(stripped) <= 70 and stripped[:1].isupper():
        return True
    if upper_ratio > 0.8 and 4 <= len(stripped) <= 80:
        return True
    if line.endswith(":") and len(line) <= 70 and line[:1].isupper() and not any(f" {k} " in f" {n} " for k in NORMATIVE):
        return True
    return False


def _section_kind(title: str) -> str:
    n = norm(title)
    for kind, kws in SECTION_KINDS:
        if any(k in n for k in kws):
            return kind
    return "general"


def _units(pages: list[dict]) -> list[Candidate]:
    units: list[Candidate] = []
    section, section_kind = "", "general"
    current: Candidate | None = None
    for page, line in _lines(pages):
        dash_bullet = bool(re.match(r"^\s*[-•▪◦●○■□✓✔*–—]\s+", line))
        bullet = bool(BULLET_RE.match(line))
        continuation = bool(current) and not current.text.rstrip().endswith((".", "!", "?", ":", ";")) and line[:1].islower()
        if continuation:
            current.text = (current.text[:-1] if current.text.endswith("-") else current.text + " ") + line
            continue
        if not dash_bullet and _is_heading(line):
            if current:
                units.append(current)
                current = None
            section = NUMBERED_HEADING_RE.sub("", line, count=1).rstrip(" :").strip() or line
            section_kind = _section_kind(line)
            continue
        if bullet:
            if current:
                units.append(current)
            current = Candidate(BULLET_RE.sub("", line, count=1), page, section, section_kind, True)
            continue
        if current and not current.text.rstrip().endswith((".", "!", "?", ":", ";")):
            current.text = (current.text[:-1] if current.text.endswith("-") else current.text + " ") + line
            if not current.is_bullet and current.text.endswith(":") and _announces_documents(current.text):
                section_kind = "documents"
            continue
        if current:
            units.append(current)
        current = Candidate(line, page, section, section_kind, False)
        if line.endswith(":") and _announces_documents(line):
            section_kind = "documents"
    if current:
        units.append(current)
    return units


DOC_INTRO = ("joindre", "fournir", "pieces suivantes", "documents suivants", "comprendre", "comporter", "contenir", "following documents",
             "must include", "shall include", "transmettre")


def _announces_documents(text: str) -> bool:
    n = f" {norm(text)} "
    return any(f" {k} " in n for k in DOC_INTRO)


def _sentences(unit: Candidate) -> list[Candidate]:
    if unit.is_bullet and len(unit.text) <= 320:
        return [unit]
    parts = re.split(r"(?<=[.!?;])\s+(?=[A-ZÀ-ÖØ-Þ«\"(])", unit.text)
    return [Candidate(p.strip(), unit.page, unit.section, unit.section_kind, unit.is_bullet) for p in parts if p.strip()]


# --------------------------------------------------------------------------- constraints & facts
_PAGES_RE = re.compile(r"(?:(?:no more than|not more than|maximum of|max of|up to|not exceed|not to exceed|limited to|at most)\s+(\d{1,3}|\w+)\s+pages?|(\d{1,3}|\w+)\s+pages?\s*(?:maximum|max\.?|au maximum|au plus|or less|at most)|(?:maximum|max\.?|au plus|pas plus de|ne\s+(?:doit|peut|devra)\s+pas\s+(?:depasser|exceder)|n\s+(?:excede|excedera|depassera)\s+pas)\s+(\d{1,3}|\w+)\s+pages?|(?:limitee?s?|limite)\s+a\s+(\d{1,3}|\w+)\s+pages?)")
_FRESH_RE = re.compile(r"(?:de|datant de|datee de|date de|dates de|delivree? (?:il y a|depuis)|emise? depuis)\s+moins\s+de\s+(\d{1,2}|\w+)\s+mois|less than\s+(\d{1,2}|\w+)\s+months?\s+old|(\d{1,2}|\w+)\s+derniers mois")
_COUNT_RE = re.compile(r"\b(?:au moins|minimum|deux|trois|quatre|cinq|\d)\b")
_DURATION_RE = re.compile(r"duree\s+(?:maximale\s+)?(?:du projet\s+|des activites\s+|de mise en oeuvre\s+)?(?:est\s+|sera\s+)?(?:de\s+|limitee a\s+|ne (?:doit|peut) (?:pas )?exceder\s+|n excedant pas\s+|d au plus\s+|maximale de\s+)?(?:\w+\s+)?(\d{1,2}|\w+)\s+mois")
_PCT_RE = re.compile(r"(\d{1,2}(?:[.,]\d)?)\s*%")


def _num(token: str | None) -> int | None:
    if not token:
        return None
    return parse_small_number(token)


def _constraints(text: str) -> dict:
    n = norm(text)
    c: dict = {}
    m = _PAGES_RE.search(n)
    if m:
        value = _num(next(g for g in m.groups() if g))
        if value:
            c["max_pages"] = value
    m = _FRESH_RE.search(n)
    if m:
        value = _num(next(g for g in m.groups() if g))
        if value:
            c["max_age_months"] = value
    if "en cours de validite" in n or "valide a la date" in n or "non expire" in n or "valid " in f"{n} ":
        c["must_be_valid"] = True
    if re.search(r"\b(?:format|en)\s+pdf\b|\bpdf\s+uniquement\b|\bau format pdf\b", n):
        c["format"] = "pdf"
    if re.search(r"\bsigne(?:e|es|s)?\b|\bsignature\b|\bsigned\b", n):
        c["signed"] = True
    nouns = r"(?:lettres?|letters?|cv|curriculum|resumes?|attestations?|certificates?|references?|devis|quotes?|recommandations?|recommendations?)"
    m = re.search(rf"\b(?:au moins|minimum|au minimum|at least)\s+(\w+)\s+{nouns}|\b(deux|trois|quatre|cinq|two|three|four|five|\d)\s+{nouns}\b", n)
    if m:
        value = _num(m.group(1) or m.group(2))
        if value and 1 < value <= 20:
            c["min_count"] = value
    return c


def _facts_from(sentence: Candidate) -> list[CallFact]:
    n = norm(sentence.text)
    facts: list[CallFact] = []
    excerpt = sentence.text[:400]
    if any(k in n for k in ("date limite", "au plus tard", "cloture", "deadline", "avant le", "jusqu au", "date de depot", "soumis avant", "submitted by")):
        dates = find_dates(sentence.text)
        if dates:
            facts.append(CallFact("deadline", max(d.value for d in dates).isoformat(), None, sentence.page, excerpt))
    if any(k in n for k in ("ne peut exceder", "ne peut pas exceder", "plafonne", "plafond", "maximum", "maximal", "jusqu a", "n excedera pas",
                            "ne depassera pas", "ne doit pas depasser", "up to", "maximum of", "au plus", "not exceed", "no more than",
                            "capped at", "ne doit pas exceder")) and \
            any(k in n for k in ("montant", "subvention", "financement", "aide", "dotation", "grant", "budget", "contribution", "amount", "funding")):
        amounts = [a for a in find_amounts(sentence.text) if a.value >= 100]
        if amounts:
            top = max(amounts, key=lambda a: a.value)
            facts.append(CallFact("max_amount", top.value, top.currency, sentence.page, excerpt))
    if any(k in n for k in ("cofinancement", "apport personnel", "apport propre", "contribution propre", "fonds propres", "co financement", "cofunding", "co funding")):
        m = _PCT_RE.search(sentence.text)
        if m and any(k in n for k in ("au moins", "minimum", "minimal", "at least", "ne peut etre inferieur")):
            facts.append(CallFact("min_cofinancing_pct", float(m.group(1).replace(",", ".")), None, sentence.page, excerpt))
    m = _DURATION_RE.search(n)
    if m and any(k in n for k in ("maximal", "maximum", "exceder", "au plus", "limitee", "ne peut", "ne doit")):
        value = _num(m.group(1))
        if value and value <= 120:
            facts.append(CallFact("max_duration_months", value, None, sentence.page, excerpt))
    return facts


# --------------------------------------------------------------------------- labelling
_LEAD_RE = re.compile(
    r"^(?:(?:le|la|les|chaque)\s+(?:candidat|candidate|candidats|porteur|porteuse|porteurs|structure|structures)(?:\s+de\s+projet)?\s+"
    r"(?:doit|doivent|devra|devront)\s+(?:obligatoirement\s+)?(?:fournir|joindre|presenter|transmettre|produire|deposer|soumettre)\s*:?\s*|"
    r"(?:il\s+(?:est|sera)\s+demande\s+de\s+(?:fournir|joindre)\s*)|(?:joindre|fournir)\s*:?\s+|"
    r"(?:le dossier|la candidature)\s+(?:doit|devra)\s+(?:obligatoirement\s+)?(?:comprendre|comporter|contenir|inclure)\s*:?\s*)",
    re.I,
)


def _label(text: str) -> str:
    plain = re.sub(r"\s+", " ", text).strip().strip(";:,")
    accentless = norm_keep_case(plain)
    m = _LEAD_RE.match(accentless)
    if m and m.end() < len(plain) - 8:
        plain = plain[m.end():]
    plain = plain.strip(" ;:,.")
    plain = plain[:1].upper() + plain[1:]
    if len(plain) > 110:
        cut = plain[:107].rsplit(" ", 1)[0]
        plain = cut.rstrip(" ,;:-–(") + "…"
    return plain


def norm_keep_case(text: str) -> str:
    """Accent-free copy of text with identical length so regex offsets map back to the original."""
    import unicodedata

    out = []
    for ch in text:
        base = unicodedata.normalize("NFKD", ch)
        base = "".join(c for c in base if not unicodedata.combining(c)) or " "
        out.append(base[0] if len(base) >= 1 else " ")
    return "".join(out).replace("’", "'")


def _rid(doc_id: str, page: int, text: str) -> str:
    return "R-" + hashlib.sha1(f"{doc_id}|{page}|{norm(text)}".encode()).hexdigest()[:8]


def _similar(a: str, b: str) -> bool:
    ta, tb = set(norm(a).split()), set(norm(b).split())
    if not ta or not tb:
        return False
    return len(ta & tb) / len(ta | tb) >= 0.8


# --------------------------------------------------------------------------- main entry
def parse_call(doc_id: str, pages: list[dict]) -> tuple[list[ParsedRequirement], list[CallFact]]:
    requirements: list[ParsedRequirement] = []
    facts: list[CallFact] = []
    critical_sections: set[str] = set()
    for unit in _units(pages):
        for s in _sentences(unit):
            text = s.text.strip()
            n = norm(text)
            if len(n) < 12:
                continue
            intro = text.rstrip().endswith(":")
            if any(f" {k} " in f" {n} " for k in CRITICAL + ("obligatoire", "obligatoires")) and (intro or s.section_kind == "documents"):
                critical_sections.add(s.section)
            sentence_facts = _facts_from(s)
            facts.extend(sentence_facts)
            padded = f" {n} "
            normative = any(f" {k} " in padded for k in NORMATIVE)
            proof = taxonomy.detect_in_requirement(text)
            in_doc_list = s.section_kind == "documents" and (s.is_bullet or proof is not None)
            in_elig_list = s.section_kind == "eligibility" and s.is_bullet
            if intro or not (normative or in_doc_list or in_elig_list):
                continue
            if n.startswith(("tous les documents", "l ensemble des documents", "l ensemble des pieces", "toutes les pieces", "les documents")):
                proof = None
                in_doc_list = s.is_bullet and s.section_kind == "documents"
            if any(n.startswith(o.strip()) for o in ORGANISER_SUBJECTS) and "candidat" not in n:
                continue
            if s.section_kind == "evaluation" and not proof:
                continue  # selection criteria are not things the applicant must hand in
            if not proof and (any(f.key == "deadline" for f in sentence_facts) or (s.section_kind == "calendar" and find_dates(text))):
                continue  # dates become call facts, shown in the dossier header
            constraints = _constraints(text)
            rule_keys = [f.key for f in sentence_facts if f.key != "deadline"]
            if rule_keys and not in_doc_list:
                constraints["rule"] = rule_keys[0]
                proof = None
            if proof:
                kind = "document"
            elif constraints.get("rule"):
                kind = "rule"
            elif s.section_kind == "eligibility" or any(h in n for h in CONDITION_HINTS):
                kind = "condition"
            elif any(h in n for h in RULE_HINTS) or s.section_kind in {"budget", "format"}:
                kind = "rule"
            else:
                kind = "condition"
            optional = any(f" {k} " in padded for k in OPTIONAL)
            critical = any(f" {k} " in padded for k in CRITICAL) or (in_doc_list and s.section in critical_sections) or "obligatoire" in norm(s.section) or kind == "condition" or bool(constraints.get("rule"))
            reasons = []
            if in_doc_list:
                reasons.append(f"listé dans « {s.section[:60]} »")
            elif in_elig_list:
                reasons.append(f"condition listée dans « {s.section[:60]} »")
            if normative:
                hit = next(k for k in NORMATIVE if f" {k} " in padded)
                reasons.append(f"formulation obligatoire (« {hit} »)")
            if proof:
                reasons.append(f"pièce reconnue : {taxonomy.LABELS[proof]}")
            req = ParsedRequirement(
                id=_rid(doc_id, s.page, text), label=_label(text), statement=text, kind=kind, proof_type=proof,
                required=not optional, critical=critical and not optional, source_page=s.page, excerpt=text[:600],
                section=s.section[:120], reason=" · ".join(reasons), constraints=constraints,
                min_count=constraints.pop("min_count", 1),
            )
            _merge_or_add(requirements, req)
    return requirements, _dedupe_facts(facts)


def _merge_or_add(requirements: list[ParsedRequirement], req: ParsedRequirement) -> None:
    for existing in requirements:
        if existing.id == req.id or _similar(existing.statement, req.statement):
            existing.constraints.update(req.constraints)
            return
        # "La note de présentation ne doit pas dépasser 10 pages" refines the listed document.
        n = norm(req.statement)
        is_refinement = req.constraints and not any(k in n for k in ("fournir", "joindre", "transmettre", "presenter"))
        if req.proof_type and existing.proof_type == req.proof_type and existing.kind == "document" and is_refinement:
            existing.constraints.update(req.constraints)
            existing.min_count = max(existing.min_count, req.min_count)
            existing.statement = f"{existing.statement}\n{req.statement}"
            existing.reason += f" · précision p. {req.source_page}"
            return
    requirements.append(req)


def _dedupe_facts(facts: list[CallFact]) -> list[CallFact]:
    """Keep one value per key; for a deadline keep the latest date stated near a deadline keyword."""
    out: dict[str, CallFact] = {}
    for f in facts:
        if f.key not in out:
            out[f.key] = f
        elif f.key == "deadline" and str(f.value) > str(out[f.key].value):
            out[f.key] = f
    return list(out.values())


def parse_deadline(facts: list[CallFact]) -> date | None:
    for f in facts:
        if f.key == "deadline":
            return date.fromisoformat(str(f.value))
    return None
