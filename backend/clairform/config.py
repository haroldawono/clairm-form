"""Runtime configuration. Every value can be overridden with an environment variable."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("CLAIRFORM_DATA_DIR", ROOT / "storage")))
    frontend_dir: Path = field(default_factory=lambda: ROOT / "frontend" / "dist")
    host: str = field(default_factory=lambda: os.environ.get("CLAIRFORM_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: _int("CLAIRFORM_PORT", 8000))
    max_upload_bytes: int = field(default_factory=lambda: _int("CLAIRFORM_MAX_UPLOAD_MB", 20) * 1024 * 1024)
    max_documents_per_dossier: int = field(default_factory=lambda: _int("CLAIRFORM_MAX_DOCUMENTS", 60))
    max_call_documents: int = 5
    max_pdf_pages: int = field(default_factory=lambda: _int("CLAIRFORM_MAX_PDF_PAGES", 400))
    max_text_chars: int = 2_000_000
    extraction_timeout_s: int = field(default_factory=lambda: _int("CLAIRFORM_EXTRACTION_TIMEOUT", 45))
    rate_limit_per_minute: int = field(default_factory=lambda: _int("CLAIRFORM_RATE_LIMIT", 600))
    # Extra host names accepted in the Host header (comma separated), e.g. for a LAN demo.
    extra_hosts: tuple[str, ...] = field(
        default_factory=lambda: tuple(h.strip().lower() for h in os.environ.get("CLAIRFORM_ALLOWED_HOSTS", "").split(",") if h.strip())
    )

    # "local": single user on this computer. "public": online deployment, each browser gets its own private space.
    mode: str = field(default_factory=lambda: os.environ.get("CLAIRFORM_MODE", "local").strip().lower())
    # "isolated" (default): each file is read in a separate, resource-limited process.
    # "inprocess": read inside the server process (faster on very small hosting plans, e.g. 0.1 CPU).
    reader: str = field(default_factory=lambda: os.environ.get("CLAIRFORM_READER", "isolated").strip().lower())
    retention_days: int = field(default_factory=lambda: _int("CLAIRFORM_RETENTION_DAYS", 7))
    max_dossiers_per_workspace: int = field(default_factory=lambda: _int("CLAIRFORM_MAX_DOSSIERS", 10))

    @property
    def public(self) -> bool:
        return self.mode == "public"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "clairform.sqlite3"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"


ALLOWED_EXTENSIONS = {
    # extension: (role constraint, description)
    "pdf": "PDF",
    "docx": "Word",
    "xlsx": "Excel",
    "csv": "CSV",
    "txt": "Texte",
    "md": "Markdown",
    "png": "Image PNG",
    "jpg": "Image JPEG",
    "jpeg": "Image JPEG",
}
CALL_EXTENSIONS = {"pdf", "docx", "txt", "md"}
