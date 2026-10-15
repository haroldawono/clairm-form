# ClairForm

*[Version française](README.fr.md)*

**Your grant application, checked document by document — without sending your files to a third-party service.**

ClairForm reads the rules of a call for proposals (grant, competition, incubation programme…), turns them into a list of required documents, eligibility conditions and numeric rules, and compares that list with your own files. It flags what is missing, out of date, or in conflict with the rules. You then export a report and a package of renamed documents, ready to submit.

> Built for the **HACK47: OFFGRID** hackathon (Devpost). The sample application uses an invented programme, organisation and people; administrative documents carry a SPECIMEN watermark.

---

## The problem

Applications are rarely rejected for the quality of the project. They are often rejected because a document is missing or expired, is longer than the page limit, or because the budget does not add up. These rules are scattered across a 10 to 40-page call document, and the checking is done by hand, the night before the deadline.

Existing tools mostly help people **write** applications or **find** funding. They are online subscription services built first for English-speaking markets, and they require uploading ID cards, statutes and bank statements to a third-party server. Nobody checks the **application file itself** against the rules.

## What ClairForm does

1. **Reads the call** (text PDF, Word, .txt, .md) and builds a checklist. Each requirement keeps the sentence and page it comes from, highlighted in the text, and the reason it was selected (mandatory wording, a "documents to provide" list…).
2. **Finds the numeric rules**: deadline, maximum amount, minimum co-funding, maximum duration, page limits, maximum document age ("less than 3 months old"), validity, signature, format, number of documents ("two CVs").
3. **Recognises your documents** (PDF, Word, Excel, CSV, text, photos): ID document, statutes / company registration, tax certificate, bank details, budget, CV, support letter… and **links** each one to the matching requirement. You confirm, correct or unlink every match.
4. **Checks consistency**: budget total different from the sum of its lines, requested amount above the cap, own contribution too low, requested amount different between documents, timeline longer than allowed, registration extract too old at the deadline, expired ID, summary too long, missing signature, duplicates.
5. **Ranks the next actions**: fix errors first, then *request early* the documents that depend on someone else (bank, administration, partner), then complete, check and confirm.
6. **Exports** a PDF report, a ZIP package of your documents renamed in checklist order (with a SHA-256 manifest of each file) and the data as JSON.

ClairForm does not decide eligibility and does not guarantee funding. Conditions (age, country, legal status) are **confirmed by you**. The tool only checks what your documents allow it to check, and it always shows where each conclusion comes from.

## Language

The interface is in **English by default**. The **EN / FR** switch at the top right changes it to French; the choice is remembered in the browser, and server messages (checks, statuses, actions, errors, PDF report) follow the selected language. Requirements are always quoted in the language of the imported call. The built-in sample application is a French-language call, because the tool is designed for French-speaking applicants; calls written in English are also understood.

---

## Install and run

**Requirements:** Python 3.11 or newer (run and tested with Python 3.13). Node.js is **not** needed: the interface is shipped already compiled.

```bash
# 1. Go to the project folder
cd clairform

# 2. Virtual environment (recommended)
python -m venv .venv
# Linux / macOS:
source .venv/bin/activate
# Windows (PowerShell):
.venv\Scripts\Activate.ps1

# 3. Dependencies
pip install -r requirements.txt

# 4. Start
python scripts/run.py
```

Then open **http://localhost:8000**. Stop the server with `Ctrl+C`.

Options: `python scripts/run.py --port 8080 --data-dir /path/to/storage`. Environment variables are listed in `backend/clairform/config.py` (`CLAIRFORM_MAX_UPLOAD_MB`, `CLAIRFORM_ALLOWED_HOSTS`, …).

### Try it in two minutes

- **"Try it with a sample application" button**: the app generates a call for proposals and eight documents laid out like real ones (letterheads, references, tables, signatures and stamps), then analyses them with the same engine as your own files. The result contains 3 errors, a missing letter and a missing CV.
- **Full journey by hand**: `python scripts/make_samples.py` writes the sample files to `data/samples/` (see `data/samples/LISEZMOI.txt`). Import `1_appel`, then `2_pieces`, then `3_corrections`. Delete the old versions and confirm the conditions: the application reaches "Ready to submit". The `4_cas_limites` folder holds files that must be refused cleanly: a scan without text, a fake PDF, an empty file, an executable.

---

## Tests

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium     # once, for the browser tests

python scripts/validate.py                # everything, and writes docs/validation/RESULTATS.md
python scripts/validate.py --no-browser   # without Playwright

# or suite by suite, from backend/tests:
cd backend/tests
python -m unittest -v test_analysis test_engine test_api test_e2e_browser
```

| Suite | What is checked |
|---|---|
| `test_analysis` (25) | FR/EN dates and amounts, reading calls (French PDF, English text, Word with articles), constraints, numeric facts, document classification, budgets as tables or text |
| `test_engine` (38) | Refusal of empty, disguised, corrupted, encrypted and oversized files, ZIP bombs, `../` paths, reading timeout; every check rule; the full sample journey up to "Ready to submit" |
| `test_api` (20) | Real uvicorn server: full HTTP flow, exports (SHA-256 fingerprints in the ZIP), explained errors, CSRF, Host, size, path traversal, rate limit, interrupted upload, cancellation |
| `test_e2e_browser` (6) | Chromium driven like a user: English by default and switch to French, dialogs (focus, Esc), importing real files, clickable highlights, links, confirmed deletions, reload, downloads, refused files, cancelling a slow upload, invalid server responses, network loss, keyboard only, mobile without overflow (both languages), no console error or CSP violation |
| `test_e2e_browser` in online mode | The same browser journey replayed with the free-hosting configuration (`CLAIRFORM_MODE=public`, `CLAIRFORM_READER=inprocess`) |

Results of the last run are in [`docs/validation/RESULTATS.md`](docs/validation/RESULTATS.md).

### Changing the interface

TypeScript sources are in `frontend/src`, static files in `frontend/public`. To rebuild `frontend/dist`:

```bash
cd frontend && npm install && cd ..
python scripts/build_frontend.py
```

---

## Architecture

```
backend/clairform/
  app.py              HTTP API (Starlette) + security middleware + static files
  service.py          Business operations: applications, imports, requirements, links, sample
  db.py               SQLite (parameterised queries, one connection per operation)
  i18n.py             Language of server messages (English / French)
  ingest/files.py     Validation (extension, signature, size) + reading in an isolated process
  ingest/worker.py    PDF (pypdf), Word, Excel, CSV, text and image readers
  analysis/call_parser.py   Call document → requirements with provenance + numeric facts
  analysis/taxonomy.py      17 document types (FR/EN), document recognition
  analysis/evidence.py      Dates (issue, expiry), amounts, budgets, signatures
  analysis/assessment.py    Links, checks, statuses, percentage, next actions
  export.py           PDF report (ReportLab) and ZIP package
  samples.py          Generation of the sample documents
frontend/src/         React 16 (bundled locally) + TypeScript compiled to ES modules, no bundler
scripts/              run, build_frontend, make_samples, check_samples, validate
```

**Design choices:**

- **Deterministic and explainable.** No language model: every requirement and every alert cites its source. The same application always gives the same result, and everything works offline.
- **The user stays in control.** Automatic links can be confirmed or rejected. A requirement read by mistake can be dismissed, corrected, or complemented by a requirement added by hand.
- **Coverage percentage.** Critical requirements count double and a document "to check" counts for half. The percentage is shown with its rule and predicts no funding decision.

---

## Putting ClairForm online (free)

The `public` mode gives each visitor a private space, isolated from the others, and automatically deletes inactive applications. The step-by-step procedure (GitHub then Render's free plan) is in [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) (in French). In short, on Render: *New → Web Service*, language **Python 3**, build command `pip install -r requirements.txt`, start command `python scripts/run.py`, environment variables `CLAIRFORM_MODE=public`, `CLAIRFORM_HOST=0.0.0.0`, `CLAIRFORM_READER=inprocess`, health check path `/api/health`. The `render.yaml`, `.python-version` and `Dockerfile` files are provided.

## Troubleshooting

- **"Cannot read the file: a required library is not installed"**, or a red banner at the top of the screen: dependencies are not installed for the Python interpreter that runs ClairForm. Run `python -m pip install -r requirements.txt` with **the same** `python` as `python scripts/run.py`. The terminal shows the result of the reading self-test at startup.
- **Port already in use**: `python scripts/run.py --port 8080`.
- **Windows, `Activate.ps1` blocked**: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run `.venv\Scripts\python scripts\run.py` directly.

## Known limitations

- **No OCR.** A scanned call is refused with an explanation. A scanned document is accepted but its content is not read: you set its type. Date and signature checks then do not apply.
- **Heuristic reading of the call.** It works on structured documents (headings, lists, mandatory wording in French or English). Complex layouts (columns, tables) can produce incomplete requirements, which is why every requirement is highlighted in the text and editable.
- **Page count of a .docx** is read from the file metadata when Word saved it. Otherwise, export to PDF.
- **Excel workbooks with formulas never recalculated** (generated by a program): totals cannot be checked, and the tool says so.
- **Currency conversion** is not handled. A currency different from the call's is flagged, not converted.
- Tested on Linux with Chromium. Firefox, Safari, Windows and macOS were not tested in this environment.

## Security and privacy

No outgoing network calls. Files are read in an isolated process with time and memory limits. CSRF and DNS-rebinding protection, strict CSP. Details of the controls and the related tests: [`docs/securite.md`](docs/securite.md) (in French).

## Third-party technology and licences

Starlette, Uvicorn, Pydantic, pypdf, python-docx, openpyxl, defusedxml, ReportLab, Pillow, React 16 (bundled), Inter and Lora fonts (SIL OFL). Playwright and TypeScript are used for development only. Versions and licences: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Developed with the help of an AI coding assistant (see the same file).

## Licence

MIT — see [`LICENSE`](LICENSE).
