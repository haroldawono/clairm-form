"""Text utilities shared by the analysers: normalisation, dates, amounts, numbers (FR + EN)."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date

_WS = re.compile(r"[\s  ]+")


def strip_accents(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def norm(text: str) -> str:
    """Lower-case, accent-free, apostrophes/punctuation turned into spaces, single spaced."""
    t = strip_accents(text.replace("’", "'").replace("œ", "oe").replace("Œ", "oe")).lower()
    t = re.sub(r"[^a-z0-9%]+", " ", t)
    return _WS.sub(" ", t).strip()


def contains_any(normalized_text: str, needles) -> list[str]:
    """Return the needles (already normalised) found as whole-word sequences in normalized_text."""
    padded = f" {normalized_text} "
    return [n for n in needles if f" {n} " in padded]


STOPWORDS = set(
    norm(
        "le la les un une des du de d l au aux et ou en a dans par pour sur avec sans ce cette ces son sa ses "
        "leur leurs votre vos notre nos qui que quoi dont est sont etre doit doivent devra devront peut peuvent "
        "tout tous toute toutes plus moins pas ne n y il elle ils elles on se s sous chaque entre afin ainsi "
        "the a an of to and or in for on with by be is are must shall should may from as at this that each "
        "candidat candidate candidats dossier projet porteur fournir joindre document documents copie"
    ).split()
)


def keywords(text: str, minimum: int = 4) -> list[str]:
    seen: dict[str, None] = {}
    for token in norm(text).split():
        if len(token) >= minimum and token not in STOPWORDS and not token.isdigit():
            seen.setdefault(token[:9], None)  # crude stemming: 9-char prefix
    return list(seen)


# --------------------------------------------------------------------------- numbers
NUMBER_WORDS = {
    "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8,
    "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "quinze": 15, "vingt": 20, "trente": 30,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "ten": 10, "twelve": 12,
}


def parse_small_number(token: str) -> int | None:
    token = norm(token)
    if token.isdigit():
        return int(token)
    return NUMBER_WORDS.get(token)


# --------------------------------------------------------------------------- dates
MONTHS = {
    "janvier": 1, "janv": 1, "fevrier": 2, "fevr": 2, "fev": 2, "mars": 3, "avril": 4, "avr": 4, "mai": 5,
    "juin": 6, "juillet": 7, "juil": 7, "aout": 8, "septembre": 9, "sept": 9, "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11, "decembre": 12, "dec": 12,
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3, "april": 4, "apr": 4, "may": 5,
    "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8, "september": 9, "sep": 9,
    "october": 10, "november": 11, "december": 12,
}
_MONTH_ALT = "|".join(sorted(MONTHS, key=len, reverse=True))
_DATE_PATTERNS = [
    ("iso", re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")),
    ("dmy", re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b")),
    ("d_month_y", re.compile(rf"\b(\d{{1,2}})(?:er|st|nd|rd|th)?\s+({_MONTH_ALT})\.?\s+(\d{{4}})\b")),
    ("month_d_y", re.compile(rf"\b({_MONTH_ALT})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b")),
]


@dataclass
class FoundDate:
    value: date
    start: int
    end: int
    context: str  # normalised text preceding the date (up to 60 chars)


def find_dates(text: str) -> list[FoundDate]:
    """Find dates in raw text. Works on an accent-free lower-case copy with identical offsets."""
    low = strip_accents(text.replace("’", "'")).lower()
    if len(low) != len(text):  # extremely rare (ligatures); fall back to a safe per-char mapping
        low = "".join(strip_accents(c).lower()[:1] or " " for c in text)
    out: list[FoundDate] = []
    taken: list[tuple[int, int]] = []
    for kind, rx in _DATE_PATTERNS:
        for m in rx.finditer(low):
            if any(m.start() < e and m.end() > s for s, e in taken):
                continue
            try:
                if kind == "iso":
                    d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                elif kind == "dmy":
                    d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                elif kind == "d_month_y":
                    d = date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
                else:
                    d = date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
            except (ValueError, KeyError):
                continue
            if not 1950 <= d.year <= 2100:
                continue
            taken.append((m.start(), m.end()))
            out.append(FoundDate(d, m.start(), m.end(), norm(low[max(0, m.start() - 60): m.start()])))
    out.sort(key=lambda f: f.start)
    return out


def add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day)


def months_between(earlier: date, later: date) -> float:
    return (later.year - earlier.year) * 12 + (later.month - earlier.month) + (later.day - earlier.day) / 30.0


# --------------------------------------------------------------------------- amounts
_CURRENCY_TOKENS = [
    (r"€|eur(?:os?)?\b", "EUR"),
    (r"f\s?cfa\b|francs?\s+cfa\b|cfa\b", "FCFA"),
    (r"xaf\b", "XAF"),
    (r"xof\b", "XOF"),
    (r"usd\b|us\$|\$|dollars?\b", "USD"),
    (r"gbp\b|£", "GBP"),
]
_CUR = "|".join(f"(?:{p})" for p, _ in _CURRENCY_TOKENS)
_NUM = r"\d{1,3}(?:[   .,']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?"
AMOUNT_RE = re.compile(
    rf"(?:(?P<cur1>{_CUR})\s?(?P<num1>{_NUM}))|(?:(?P<num2>{_NUM})\s?(?P<mult>millions?|k)?\s?(?P<cur2>{_CUR}))",
    re.I,
)


def currency_code(token: str | None) -> str | None:
    if not token:
        return None
    t = token.lower().strip()
    for pattern, code in _CURRENCY_TOKENS:
        if re.fullmatch(pattern, t, re.I) or re.match(pattern, t, re.I):
            return code
    return None


def parse_number(raw) -> float | None:
    """Parse '42 000', '42.000,50', '42,000.50', '42000' or a numeric cell value."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().replace(" ", " ").replace(" ", " ").replace("'", " ")
    s = re.sub(r"(?i)(eur(os?)?|€|f\s?cfa|xaf|xof|usd|\$|£)", "", s).strip()
    s = s.replace(" ", "")
    if not s or not re.fullmatch(r"-?[\d.,]+", s):
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        s = s.replace(",", "") if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3) else s.replace(",", ".")
    elif "." in s:
        parts = s.split(".")
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


@dataclass
class FoundAmount:
    value: float
    currency: str | None
    start: int
    end: int
    context: str


def find_amounts(text: str) -> list[FoundAmount]:
    out = []
    for m in AMOUNT_RE.finditer(text):
        num = m.group("num1") or m.group("num2")
        cur = m.group("cur1") or m.group("cur2")
        value = parse_number(num)
        if value is None:
            continue
        mult = (m.group("mult") or "").lower()
        if mult.startswith("million"):
            value *= 1_000_000
        elif mult == "k":
            value *= 1_000
        out.append(FoundAmount(value, currency_code(cur), m.start(), m.end(), norm(text[max(0, m.start() - 80): m.start()])))
    return out


def format_amount(value: float | None, currency: str | None = None) -> str:
    if value is None:
        return "—"
    whole = f"{value:,.2f}".rstrip("0").rstrip(".") if value % 1 else f"{value:,.0f}"
    whole = whole.replace(",", " ")
    symbol = {"EUR": "€", "USD": "$", "GBP": "£"}.get(currency or "", currency or "")
    return f"{whole} {symbol}".strip()


def format_date_fr(d: date | None) -> str:
    if not d:
        return "—"
    months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    return f"{d.day} {months[d.month - 1]} {d.year}"
