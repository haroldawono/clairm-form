"""Language of the messages produced by the server (French or English).

The interface sends its language with each request (header `X-ClairForm-Lang`, or `?lang=` / cookie `cf_lang`
for plain links such as downloads). The middleware stores it in a context variable for the duration of the
request, and every user-facing message is written as `L("texte français", "English text")`.
Without any indication (scripts, tests, direct API calls) messages stay in French.
"""
from __future__ import annotations

import contextvars

SUPPORTED = ("fr", "en")
_LANG: contextvars.ContextVar[str] = contextvars.ContextVar("clairform_lang", default="fr")


def set_lang(value: str | None) -> contextvars.Token:
    value = (value or "").strip().lower()[:2]
    return _LANG.set(value if value in SUPPORTED else "fr")


def reset_lang(token: contextvars.Token) -> None:
    _LANG.reset(token)


def lang() -> str:
    return _LANG.get()


def L(fr: str, en: str) -> str:
    return en if _LANG.get() == "en" else fr


def plural_s(n: float) -> str:
    return "s" if abs(n) > 1 else ""


_REASON_RULES = [
    (r"^condition listée dans « (.*) »$", r"condition listed under “\1”"),
    (r"^listé dans « (.*) »$", r"listed under “\1”"),
    (r"^formulation obligatoire \(« (.*) »\)$", r"mandatory wording (“\1”)"),
    (r"^précision p\. (\d+)$", r"detail on p. \1"),
    (r"^nom du fichier : « (.*) »$", r"file name: “\1”"),
    (r"^titre du document : « (.*) »$", r"document title: “\1”"),
    (r"^contenu : (.*)$", r"content: \1"),
    (r"^ajoutée par vous$", "added by you"),
    (r"^aucun indice reconnu$", "no recognised clue"),
    (r"^type choisi par vous$", "type chosen by you"),
]


def reason(text: str | None) -> str | None:
    """Reasons are stored in French when a file is read; show them in English when the interface is in English."""
    import re

    if not text or _LANG.get() != "en":
        return text
    from .analysis import taxonomy

    parts = []
    for part in text.split(" · "):
        part = part.strip()
        m = re.match(r"^pièce reconnue : (.*)$", part)
        if m:
            code = next((c for c, lbl in taxonomy.LABELS.items() if lbl == m.group(1)), None)
            part = f"document recognised: {taxonomy.EN_LABELS.get(code, m.group(1)) if code else m.group(1)}"
        else:
            for pattern, repl in _REASON_RULES:
                new = re.sub(pattern, repl, part)
                if new != part:
                    part = new
                    break
        parts.append(part.replace("« ", "“").replace(" »", "”"))
    return " · ".join(parts)


_ERRORS_EN = {
    "DOC-EMPTY": "The file is empty.",
    "DOC-MISMATCH": "The content of the file does not match its extension.",
    "DOC-CORRUPT": "The file is damaged or unreadable.",
    "DOC-ENCRYPTED": "The PDF is password-protected.",
    "DOC-UNSAFE": "The file has an abnormal structure and was refused as a precaution.",
    "DOC-TOO-MANY-PAGES": "The document has too many pages.",
    "DOC-TIMEOUT": "Reading the file took too long and was stopped.",
    "UPLOAD-CANCELLED": "Import cancelled: the file was not added.",
    "TYPE-UNKNOWN": "Unknown document type.",
    "REQ-EXTRACTED": "A requirement read from the call cannot be deleted: dismiss it if it does not apply to you.",
    "LINK-KIND": "Only “document” requirements can receive files.",
    "BODY-TOO-LARGE": "Request too large.",
    "BAD-JSON": "The request body is not valid JSON.",
    "NOT-FOUND": "Item not found.",
    "BAD-ROLE": "The role parameter must be “call” or “piece”.",
    "BAD-NAME": "Missing file name.",
    "BAD-UPLOAD-ID": "Invalid import identifier.",
    "BAD-HOST": "Host not allowed.",
    "RATE-LIMIT": "Too many requests in a short time. Try again in a minute.",
    "INTERNAL": "Unexpected internal error. The details were written to the server log.",
}


def error_text(code: str, message: str) -> str:
    """English version of an API error message (messages are written in French at the source)."""
    import re

    if _LANG.get() != "en" or not message:
        return message
    nums = re.findall(r"\d+", message)
    n = nums[0] if nums else ""
    detail = re.search(r"\(([^()]*)\)\.?$", message)
    if code == "DOC-FORMAT":
        return ("For the call, use a PDF, a Word document (.docx) or a text file." if message.startswith("Pour l")
                else "Unsupported format.")
    if code == "DOC-TOO-LARGE":
        return f"The file exceeds the {n} MB limit." if n else "The file exceeds the maximum allowed size."
    if code == "DOC-NO-TEXT":
        return ("This document has no readable text (scanned document?). ClairForm has no OCR: use the digital version of the "
                "rules (text PDF, Word) or paste their text into a .txt file." if "OCR" in message
                else "This document has no readable text (scanned document?).")
    if code == "READER-SETUP":
        return ("Cannot read the file: a required library is not installed on this server"
                + (f" ({detail.group(1)})" if detail else "") + ". Run “pip install -r requirements.txt” and restart ClairForm.")
    if code == "WORKSPACE-FULL":
        return f"This space already holds {n} applications: delete one to create another."
    if code == "DOSSIER-FULL":
        return f"This application already holds {n} documents, the maximum allowed."
    if code == "CALL-FULL":
        return f"An application accepts at most {n} call documents."
    if code == "CSRF":
        return ("Request refused: missing security header." if "en-tête" in message else "Request refused: different origin.")
    if code == "INVALID":
        field = re.search(r"« (.*?) »", message)
        return f"Invalid field “{field.group(1) if field else '?'}”."
    if code == "NOT-FOUND":
        return "Application not found." if message.startswith("Dossier") else "Item not found."
    if code == "HTTP":
        return message
    base = _ERRORS_EN.get(code)
    if not base:
        return message
    if detail and code.startswith("DOC-") and code not in {"DOC-TOO-LARGE"}:
        return f"{base[:-1]} ({detail.group(1)})."
    return base
