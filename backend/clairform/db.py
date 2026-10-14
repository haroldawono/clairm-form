"""SQLite persistence. One short-lived connection per operation; all statements are parameterised."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS dossiers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    program TEXT NOT NULL DEFAULT '',
    deadline TEXT,
    deadline_source TEXT,
    call_facts TEXT NOT NULL DEFAULT '[]',
    is_demo INTEGER NOT NULL DEFAULT 0,
    workspace TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('call','piece')),
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    page_count INTEGER,
    has_text INTEGER NOT NULL,
    pages TEXT NOT NULL,
    tables TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}',
    proof_type TEXT,
    proof_type_source TEXT,
    proof_confidence TEXT,
    proof_reasons TEXT NOT NULL DEFAULT '[]',
    facts TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_dossier ON documents(dossier_id);
CREATE TABLE IF NOT EXISTS requirements (
    dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('extracted','manual')),
    source_doc_id TEXT,
    label TEXT NOT NULL,
    statement TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('document','condition','rule')),
    proof_type TEXT,
    required INTEGER NOT NULL DEFAULT 1,
    critical INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ignored')),
    declared INTEGER NOT NULL DEFAULT 0,
    reviewed INTEGER NOT NULL DEFAULT 0,
    source_page INTEGER,
    excerpt TEXT NOT NULL DEFAULT '',
    section TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    constraints TEXT NOT NULL DEFAULT '{}',
    min_count INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (dossier_id, id)
);
CREATE TABLE IF NOT EXISTS links (
    dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('confirmed','rejected')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (dossier_id, requirement_id, document_id)
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_dossier ON events(dossier_id);
"""

JSON_FIELDS = {"call_facts", "pages", "tables", "meta", "proof_reasons", "facts", "constraints", "detail"}
BOOL_FIELDS = {"is_demo", "has_text", "required", "critical", "declared", "reviewed"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    out = {}
    for key in row.keys():
        value = row[key]
        if key in JSON_FIELDS and isinstance(value, str):
            value = json.loads(value)
        elif key in BOOL_FIELDS and value is not None:
            value = bool(value)
        out[key] = value
    return out


def _dump(value: Any) -> Any:
    return json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self.connect() as con:
            con.executescript(SCHEMA)
            cols = {r[1] for r in con.execute("PRAGMA table_info(dossiers)").fetchall()}
            if "workspace" not in cols:  # database created by an earlier version
                con.execute("ALTER TABLE dossiers ADD COLUMN workspace TEXT NOT NULL DEFAULT 'local'")
            con.execute("CREATE INDEX IF NOT EXISTS dossiers_workspace ON dossiers(workspace)")

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            con = sqlite3.connect(self.path, timeout=10)
            con.row_factory = sqlite3.Row
            con.execute("PRAGMA foreign_keys=ON")
            try:
                yield con
                con.commit()
            except Exception:
                con.rollback()
                raise
            finally:
                con.close()

    # ------------------------------------------------------------------ dossiers
    def create_dossier(self, id: str, title: str, program: str, deadline: str | None, is_demo: bool = False, workspace: str = "local") -> dict:
        ts = now_iso()
        with self.connect() as con:
            con.execute(
                "INSERT INTO dossiers (id,title,program,deadline,deadline_source,is_demo,workspace,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (id, title, program, deadline, "user" if deadline else None, int(is_demo), workspace, ts, ts),
            )
        return self.dossier(id)

    def dossier(self, id: str) -> dict | None:
        with self.connect() as con:
            return _row(con.execute("SELECT * FROM dossiers WHERE id=?", (id,)).fetchone())

    def dossiers(self, workspace: str = "local") -> list[dict]:
        with self.connect() as con:
            return [_row(r) for r in con.execute("SELECT * FROM dossiers WHERE workspace=? ORDER BY updated_at DESC", (workspace,)).fetchall()]

    def stale_dossiers(self, before_iso: str) -> list[str]:
        with self.connect() as con:
            return [r[0] for r in con.execute("SELECT id FROM dossiers WHERE workspace<>'local' AND updated_at<?", (before_iso,)).fetchall()]

    def update_dossier(self, id: str, **fields) -> dict | None:
        allowed = {"title", "program", "deadline", "deadline_source", "call_facts"}
        sets = {k: _dump(v) for k, v in fields.items() if k in allowed}
        sets["updated_at"] = now_iso()
        with self.connect() as con:
            con.execute(f"UPDATE dossiers SET {', '.join(f'{k}=?' for k in sets)} WHERE id=?", (*sets.values(), id))
        return self.dossier(id)

    def touch(self, id: str) -> None:
        with self.connect() as con:
            con.execute("UPDATE dossiers SET updated_at=? WHERE id=?", (now_iso(), id))

    def delete_dossier(self, id: str) -> bool:
        with self.connect() as con:
            return con.execute("DELETE FROM dossiers WHERE id=?", (id,)).rowcount > 0

    # ------------------------------------------------------------------ documents
    def add_document(self, doc: dict) -> dict:
        cols = list(doc)
        with self.connect() as con:
            con.execute(f"INSERT INTO documents ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", tuple(_dump(doc[c]) for c in cols))
        return self.document(doc["dossier_id"], doc["id"])

    def document(self, dossier_id: str, doc_id: str) -> dict | None:
        with self.connect() as con:
            return _row(con.execute("SELECT * FROM documents WHERE dossier_id=? AND id=?", (dossier_id, doc_id)).fetchone())

    def documents(self, dossier_id: str, role: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM documents WHERE dossier_id=?", [dossier_id]
        if role:
            q += " AND role=?"
            args.append(role)
        with self.connect() as con:
            return [_row(r) for r in con.execute(q + " ORDER BY created_at, rowid", args).fetchall()]

    def update_document(self, dossier_id: str, doc_id: str, **fields) -> dict | None:
        allowed = {"proof_type", "proof_type_source", "proof_confidence", "proof_reasons", "facts", "name"}
        sets = {k: _dump(v) for k, v in fields.items() if k in allowed}
        if sets:
            with self.connect() as con:
                con.execute(f"UPDATE documents SET {', '.join(f'{k}=?' for k in sets)} WHERE dossier_id=? AND id=?", (*sets.values(), dossier_id, doc_id))
        return self.document(dossier_id, doc_id)

    def delete_document(self, dossier_id: str, doc_id: str) -> bool:
        with self.connect() as con:
            con.execute("DELETE FROM links WHERE dossier_id=? AND document_id=?", (dossier_id, doc_id))
            return con.execute("DELETE FROM documents WHERE dossier_id=? AND id=?", (dossier_id, doc_id)).rowcount > 0

    # ------------------------------------------------------------------ requirements
    def replace_extracted_requirements(self, dossier_id: str, source_doc_id: str, items: list[dict]) -> None:
        ts = now_iso()
        with self.connect() as con:
            con.execute("DELETE FROM requirements WHERE dossier_id=? AND origin='extracted' AND source_doc_id=?", (dossier_id, source_doc_id))
            start = con.execute("SELECT COALESCE(MAX(position),0) FROM requirements WHERE dossier_id=?", (dossier_id,)).fetchone()[0]
            for i, item in enumerate(items, 1):
                row = {"dossier_id": dossier_id, "origin": "extracted", "source_doc_id": source_doc_id, "position": start + i,
                       "created_at": ts, "updated_at": ts, **item}
                cols = list(row)
                con.execute(f"INSERT OR REPLACE INTO requirements ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                            tuple(_dump(row[c]) for c in cols))

    def add_requirement(self, dossier_id: str, item: dict) -> dict:
        ts = now_iso()
        with self.connect() as con:
            pos = con.execute("SELECT COALESCE(MAX(position),0)+1 FROM requirements WHERE dossier_id=?", (dossier_id,)).fetchone()[0]
            row = {"dossier_id": dossier_id, "position": pos, "created_at": ts, "updated_at": ts, **item}
            cols = list(row)
            con.execute(f"INSERT INTO requirements ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", tuple(_dump(row[c]) for c in cols))
        return self.requirement(dossier_id, item["id"])

    def requirement(self, dossier_id: str, rid: str) -> dict | None:
        with self.connect() as con:
            return _row(con.execute("SELECT * FROM requirements WHERE dossier_id=? AND id=?", (dossier_id, rid)).fetchone())

    def requirements(self, dossier_id: str) -> list[dict]:
        with self.connect() as con:
            return [_row(r) for r in con.execute("SELECT * FROM requirements WHERE dossier_id=? ORDER BY position", (dossier_id,)).fetchall()]

    def update_requirement(self, dossier_id: str, rid: str, **fields) -> dict | None:
        allowed = {"label", "kind", "proof_type", "required", "critical", "status", "declared", "reviewed", "note", "min_count", "constraints"}
        sets = {k: (int(v) if isinstance(v, bool) else _dump(v)) for k, v in fields.items() if k in allowed}
        if sets:
            sets["updated_at"] = now_iso()
            with self.connect() as con:
                con.execute(f"UPDATE requirements SET {', '.join(f'{k}=?' for k in sets)} WHERE dossier_id=? AND id=?", (*sets.values(), dossier_id, rid))
        return self.requirement(dossier_id, rid)

    def delete_requirement(self, dossier_id: str, rid: str) -> bool:
        with self.connect() as con:
            con.execute("DELETE FROM links WHERE dossier_id=? AND requirement_id=?", (dossier_id, rid))
            return con.execute("DELETE FROM requirements WHERE dossier_id=? AND id=?", (dossier_id, rid)).rowcount > 0

    # ------------------------------------------------------------------ links
    def set_link(self, dossier_id: str, rid: str, doc_id: str, decision: str | None) -> None:
        with self.connect() as con:
            if decision is None:
                con.execute("DELETE FROM links WHERE dossier_id=? AND requirement_id=? AND document_id=?", (dossier_id, rid, doc_id))
            else:
                con.execute("INSERT OR REPLACE INTO links (dossier_id,requirement_id,document_id,decision,created_at) VALUES (?,?,?,?,?)",
                            (dossier_id, rid, doc_id, decision, now_iso()))

    def links(self, dossier_id: str) -> list[dict]:
        with self.connect() as con:
            return [_row(r) for r in con.execute("SELECT * FROM links WHERE dossier_id=?", (dossier_id,)).fetchall()]

    # ------------------------------------------------------------------ events
    def log(self, dossier_id: str, kind: str, detail: dict | None = None) -> None:
        with self.connect() as con:
            con.execute("INSERT INTO events (dossier_id,at,kind,detail) VALUES (?,?,?,?)", (dossier_id, now_iso(), kind, _dump(detail or {})))
            con.execute("UPDATE dossiers SET updated_at=? WHERE id=?", (now_iso(), dossier_id))

    def events(self, dossier_id: str, limit: int = 200) -> list[dict]:
        with self.connect() as con:
            return [_row(r) for r in con.execute("SELECT * FROM events WHERE dossier_id=? ORDER BY id DESC LIMIT ?", (dossier_id, limit)).fetchall()]
