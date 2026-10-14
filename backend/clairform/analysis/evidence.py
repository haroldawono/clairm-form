"""Facts read from a candidate's own documents: dates, amounts, signature cues, budget tables."""
from __future__ import annotations

import re
from datetime import date

from .text import find_amounts, find_dates, norm, parse_number, currency_code

ISSUE_CUES = ("delivre le", "delivree le", "etabli le", "etablie le", "emis le", "emise le", "fait a", "fait le", "date d emission",
              "date de delivrance", "date d etablissement", "en date du", "date", "le", "issued on", "date of issue", "dated")
EXPIRY_CUES = ("expire le", "expiration", "date d expiration", "valable jusqu", "valide jusqu", "valable au", "fin de validite",
               "expiry", "expires", "valid until", "valid through")
BIRTH_CUES = ("ne le", "nee le", "date de naissance", "naissance", "born", "date of birth")
SIGNATURE_CUES = ("signature", "signe", "signee", "lu et approuve", "signed", "cachet", "le directeur", "la directrice", "le president",
                  "la presidente", "le representant legal")
REQUESTED_CUES = ("montant demande", "subvention demandee", "contribution demandee", "financement demande", "montant sollicite",
                  "aide demandee", "requested amount", "amount requested", "demande au programme", "sollicite aupres")
COFI_CUES = ("apport", "fonds propres", "cofinancement", "co financement", "contribution propre", "autofinancement", "own contribution")
TOTAL_CUES = ("total",)


def classify_dates(text: str) -> dict:
    issue, expiry, other = [], [], []
    for d in find_dates(text):
        ctx = d.context[-22:]
        tail = f" {ctx.split(' ', 1)[1] if ' ' in ctx and len(d.context) > 22 else ctx} "
        if any(f" {c} " in tail for c in BIRTH_CUES):
            continue
        if any(f" {c} " in tail for c in EXPIRY_CUES) or " valable jusqu" in tail or " valide jusqu" in tail:
            expiry.append(d.value)
        elif any(f" {c} " in tail for c in ISSUE_CUES if c != "le") or tail.rstrip().endswith(" le"):
            issue.append(d.value)
        else:
            other.append(d.value)
    past = [d for d in issue + other if d <= date.today()]
    return {
        "issue_date": max(issue).isoformat() if issue else None,
        "latest_date": max(past).isoformat() if past else None,
        "expiry_date": min(expiry).isoformat() if expiry else None,
        "dates": sorted({d.isoformat() for d in issue + expiry + other}),
    }


def has_signature_cue(text: str) -> bool:
    n = f" {norm(text[-4000:])} "
    return any(f" {c} " in n for c in SIGNATURE_CUES)


def requested_amount_in_text(text: str) -> tuple[float, str | None] | None:
    for a in find_amounts(text):
        if any(c in a.context[-60:] for c in REQUESTED_CUES):
            return a.value, a.currency
    return None


def _row_label_amount(row: list) -> tuple[str, float | None, str | None]:
    label_parts, amount, currency = [], None, None
    for cell in row:
        if isinstance(cell, (int, float)) and not isinstance(cell, bool):
            amount = float(cell)  # last numeric cell of the row wins (amount column)
            continue
        s = str(cell).strip()
        if not s:
            continue
        maybe = parse_number(s)
        if maybe is not None and re.fullmatch(r"[\d\s  .,'€$£A-Za-z]*", s) and re.search(r"\d", s) and len(re.sub(r"\D", "", s)) >= 2:
            amount = maybe
            currency = currency_code(re.sub(r"[\d\s.,']", "", s)) or currency
            continue
        cur = currency_code(s)
        if cur and len(s) <= 6:
            currency = cur
            continue
        label_parts.append(s)
    return " ".join(label_parts), amount, currency


def _text_rows(text: str) -> list[list]:
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if "|" in line:
            rows.append([c.strip() for c in line.split("|")])
            continue
        m = re.match(r"^(.*?[A-Za-zÀ-ÿ].*?)[\s.:…]{2,}((?:€|EUR|USD|\$)?\s?[\d][\d\s  .,']*\s?(?:€|EUR|euros?|FCFA|F CFA|XAF|XOF|USD|\$)?)$", line)
        if m:
            rows.append([m.group(1).strip(" .:"), m.group(2).strip()])
    return rows


def analyse_budget(tables: list[dict], text: str) -> dict | None:
    """Read a budget table: expense lines, the stated total, the requested amount and own contribution.

    Returns None when no recognisable budget structure is present. Every figure keeps the row
    label it came from so the UI can quote it.
    """
    candidates = [t.get("rows") or [] for t in tables] + [_text_rows(text)]
    best = None
    for rows in candidates:
        lines, totals, requested, cofi, currency = [], [], None, [], None
        block: list[dict] = []
        for row in rows:
            label, amount, cur = _row_label_amount(row)
            currency = currency or cur
            if amount is None or not label:
                continue
            n = norm(label)
            if any(c in n for c in REQUESTED_CUES):
                requested = {"label": label, "amount": amount}
                block.append({"label": label, "amount": amount})
                continue
            if any(n.startswith(c) or f" {c} " in f" {n} " for c in TOTAL_CUES):
                if block:
                    totals.append({"label": label, "amount": amount, "lines_sum": round(sum(l["amount"] for l in block), 2),
                                   "line_count": len(block), "is_expenses": not any(c in n for c in ("ressource", "recette", "financement", "income"))})
                    block = []
                continue
            entry = {"label": label, "amount": amount}
            if any(c in n for c in COFI_CUES):
                cofi.append(entry)
            lines.append(entry)
            block.append(entry)
        if totals or requested:
            score = len(totals) * 2 + (1 if requested else 0) + len(lines) / 100
            if best is None or score > best[0]:
                expense_total = next((t for t in totals if t["is_expenses"]), totals[0] if totals else None)
                best = (score, {
                    "currency": currency or _currency_from_rows(rows) or _currency_from_text(text),
                    "line_count": len(lines),
                    "totals": totals,
                    "expense_total": expense_total["amount"] if expense_total else None,
                    "requested": requested,
                    "cofinancing": {"amount": round(sum(c["amount"] for c in cofi), 2), "lines": [c["label"] for c in cofi]} if cofi else None,
                })
    return best[1] if best else None


def _currency_from_rows(rows: list[list]) -> str | None:
    for row in rows[:40]:
        for cell in row:
            if isinstance(cell, str):
                m = re.search(r"€|\b(EUR|euros?|XAF|XOF|FCFA|F CFA|USD)\b", cell, re.I)
                if m:
                    return currency_code(m.group(0))
    return None


def _currency_from_text(text: str) -> str | None:
    amounts = find_amounts(text)
    codes = [a.currency for a in amounts if a.currency]
    return max(set(codes), key=codes.count) if codes else None


def timeline_span(text: str, tables: list[dict]) -> dict | None:
    dates = [d.value for d in find_dates(text) if d.value.year >= 2000]
    if len(dates) < 2:
        return None
    start, end = min(dates), max(dates)
    return {"start": start.isoformat(), "end": end.isoformat(), "months": round((end.year - start.year) * 12 + (end.month - start.month) + (end.day - start.day) / 30, 1)}


def document_facts(proof_type: str, text: str, tables: list[dict], page_count: int | None, meta: dict) -> dict:
    facts = classify_dates(text)
    facts["signature_cue"] = has_signature_cue(text) if text else None
    req = requested_amount_in_text(text)
    if req:
        facts["requested_amount"] = {"amount": req[0], "currency": req[1]}
    if proof_type == "budget" or (tables and any("total" in norm(" ".join(str(c) for c in r)) for t in tables for r in (t.get("rows") or [])[:200])):
        budget = analyse_budget(tables, text)
        if budget:
            facts["budget"] = budget
    if proof_type == "timeline":
        span = timeline_span(text, tables)
        if span:
            facts["timeline"] = span
    if meta.get("uncached_formulas"):
        facts["uncached_formulas"] = meta["uncached_formulas"]
    return facts


def today() -> date:
    return date.today()
