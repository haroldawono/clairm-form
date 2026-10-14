"""Write the fictional sample files to data/samples/ (dates are relative to today).

    python scripts/make_samples.py

Produces:
  data/samples/1_appel/        the call for proposals (PDF)
  data/samples/2_pieces/       a first, imperfect set of pieces (expired extract, 12-page note, wrong budget total…)
  data/samples/3_corrections/  the corrected pieces and the missing ones
  data/samples/4_cas_limites/  files that must be rejected or flagged (scan without text, fake PDF, empty file)
"""
from __future__ import annotations

import io
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from clairform import samples  # noqa: E402

README = """Fichiers de démonstration ClairForm
============================================

Générés le {today} par scripts/make_samples.py (les dates internes sont relatives à ce jour).

Parcours conseillé :
1. Créez un dossier, puis importez 1_appel/appel_a_projets_tremplin_impact.pdf dans l'onglet « Appel ».
2. Importez tous les fichiers de 2_pieces/ dans l'onglet « Pièces » : ClairForm signale un extrait trop ancien,
   une note trop longue, un total de budget faux, un CV et une lettre de soutien manquants.
3. Importez 3_corrections/, supprimez les anciennes versions, confirmez les conditions d'éligibilité :
   le dossier devient « Prêt à déposer ».
4. 4_cas_limites/ contient des fichiers qui doivent être refusés ou signalés proprement.

Le programme, l'association et les personnes sont inventés pour la démonstration ;
les documents d'administration portent la mention SPÉCIMEN.
"""


def scanned_pdf() -> bytes:
    """A PDF whose only content is an image: what a phone scan looks like (no selectable text)."""
    from PIL import Image, ImageDraw
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    img = Image.new("RGB", (900, 560), "white")
    d = ImageDraw.Draw(img)
    d.rectangle((20, 20, 880, 540), outline="black", width=4)
    for y in range(80, 500, 40):
        d.line((60, y, 840, y), fill=(120, 120, 120), width=6)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=A4)
    c.drawImage(ImageReader(io.BytesIO(buf.getvalue())), 60, 400, width=450, height=280)
    c.showPage()
    c.save()
    return out.getvalue()


def photo_jpg() -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (640, 400), (230, 236, 242))
    ImageDraw.Draw(img).rectangle((40, 40, 600, 360), outline=(30, 40, 60), width=5)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def main() -> None:
    today = date.today()
    base = ROOT / "data" / "samples"
    if base.exists():
        shutil.rmtree(base)
    folders = {k: base / k for k in ("1_appel", "2_pieces", "3_corrections", "4_cas_limites")}
    for f in folders.values():
        f.mkdir(parents=True)
    (folders["1_appel"] / "appel_a_projets_tremplin_impact.pdf").write_bytes(samples.call_pdf(today))
    for name, data in samples.demo_pieces(today):
        (folders["2_pieces"] / name).write_bytes(data)
    for name, data in samples.correction_pieces(today):
        (folders["3_corrections"] / name).write_bytes(data)
    edge = folders["4_cas_limites"]
    (edge / "appel_scanne_sans_texte.pdf").write_bytes(scanned_pdf())
    (edge / "faux_document.pdf").write_bytes(b"Ceci n'est pas un PDF, seulement du texte renomme.\n")
    (edge / "fichier_vide.txt").write_bytes(b"")
    (edge / "photo_carte_identite.jpg").write_bytes(photo_jpg())
    (edge / "programme.exe").write_bytes(b"MZ\x90\x00 fichier executable factice")
    (base / "LISEZMOI.txt").write_text(README.format(today=today.isoformat()), encoding="utf-8")
    count = sum(1 for _ in base.rglob("*") if _.is_file())
    print(f"{count} fichiers écrits dans {base.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
