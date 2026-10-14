"""Capture real screenshots and a demo video of ClairForm (Playwright + Chromium).

    python scripts/capture_media.py            # screenshots + video
    python scripts/capture_media.py --no-video

Everything shown is the running application, driven like a user would, on the fictional sample files.
The captions in the video are an overlay added by this script to explain each step; they are not part
of the application.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "tests"))
import helpers  # noqa: E402
from playwright.sync_api import expect, sync_playwright  # noqa: E402

SAMPLES = ROOT / "data" / "samples"
SHOTS = ROOT / "docs" / "screenshots"
VIDEO_DIR = ROOT / "devpost" / "video"

CAPTION_JS = """(text) => {
  let el = document.getElementById('demo-caption');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-caption';
    Object.assign(el.style, {position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 9999,
      background: 'rgba(27,36,48,.92)', color: '#fff', font: '500 19px/1.4 Inter, sans-serif', padding: '12px 20px',
      borderRadius: '8px', maxWidth: '980px', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.25)', pointerEvents: 'none'});
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}"""


def screenshots(srv: helpers.Server, browser) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    for width, height, prefix in ((1440, 900, "desktop"), (390, 844, "mobile")):
        ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2 if prefix == "mobile" else 1)
        p = ctx.new_page()
        p.goto(srv.url + "/")
        expect(p.get_by_role("heading", name="Mes dossiers")).to_be_visible()
        if prefix == "desktop":
            p.screenshot(path=str(SHOTS / "01_accueil.png"))
        p.get_by_role("button", name="Découvrir avec un dossier prérempli").click()
        expect(p.locator(".dossier-title")).to_be_visible(timeout=30000)
        p.wait_for_timeout(5200)  # let the toast disappear
        did = re.search(r"#/d/(dos_[0-9a-f]+)", p.url).group(1)
        shots = [("synthese", "02_synthese"), ("appel", "03_appel_surligne"), ("checklist", "04_checklist"),
                 ("pieces", "05_pieces"), ("controles", "06_controles"), ("export", "08_export")]
        for tab, name in shots:
            p.goto(f"{srv.url}/#/d/{did}/{tab}")
            p.wait_for_timeout(700)
            if tab == "appel":
                mark = p.locator(".reader mark.hl").first
                mark.scroll_into_view_if_needed()
                p.evaluate("window.scrollBy(0, -140)")
                p.wait_for_timeout(300)
                if prefix == "desktop":
                    page_box = p.locator(".reader .page").first.bounding_box()
                    box = mark.bounding_box()
                    p.screenshot(path=str(SHOTS / "cover_reader.png"),
                                 clip={"x": page_box["x"], "y": max(0, box["y"] - 40), "width": page_box["width"], "height": 330})
            p.screenshot(path=str(SHOTS / f"{name}_{prefix}.png"), full_page=prefix == "mobile" and tab in {"synthese"})
        p.goto(f"{srv.url}/#/d/{did}/checklist")
        p.locator(".req-row").filter(has_text="extrait d'immatriculation").click()
        expect(p.get_by_role("dialog")).to_be_visible()
        p.wait_for_timeout(400)
        p.screenshot(path=str(SHOTS / f"07_detail_exigence_{prefix}.png"))
        ctx.close()


# Each step: on-screen caption, spoken narration (for the human voice-over), and the actions to perform.
# The video waits long enough for the narration to be read at a natural pace (with breaths).
NARRATION = [
    ("ClairForm vérifie un dossier de candidature à un appel à projets.",
     "Un dossier de subvention est souvent refusé pour une raison bête : une pièce manquante, un document périmé, un budget qui ne tombe pas juste. ClairForm vérifie tout ça avant le dépôt."),
    ("1. Créer un dossier pour l’appel visé.",
     "Je crée un dossier pour l’appel auquel je réponds."),
    ("2. Importer le règlement de l’appel.",
     "J’importe le règlement de l’appel, un PDF de deux pages."),
    ("Chaque exigence est surlignée là où elle est écrite.",
     "ClairForm le lit et surligne chaque exigence à l’endroit exact où elle est écrite : les pièces à fournir, les conditions, et les règles chiffrées."),
    ("La phrase source, la page et les contraintes repérées.",
     "Un clic, et j’ai le détail : la phrase d’origine, la page, et la contrainte repérée. Ici, un extrait qui doit dater de moins de trois mois."),
    ("3. Ajouter toutes ses pièces d’un coup.",
     "Maintenant, j’ajoute toutes mes pièces d’un coup. Chaque fichier est reconnu, puis rattaché à l’exigence qu’il couvre."),
    ("4. Les contrôles : ce qu’un relecteur verrait trop tard.",
     "Et là, trois problèmes. L’extrait date de cinq mois. La note fait douze pages au lieu de dix. Et le total du budget est faux de cinq cents euros."),
    ("Les prochaines actions, dans le bon ordre.",
     "La synthèse me dit quoi faire en premier, et me rappelle de demander tout de suite la lettre du partenaire, parce que ça ne dépend pas de moi."),
    ("5. Importer les versions corrigées…",
     "J’importe les versions corrigées, et la lettre de soutien."),
    ("… et retirer les anciennes.",
     "Je retire les anciennes versions."),
    ("6. Confirmer soi-même les conditions d’éligibilité.",
     "Les conditions d’éligibilité, c’est moi qui les confirme. ClairForm ne décide pas à ma place."),
    ("Le dossier est prêt à déposer.",
     "Le dossier est prêt. Chaque exigence a sa pièce, et tous les contrôles sont au vert."),
    ("7. Exporter le rapport et le paquet de pièces.",
     "J’exporte un rapport PDF, et un paquet ZIP avec les pièces renommées dans l’ordre du règlement."),
    ("ClairForm — vos documents restent chez vous.",
     "Et mes documents n’ont jamais quitté mon ordinateur. C’est ClairForm."),
]


def _speech_seconds(text: str) -> float:
    words = len(text.split())
    return words / 2.4 + 1.2  # calm French delivery (~145 words/min) plus a breath


def video(srv: helpers.Server, browser) -> Path:
    import json
    import time

    tmp = VIDEO_DIR / "_raw"
    shutil.rmtree(tmp, ignore_errors=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, record_video_dir=str(tmp), record_video_size={"width": 1440, "height": 900})
    p = ctx.new_page()
    t0 = time.time()
    timeline = []
    state = {"i": -1, "start": 0.0}

    def step(i: int):
        """Finish the previous step (wait for its narration) and start step i."""
        if state["i"] >= 0:
            need = _speech_seconds(NARRATION[state["i"]][1])
            remaining = state["start"] + need - time.time()
            if remaining > 0:
                p.wait_for_timeout(int(remaining * 1000))
        caption, narration = NARRATION[i]
        p.evaluate(CAPTION_JS, caption)
        state.update(i=i, start=time.time())
        timeline.append({"n": i + 1, "start": round(time.time() - t0, 2), "caption": caption, "narration": narration})

    p.goto(srv.url + "/")
    expect(p.get_by_role("heading", name="Mes dossiers")).to_be_visible()
    step(0)
    step(1)
    p.get_by_role("button", name="Nouveau dossier").click()
    p.get_by_label("Nom du dossier").type("Kits solaires — Fonds Tremplin 2027", delay=35)
    p.get_by_role("button", name="Créer le dossier").click()
    expect(p.locator(".dossier-title")).to_be_visible()
    step(2)
    p.get_by_role("button", name="Importer l’appel").click()
    expect(p).to_have_url(re.compile(r"/appel$"))
    p.locator("input[type=file]").set_input_files(str(SAMPLES / "1_appel" / "appel_a_projets_tremplin_impact.pdf"))
    expect(p.locator(".upload-row.up-done")).to_have_count(1, timeout=30000)
    step(3)
    p.wait_for_timeout(1500)
    p.mouse.wheel(0, 640)
    step(4)
    p.locator(".reader mark.hl").filter(has_text="datant de moins de").click()
    step(5)
    p.keyboard.press("Escape")
    p.get_by_role("link", name=re.compile("^Pièces")).click()
    expect(p).to_have_url(re.compile(r"/pieces$"))
    p.locator("input[type=file]").set_input_files(sorted(str(f) for f in (SAMPLES / "2_pieces").iterdir()))
    expect(p.locator(".upload-row.up-done")).to_have_count(8, timeout=60000)
    step(6)
    p.get_by_role("link", name=re.compile("^Contrôles")).click()
    step(7)
    p.get_by_role("link", name="Synthèse").click()
    step(8)
    p.get_by_role("link", name=re.compile("^Pièces")).click()
    expect(p).to_have_url(re.compile(r"/pieces$"))
    p.locator("input[type=file]").set_input_files(sorted(str(f) for f in (SAMPLES / "3_corrections").iterdir()))
    expect(p.locator(".upload-row.up-done")).to_have_count(5, timeout=60000)
    step(9)
    for name in ("budget_previsionnel.xlsx", "extrait_RCCM.pdf", "note_presentation_projet.pdf"):
        p.get_by_role("button", name=f"Supprimer {name}").click()
        p.get_by_role("dialog").get_by_role("button", name="Supprimer").click()
        expect(p.get_by_role("button", name=f"Supprimer {name}")).to_have_count(0)
        p.wait_for_timeout(400)
    step(10)
    p.get_by_role("link", name=re.compile("^Checklist")).click()
    expect(p).to_have_url(re.compile(r"/checklist$"))
    p.get_by_label("Statut").select_option("to_confirm")
    rows = p.locator(".req-row")
    for _ in range(rows.count()):
        rows.first.click()
        p.get_by_role("dialog").get_by_role("button", name=re.compile("^Je confirme")).click()
        p.wait_for_timeout(600)
        p.keyboard.press("Escape")
        p.wait_for_timeout(250)
    p.get_by_role("button", name="Effacer les filtres").click()
    p.locator(".req-row").filter(has_text="vidéo").click()
    p.get_by_role("dialog").get_by_role("button", name=re.compile("Écarter")).click()
    p.wait_for_timeout(500)
    p.keyboard.press("Escape")
    expect(p.locator(".dh-score .score-label")).to_have_text("Prêt à déposer")
    p.mouse.wheel(0, -2000)
    step(11)
    step(12)
    p.get_by_role("link", name="Exporter").click()
    step(13)
    p.wait_for_timeout(int(_speech_seconds(NARRATION[13][1]) * 1000) + 800)
    p.evaluate(CAPTION_JS, "")
    total = round(time.time() - t0, 2)
    path = Path(p.video.path())
    ctx.close()
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    webm = VIDEO_DIR / "clairform_demo.webm"
    shutil.move(str(path), webm)
    shutil.rmtree(tmp, ignore_errors=True)
    (VIDEO_DIR / "timeline.json").write_text(json.dumps({"duration": total, "steps": timeline}, ensure_ascii=False, indent=2), encoding="utf-8")
    write_voice_script(timeline, total)
    return webm


def write_voice_script(timeline: list[dict], total: float) -> None:
    lines = ["# Script de la voix off — à enregistrer avec votre propre voix", "",
             f"Durée de la vidéo : {int(total // 60)} min {int(total % 60):02d} s. Chaque réplique a sa fenêtre de temps : la vidéo attend le temps "
             "nécessaire pour la dire calmement.", "",
             "## Méthode la plus simple (synchronisation automatique)", "",
             "1. Sur votre téléphone (Dictaphone / Enregistreur vocal), enregistrez **chaque réplique séparément**, dans une pièce calme, "
             "téléphone à 20 cm de la bouche. Respirez normalement entre les phrases : c’est ce qui rend la voix naturelle.",
             "2. Nommez les fichiers `01.m4a`, `02.m4a`, … (ou .mp3, .wav) dans l’ordre ci-dessous et copiez-les dans `devpost/video/voix/`.",
             "3. Lancez : `python scripts/add_voiceover.py` → la vidéo finale `clairform_demo_voix.mp4` est créée, chaque réplique placée "
             "au bon moment, volume égalisé.", "",
             "Variante : une seule prise continue `voix.m4a` en suivant les temps indiqués, puis `python scripts/add_voiceover.py --single voix.m4a`.", "",
             "## Répliques", "", "| Fichier | Début | Texte à dire |", "|---|---|---|"]
    for i, step in enumerate(timeline):
        end = timeline[i + 1]["start"] if i + 1 < len(timeline) else total
        lines.append(f"| `{step['n']:02d}` | {int(step['start'] // 60)}:{int(step['start'] % 60):02d} "
                     f"(fenêtre {end - step['start']:.0f} s) | {step['narration']} |")
    (VIDEO_DIR / "SCRIPT_VOIX_OFF.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def to_mp4(webm: Path) -> Path | None:
    try:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg absent : seule la vidéo WebM est produite.")
        return None
    mp4 = webm.with_suffix(".mp4")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(webm), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23",
                    "-movflags", "+faststart", str(mp4)], check=True)
    return mp4


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-video", action="store_true")
    args = ap.parse_args()
    if not (SAMPLES / "1_appel").is_dir():
        subprocess.run([sys.executable, str(ROOT / "scripts" / "make_samples.py")], check=True)
    with helpers.Server() as srv, sync_playwright() as pw:
        browser = pw.chromium.launch()
        screenshots(srv, browser)
        if not args.no_video:
            webm = video(srv, browser)
            mp4 = to_mp4(webm)
            if mp4:
                webm.unlink()
            print("Vidéo :", mp4 or webm)
        browser.close()
    print("Captures :", SHOTS)


if __name__ == "__main__":
    main()
