"""Run every check and write docs/validation/RESULTATS.md with the real output.

    python scripts/validate.py            # unit + API + browser tests (browser skipped if Playwright is missing)
    python scripts/validate.py --no-browser
"""
from __future__ import annotations

import argparse
import platform
import py_compile
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs" / "validation" / "RESULTATS.md"
SUITES = [
    ("test_analysis", "Analyse : dates, montants, lecture de l'appel, classement des pièces, budgets"),
    ("test_engine", "Moteur : lecture sécurisée des fichiers, règles de contrôle, parcours complet"),
    ("test_api", "API HTTP réelle : flux complet, erreurs, sécurité (CSRF, Host, taille, chemins, débit)"),
    ("test_e2e_browser", "Navigateur Chromium : parcours utilisateur, erreurs, annulation, clavier, mobile"),
    ("test_e2e_browser@public", "Même parcours navigateur en configuration d’hébergement gratuit (mode public, lecture interne)"),
]
SUITE_ENV = {"test_e2e_browser@public": {"CLAIRFORM_MODE": "public", "CLAIRFORM_READER": "inprocess"}}


def run(cmd: list[str], cwd: Path, env: dict | None = None) -> tuple[int, str, float]:
    import os

    t = time.time()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env={**os.environ, **(env or {})})
    return p.returncode, (p.stdout + p.stderr), time.time() - t


def versions() -> list[str]:
    out = [f"Python {platform.python_version()} — {platform.system()} {platform.release()}"]
    for mod in ("starlette", "uvicorn", "pydantic", "pypdf", "docx", "openpyxl", "reportlab", "PIL", "playwright"):
        try:
            m = __import__(mod)
            v = getattr(m, "__version__", None)
            if v is None:
                from importlib.metadata import version

                v = version({"docx": "python-docx", "PIL": "pillow"}.get(mod, mod))
            out.append(f"{mod} {v}")
        except Exception:
            out.append(f"{mod} : non installé")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    lines = [f"# Résultats de validation", "", f"Exécution : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (heure locale de la machine)", ""]
    lines += ["## Environnement", ""] + [f"- {v}" for v in versions()] + [""]
    ok_all = True

    # 1. Python sources compile
    errors = []
    for f in (ROOT / "backend").rglob("*.py"):
        try:
            py_compile.compile(str(f), doraise=True)
        except py_compile.PyCompileError as e:
            errors.append(str(e))
    lines += ["## Compilation Python", "", "OK" if not errors else "ÉCHEC\n\n```\n" + "\n".join(errors) + "\n```", ""]
    ok_all &= not errors

    # 2. TypeScript type-check (optional tool)
    tsc = shutil.which("tsc") or (str(ROOT / "frontend/node_modules/.bin/tsc") if (ROOT / "frontend/node_modules/.bin/tsc").exists() else None)
    if tsc:
        code, out, dt = run([tsc, "-p", "frontend/tsconfig.json", "--noEmit"], ROOT)
        lines += ["## Vérification TypeScript (mode strict)", "", f"{'OK' if code == 0 else 'ÉCHEC'} ({dt:.1f} s)", ""]
        if code:
            lines += ["```", out[-3000:], "```", ""]
        ok_all &= code == 0
    else:
        lines += ["## Vérification TypeScript", "", "Non exécutée : `tsc` absent de cette machine (l’interface livrée est déjà compilée).", ""]

    # 3. Test suites
    lines += ["## Tests automatisés", "", "| Suite | Contenu | Résultat | Durée |", "|---|---|---|---|"]
    details = []
    for module, desc in SUITES:
        if args.no_browser and module.startswith("test_e2e_browser"):
            lines.append(f"| {module} | {desc} | non exécutée (--no-browser) | — |")
            continue
        code, out, dt = run([sys.executable, "-m", "unittest", "-v", module.split("@")[0]], ROOT / "backend" / "tests", SUITE_ENV.get(module))
        summary = [l for l in out.splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
        status = " / ".join(summary[-2:]) if summary else f"code {code}"
        lines.append(f"| {module} | {desc} | {'✅ ' if code == 0 else '❌ '}{status} | {dt:.1f} s |")
        ok_all &= code == 0
        names = [l for l in out.splitlines() if " ... " in l]
        details += [f"### {module}", "", "```", *names, "```", ""]
        if code:
            details += ["Sortie d’erreur :", "", "```", out[-6000:], "```", ""]
    lines += ["", f"**Bilan : {'tous les contrôles exécutés ont réussi' if ok_all else 'au moins un contrôle a échoué'}.**", ""]
    lines += ["## Détail des tests", ""] + details
    lines += ["## Non couvert par cette validation", "",
              "- Audit des vulnérabilités des dépendances (pip-audit / base OSV) : nécessite un accès réseau à ces services, indisponible ici.",
              "- Navigateurs autres que Chromium (Firefox, Safari) et systèmes autres que Linux : non testés dans cet environnement.",
              "- Appels à projets réels de mise en page complexe (colonnes, tableaux scannés) : l’extraction reste à vérifier par l’utilisateur.", ""]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(l for l in lines if l.startswith(("|", "**"))))
    print(f"Rapport : {REPORT.relative_to(ROOT)}")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
