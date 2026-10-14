"""Add your recorded voice to the demo video.

    python scripts/add_voiceover.py                    # clips devpost/video/voix/01.m4a, 02.m4a, … placed at each step
    python scripts/add_voiceover.py --single voix.m4a  # one continuous take, starting at 0:00 (or --offset 1.5)

Each clip is cleaned (low rumble removed, light noise reduction) and brought to a consistent loudness
(EBU R128, -16 LUFS, the usual level for online video), then placed at the start time of its step
(devpost/video/timeline.json, written by capture_media.py). Result: devpost/video/clairform_demo_voix.mp4

Requires ffmpeg: either `pip install imageio-ffmpeg` or ffmpeg installed on the system.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = ROOT / "devpost" / "video"
EXTS = (".m4a", ".mp3", ".wav", ".ogg", ".opus", ".aac", ".webm", ".flac", ".3gp", ".amr")
CLEAN = "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000"


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        found = shutil.which("ffmpeg")
        if not found:
            sys.exit("ffmpeg introuvable : installez-le (https://ffmpeg.org) ou lancez « pip install imageio-ffmpeg ».")
        return found


def duration(ffmpeg: str, path: Path) -> float:
    out = subprocess.run([ffmpeg, "-i", str(path)], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    if not m:
        sys.exit(f"Fichier audio illisible : {path.name}")
    h, mi, se = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(se)


def main() -> None:
    ap = argparse.ArgumentParser(description="Ajouter votre voix à la vidéo de démonstration")
    ap.add_argument("--video", default=str(VIDEO_DIR / "clairform_demo.mp4"))
    ap.add_argument("--clips", default=str(VIDEO_DIR / "voix"), help="dossier des répliques 01, 02, …")
    ap.add_argument("--single", help="une seule prise continue au lieu de répliques séparées")
    ap.add_argument("--offset", type=float, default=0.0, help="décalage (s) de la prise unique")
    ap.add_argument("--out", default=str(VIDEO_DIR / "clairform_demo_voix.mp4"))
    args = ap.parse_args()

    ffmpeg = ffmpeg_exe()
    video = Path(args.video)
    if not video.is_file():
        sys.exit(f"Vidéo introuvable : {video}")
    inputs: list[tuple[Path, float]] = []
    if args.single:
        inputs.append((Path(args.single), args.offset))
    else:
        timeline = json.loads((VIDEO_DIR / "timeline.json").read_text(encoding="utf-8"))
        steps = timeline["steps"]
        clips_dir = Path(args.clips)
        missing = []
        for i, step in enumerate(steps):
            found = next((clips_dir / f"{step['n']:02d}{e}" for e in EXTS if (clips_dir / f"{step['n']:02d}{e}").is_file()), None)
            if not found:
                missing.append(f"{step['n']:02d}")
                continue
            window = (steps[i + 1]["start"] if i + 1 < len(steps) else timeline["duration"]) - step["start"]
            length = duration(ffmpeg, found)
            if length > window + 0.3:
                print(f"Attention : la réplique {found.name} dure {length:.1f} s pour une fenêtre de {window:.1f} s : "
                      "elle chevauchera la suivante. Réenregistrez-la un peu plus vite, ou acceptez le chevauchement.")
            inputs.append((found, step["start"] + 0.25))
        if missing:
            print("Répliques absentes (silence à ces endroits) : " + ", ".join(missing))
        if not inputs:
            sys.exit(f"Aucun fichier audio trouvé dans {clips_dir} (attendu : 01.m4a, 02.m4a, …).")

    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", str(video)]
    for path, _ in inputs:
        cmd += ["-i", str(path)]
    total = duration(ffmpeg, video)
    chains, labels = [], []
    for k, (_, start) in enumerate(inputs, start=1):
        ms = int(start * 1000)
        chains.append(f"[{k}:a]{CLEAN},adelay={ms}|{ms}[a{k}]")
        labels.append(f"[a{k}]")
    mix = f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,apad=whole_dur={total:.2f},atrim=0:{total:.2f}[aout]" \
        if len(labels) > 1 else f"{labels[0]}apad=whole_dur={total:.2f},atrim=0:{total:.2f}[aout]"
    cmd += ["-filter_complex", ";".join(chains + [mix]), "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", args.out]
    subprocess.run(cmd, check=True)
    print(f"Vidéo avec voix : {args.out}  ({len(inputs)} piste(s) audio)")


if __name__ == "__main__":
    main()
