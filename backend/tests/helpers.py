"""Shared helpers for the test-suite (stdlib unittest; also runnable with pytest)."""
from __future__ import annotations

import io
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def make_settings(**overrides):
    from clairform.config import Settings

    tmp = tempfile.mkdtemp(prefix="clairform-test-")
    os.environ["CLAIRFORM_DATA_DIR"] = tmp
    s = Settings()
    if overrides:
        from dataclasses import replace

        s = replace(s, **overrides)
    return s


def text_pdf(pages: list[list[str]]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=A4)
    for lines in pages:
        y = 800
        for line in lines:
            c.drawString(50, y, line)
            y -= 18
        c.showPage()
    c.save()
    return out.getvalue()


def docx_bytes(paragraphs: list[str]) -> bytes:
    from docx import Document

    d = Document()
    for p in paragraphs:
        d.add_paragraph(p)
    out = io.BytesIO()
    d.save(out)
    return out.getvalue()


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    """A real uvicorn process serving ClairForm on a free port with an isolated data directory."""

    def __init__(self, **env):
        self.port = free_port()
        self.data_dir = tempfile.mkdtemp(prefix="clairform-srv-")
        self.env = {**os.environ, "CLAIRFORM_DATA_DIR": self.data_dir, **{k: str(v) for k, v in env.items()}}
        self.proc: subprocess.Popen | None = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def __enter__(self):
        self.proc = subprocess.Popen(
            [sys.executable, str(ROOT / "scripts" / "run.py"), "--port", str(self.port)],
            env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        import urllib.request

        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(self.url + "/api/health", timeout=1) as r:
                    if r.status == 200:
                        return self
            except Exception:
                time.sleep(0.15)
        self.__exit__(None, None, None)
        raise RuntimeError("le serveur ClairForm n'a pas démarré")

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            self.output = self.proc.stdout.read().decode("utf-8", "replace") if self.proc.stdout else ""
            if self.proc.stdout:
                self.proc.stdout.close()
