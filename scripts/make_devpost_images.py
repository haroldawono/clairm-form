"""Build the Devpost gallery images from the real screenshots in docs/screenshots (run capture_media.py first).

Produces devpost/images/:
  00_couverture.png   3:2 cover — a real screenshot of the call reader with the product name and one-line pitch
  01..07_*.png        3:2 crops of real screenshots, each with a short caption band
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "devpost" / "images"
FONTS = ROOT / "frontend" / "public" / "fonts"
W, H = 1500, 1000
INK, PAPER, STAMP, MARKER = (27, 36, 48), (238, 241, 244), (36, 69, 199), (255, 228, 92)


def font(name: str, size: int, weight: int | None = None):
    f = ImageFont.truetype(str(FONTS / name), size)
    if weight is not None:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def fit(img: Image.Image, width: int, height: int) -> Image.Image:
    ratio = width / img.width
    img = img.resize((width, int(img.height * ratio)), Image.LANCZOS)
    return img.crop((0, 0, width, min(height, img.height)))


def framed(shot: Path, caption: str, name: str, crop_top: int = 0) -> None:
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)
    band = 128
    d.rectangle((0, H - band, W, H), fill=INK)
    d.text((56, H - band + 40), caption, font=font("Inter-Medium.otf", 36), fill=(255, 255, 255))
    img = Image.open(shot).convert("RGB")
    img = img.crop((0, crop_top, img.width, img.height))
    canvas.paste(fit(img, W, H - band), (0, 0))
    canvas.save(OUT / name, optimize=True)


def cover() -> None:
    canvas = Image.new("RGB", (W, H), PAPER)
    shot = Image.open(SHOTS / "cover_reader.png").convert("RGB")  # the highlighted call text, real UI
    scale = 1380 / shot.width
    shot = shot.resize((1380, int(shot.height * scale)), Image.LANCZOS)
    frame = Image.new("RGB", (shot.width + 2, shot.height + 2), (211, 217, 225))
    frame.paste(shot, (1, 1))
    canvas.paste(frame, (60, 540))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((60, 70, 124, 134), radius=12, fill=STAMP)
    d.line((80, 104, 90, 114, 106, 92), fill=(255, 255, 255), width=6, joint="curve")
    d.text((146, 72), "ClairForm", font=font("Lora-Variable.ttf", 54, 600), fill=INK)
    title = font("Lora-Variable.ttf", 64, 600)
    d.text((60, 190), "Votre dossier de candidature,", font=title, fill=INK)
    d.text((60, 268), "vérifié pièce par pièce.", font=title, fill=INK)
    body = font("Inter-Regular.otf", 27)
    for i, line in enumerate(["Lit le règlement, établit la checklist, contrôle vos pièces.",
                              "100 % local : aucun document ne quitte l’ordinateur."]):
        d.text((62, 372 + i * 40), line, font=body, fill=(74, 85, 101))
    d.rectangle((60, 478, 74, 492), fill=MARKER)
    d.text((86, 470), "Capture réelle de l’application", font=font("Inter-Regular.otf", 21), fill=(107, 116, 128))
    canvas.save(OUT / "00_couverture.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cover()
    items = [
        ("03_appel_surligne_desktop.png", "Chaque exigence est surlignée là où l’appel l’écrit.", "01_appel_surligne.png", 230),
        ("04_checklist_desktop.png", "La checklist : pièces, conditions et règles, avec leur statut.", "02_checklist.png", 230),
        ("07_detail_exigence_desktop.png", "Le détail d’une exigence : source, pièce rattachée, contrôles.", "03_detail_exigence.png", 0),
        ("06_controles_desktop.png", "Contrôles : budget, plafond, dates de validité, pages.", "04_controles.png", 230),
        ("02_synthese_desktop.png", "Les prochaines actions, classées par urgence.", "05_synthese.png", 0),
        ("05_pieces_desktop.png", "Les pièces reconnues automatiquement, corrigeables.", "06_pieces.png", 230),
        ("08_export_desktop.png", "Export : rapport PDF et paquet ZIP prêt à déposer.", "07_export.png", 0),
    ]
    for src, caption, name, top in items:
        framed(SHOTS / src, caption, name, top)
    print("Images :", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
