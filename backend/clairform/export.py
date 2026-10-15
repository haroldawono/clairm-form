"""Exports: a PDF readiness report and a ZIP package of the pieces, renamed and ordered by requirement."""
from __future__ import annotations

import io
import json
import re
import unicodedata
import zipfile
from datetime import date, datetime, timezone
from xml.sax.saxutils import escape

from .analysis.text import format_date_fr
from .i18n import L

STATUS_FR = {"covered": "Couvert", "to_verify": "À vérifier", "partial": "Incomplet", "missing": "Manquant",
             "problem": "Problème", "to_confirm": "À confirmer", "ignored": "Écartée"}
STATUS_EN = {"covered": "Covered", "to_verify": "To check", "partial": "Incomplete", "missing": "Missing",
             "problem": "Problem", "to_confirm": "To confirm", "ignored": "Dismissed"}
KIND_FR = {"document": "Pièce", "condition": "Condition", "rule": "Règle"}
KIND_EN = {"document": "Document", "condition": "Condition", "rule": "Rule"}


def _status(code: str) -> str:
    return L(STATUS_FR[code], STATUS_EN[code])


def _kind(code: str) -> str:
    return L(KIND_FR[code], KIND_EN[code])


def _t(text) -> str:
    """Escape for ReportLab paragraphs and replace characters missing from the base fonts."""
    s = str(text if text is not None else "")
    s = s.replace(" ", " ").replace(" ", " ").replace("…", "...").replace("—", "-").replace("–", "-")
    return escape(s)


def slug(text: str, limit: int = 48) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")
    return (s[:limit].rstrip("_") or "piece")


def report_pdf(state: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    d, a = state["dossier"], state["assessment"]
    docs = {x["id"]: x for x in state["documents"]}
    ss = getSampleStyleSheet()
    ink = colors.HexColor("#1B2430")
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=0, textColor=ink)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=12.5, leading=16, textColor=ink, spaceBefore=10)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=9, leading=12, textColor=ink)
    small = ParagraphStyle("s", parent=body, fontSize=7.8, leading=10, textColor=colors.HexColor("#4A5565"))

    out = io.BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"ClairForm — {d['title']}", author="ClairForm")
    story = [Paragraph(_t(d["title"]), h1)]
    meta = [L(f"Rapport généré le {format_date_fr(date.today())}", f"Report generated on {format_date_fr(date.today())}")]
    if d.get("program"):
        meta.append(L(f"Programme : {d['program']}", f"Programme: {d['program']}"))
    if a["deadline"]["date"]:
        from_call = a["deadline"]["source"] == "call"
        meta.append(L(f"Date limite : {format_date_fr(date.fromisoformat(a['deadline']['date']))} "
                      f"({'extraite de l’appel' if from_call else 'saisie'})",
                      f"Deadline: {format_date_fr(date.fromisoformat(a['deadline']['date']))} "
                      f"({'read from the call' if from_call else 'entered by hand'})"))
    story.append(Paragraph(_t(" — ".join(meta)), small))
    story.append(Spacer(1, 8))
    c = a["counts"]
    story.append(Paragraph(_t(L(f"État : {a['readiness']['label']} — couverture pondérée {a['score']} %",
                                f"Status: {a['readiness']['label']} — weighted coverage {a['score']}%")), h2))
    story.append(Paragraph(_t(L(f"{c['covered']} couvertes, {c['to_verify']} à vérifier, {c['partial']} incomplètes, {c['missing']} manquantes, "
                                f"{c['problem']} avec problème, {c['to_confirm']} à confirmer.",
                                f"{c['covered']} covered, {c['to_verify']} to check, {c['partial']} incomplete, {c['missing']} missing, "
                                f"{c['problem']} with a problem, {c['to_confirm']} to confirm.")), body))

    story.append(Paragraph("Checklist", h2))
    rows = [[Paragraph("<b>#</b>", small), Paragraph(f"<b>{L('Exigence', 'Requirement')}</b>", small), Paragraph(f"<b>{L('Statut', 'Status')}</b>", small),
             Paragraph(f"<b>{L('Pièce(s)', 'Document(s)')}</b>", small), Paragraph("<b>Source</b>", small)]]
    status_color = {"covered": "#1F7A4D", "problem": "#B42318", "missing": "#5B6573", "partial": "#9A5B00", "to_verify": "#9A5B00",
                    "to_confirm": "#2445C7", "ignored": "#8A93A0"}
    for i, r in enumerate(state["requirements"], 1):
        res = a["requirements"][r["id"]]
        pieces = ", ".join(docs[l["document_id"]]["name"] for l in res["links"] if l["document_id"] in docs) or "—"
        label = r["label"] + ("" if r["required"] else L(" (facultatif)", " (optional)")) + (L(" — critique", " — critical") if r["critical"] else "")
        source = f"p. {r['source_page']}" if r.get("source_page") else (L("ajoutée", "added") if r["origin"] == "manual" else "—")
        rows.append([Paragraph(str(i), small), Paragraph(_t(f"[{_kind(r['kind'])}] {label}"), small),
                     Paragraph(f"<font color='{status_color[res['status']]}'><b>{_t(_status(res['status']))}</b></font>", small),
                     Paragraph(_t(pieces), small), Paragraph(_t(source), small)])
    t = Table(rows, colWidths=[8 * mm, 82 * mm, 22 * mm, 50 * mm, 16 * mm], repeatRows=1)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#C9D0D9")),
                           ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF1F4")), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story.append(t)

    if a["checks"]:
        story.append(Paragraph(L("Contrôles de cohérence", "Consistency checks"), h2))
        sev = {"error": L("À corriger", "To fix"), "warning": L("À vérifier", "To check"), "info": "Information"}
        for chk in a["checks"]:
            story.append(Paragraph(_t(L(f"{sev[chk['severity']]} — {chk['title']} : {chk['detail']}", f"{sev[chk['severity']]} — {chk['title']}: {chk['detail']}")), body))
            if chk.get("source") and chk["source"].get("excerpt"):
                story.append(Paragraph(_t(L(f"Source (p. {chk['source'].get('page')}) : « {chk['source']['excerpt'][:300]} »",
                                            f"Source (p. {chk['source'].get('page')}): “{chk['source']['excerpt'][:300]}”")), small))
            story.append(Spacer(1, 3))
    if a["actions"]:
        story.append(Paragraph(L("Prochaines actions", "Next actions"), h2))
        for act in a["actions"][:12]:
            verb = act.get("verb_label") or act["verb"]
            story.append(Paragraph(_t(L(f"{verb} : {act['title']} — {act.get('detail') or ''}", f"{verb}: {act['title']} — {act.get('detail') or ''}")), body))
    story.append(Spacer(1, 10))
    story.append(Paragraph(_t(L("Ce rapport mesure la couverture des exigences lues dans l’appel et des contrôles automatiques décrits. "
                                "Il ne garantit ni l’éligibilité ni l’obtention d’un financement : vérifiez chaque point dans le règlement "
                                "officiel. Analyse réalisée par ClairForm, sans envoi de documents à un service externe.",
                                "This report measures the coverage of the requirements read from the call and of the automatic checks described. "
                                "It guarantees neither eligibility nor funding: check every point against the official rules. "
                                "Analysis performed by ClairForm, without sending documents to any external service.")), small))
    doc.build(story)
    return out.getvalue()


def package_zip(state: dict, files: dict[str, bytes]) -> bytes:
    """files: {document_id: bytes} for every piece of the dossier."""
    d, a = state["dossier"], state["assessment"]
    docs = {x["id"]: x for x in state["documents"]}
    root = slug(d["title"], 40)
    out = io.BytesIO()
    manifest = {"dossier": d["title"], "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "readiness": a["readiness"], "score": a["score"], "files": []}
    used: set[str] = set()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{root}/00_{L('rapport', 'report')}_clairform.pdf", report_pdf(state))
        n = 0
        for r in state["requirements"]:
            res = a["requirements"][r["id"]]
            if r["kind"] != "document" or res["status"] == "ignored" or not res["links"]:
                continue
            n += 1
            for k, link in enumerate(res["links"], 1):
                doc = docs.get(link["document_id"])
                if not doc or doc["id"] not in files:
                    continue
                suffix = f"_{k}" if len(res["links"]) > 1 else ""
                name = f"{n:02d}_{slug(r['proof_type_label'] or r['label'])}{suffix}.{doc['ext']}"
                if name in used:
                    continue
                used.add(name)
                z.writestr(f"{root}/{name}", files[doc["id"]])
                manifest["files"].append({"file": name, "original_name": doc["name"], "sha256": doc["sha256"],
                                          "requirement": r["label"], "status": _status(res["status"]),
                                          "link": L("confirmé par vous", "confirmed by you") if link["origin"] == "user" else L("proposé automatiquement", "suggested automatically")})
        z.writestr(f"{root}/manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return out.getvalue()
