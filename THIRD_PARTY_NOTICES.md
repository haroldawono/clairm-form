# Technologies tierces utilisées par ClairForm

Ce tableau liste chaque composant tiers, son rôle et sa licence. Aucune API ni aucun modèle d’IA externe n’est appelé : toute l’analyse tourne localement.

## Exécution (installées par `pip install -r requirements.txt`)

| Composant | Version | Rôle dans ClairForm | Licence |
|---|---|---|---|
| Starlette | 1.6.0 | Serveur HTTP (routes, fichiers statiques) | BSD-3-Clause |
| Uvicorn | 0.53.0 | Serveur ASGI | BSD-3-Clause |
| Pydantic | 2.13.5 | Validation des requêtes JSON | MIT |
| pypdf | 5.9.0 | Lecture du texte des PDF | BSD-3-Clause |
| python-docx | 1.2.0 | Lecture des documents Word | MIT |
| openpyxl | 3.1.5 | Lecture des classeurs Excel | MIT |
| defusedxml | 0.7.1 | Analyse XML protégée (utilisée automatiquement par openpyxl) | PSF-2.0 |
| ReportLab (open source) | 5.0.1 | Génération du rapport PDF et des exemples fictifs | BSD-3-Clause |
| Pillow | 12.3.0 | Vérification des images importées, exemples | MIT-CMU (HPND) |
| SQLite (module Python `sqlite3`) | bibliothèque standard | Stockage local | Domaine public |

## Interface (embarquée dans `frontend/public`, aucun CDN)

| Composant | Version | Rôle | Licence |
|---|---|---|---|
| React / ReactDOM (builds UMD de production) | 16.0.0 | Rendu de l’interface | MIT — © Facebook, Inc. (notice conservée dans les fichiers) |
| Police Inter | 3.x (fichiers OTF Debian `fonts-inter`) | Texte de l’interface | SIL OFL 1.1 — voir `frontend/public/fonts/OFL.txt` |
| Police Lora | variable | Titres et texte des documents | SIL OFL 1.1 — voir `frontend/public/fonts/OFL.txt` |

## Développement et tests (facultatifs)

| Composant | Version | Rôle | Licence |
|---|---|---|---|
| TypeScript | 6.0.3 | Compilation de `frontend/src` vers `frontend/dist` | Apache-2.0 |
| imageio-ffmpeg (ffmpeg) | 0.6.0 | Conversion de la vidéo de démonstration et ajout de la voix off (`scripts/add_voiceover.py`) | BSD-2-Clause (ffmpeg : LGPL/GPL, binaire non redistribué) |
| Playwright (Python) + Chromium | 1.56.0 | Tests de bout en bout dans le navigateur, captures d’écran, vidéo de démonstration | Apache-2.0 (Chromium : BSD-3-Clause et licences associées) |

## Remplacements par rapport à la version précédente

- **PyMuPDF (AGPL-3.0) a été retiré** au profit de pypdf (BSD-3-Clause). Diffuser ClairForm avec PyMuPDF aurait imposé la licence AGPL ou une licence commerciale d’Artifex.
- **FastAPI a été remplacé par Starlette**, sur lequel FastAPI repose. Le paquet FastAPI n’était pas installable dans l’environnement de développement de cette version, et Starlette suffit pour l’API.
- Le fournisseur OpenAI facultatif de la version précédente a été retiré : ClairForm ne fait aucun appel réseau sortant.

## Outils d’IA utilisés pendant le développement

Le règlement d’OFFGRID autorise les assistants de code et demande de la transparence. Cette version a été réécrite avec l’aide d’un assistant d’IA générative (Claude, d’Anthropic) : code, tests, documentation et textes de soumission. Le produit lui-même n’embarque aucun modèle d’IA.
