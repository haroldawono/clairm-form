"""Rebuild frontend/dist from frontend/public + TypeScript sources.

Requires the TypeScript compiler (`npm install` in frontend/, or a global `tsc`).
The repository ships a prebuilt frontend/dist, so this is only needed after editing src/.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend"
DIST = FRONT / "dist"


def find_tsc() -> list[str]:
    local = FRONT / "node_modules" / ".bin" / ("tsc.cmd" if sys.platform == "win32" else "tsc")
    if local.exists():
        return [str(local)]
    found = shutil.which("tsc")
    if found:
        return [found]
    sys.exit("TypeScript introuvable : lancez `npm install` dans frontend/ (ou installez tsc globalement).")


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(FRONT / "public", DIST)
    subprocess.run(find_tsc() + ["-p", str(FRONT / "tsconfig.json")], check=True)
    print(f"Interface construite dans {DIST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
