"""Read every demonstration file with ClairForm's real reader and print the result.

    python scripts/check_samples.py

Use it to confirm, on your own machine, that documents are read correctly (no "corrompu / illisible").
Files in 4_cas_limites/ are expected to be refused or flagged; all others must be read.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ["CLAIRFORM_DATA_DIR"] = tempfile.mkdtemp(prefix="clairform-check-")

from clairform.config import Settings  # noqa: E402
from clairform.ingest.files import UploadRejected, reader_status, self_test  # noqa: E402
from clairform.service import Conflict, Service  # noqa: E402


def main() -> None:
    samples = ROOT / "data" / "samples"
    if not (samples / "1_appel").is_dir():
        subprocess.run([sys.executable, str(ROOT / "scripts" / "make_samples.py")], check=True)
    settings = Settings()
    problems = self_test(settings)
    print("Auto-test de lecture :", "OK" if not problems else "ÉCHEC — " + " ; ".join(problems))
    service = Service(settings)
    dossier = service.create_dossier("Vérification des fichiers")
    failures = 0
    for path in sorted(p for p in samples.rglob("*") if p.is_file() and p.name != "LISEZMOI.txt"):
        role = "call" if path.parent.name == "1_appel" or path.name.startswith("appel_") else "piece"
        expected_refusal = path.parent.name == "4_cas_limites" and path.suffix not in {".jpg"}
        try:
            doc = service.add_document(dossier["id"], role, path.name, path.read_bytes())
            detail = f"lu ({doc['page_count'] or 1} p.)" + (f" → {doc['proof_type_label']}" if doc.get("proof_type_label") else "")
            ok = not expected_refusal
        except (UploadRejected, Conflict) as err:
            detail = f"refusé : {err.message}"
            ok = expected_refusal
        failures += not ok
        print(f"{'OK ' if ok else 'KO '} {path.relative_to(samples)} — {detail}")
    print("Lecteur :", "processus isolé" if reader_status()["isolated"] else f"lecture interne ({reader_status()['reason']})")
    print("Résultat :", "tous les fichiers ont le comportement attendu." if not failures else f"{failures} fichier(s) en écart.")
    sys.exit(1 if failures or problems else 0)


if __name__ == "__main__":
    main()
