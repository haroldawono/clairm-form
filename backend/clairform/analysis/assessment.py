"""Deterministic assessment of a dossier: links, checks, requirement status, readiness, next actions.

Pure function of the stored state (no I/O): `assess(dossier, documents, requirements, links, today)`.
Every status carries a plain-language explanation so the UI never shows an unexplained verdict.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from . import taxonomy
from .text import add_months, format_amount, format_date_fr, keywords, norm

CREDIT = {"covered": 1.0, "to_verify": 0.5, "partial": None, "missing": 0.0, "problem": 0.0, "to_confirm": 0.0}
STATUS_LABELS = {
    "covered": "Couvert", "to_verify": "À vérifier", "partial": "Incomplet", "missing": "Manquant",
    "problem": "Problème", "to_confirm": "À confirmer",
}


@dataclass
class Check:
    id: str
    code: str
    severity: str  # error | warning | info
    title: str
    detail: str
    requirement_id: str | None = None
    document_id: str | None = None
    source: dict | None = None

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def _d(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if value else None
    except ValueError:
        return None


def _fact(facts: list[dict], key: str) -> dict | None:
    return next((f for f in facts if f.get("key") == key), None)


def _source(dossier_facts_doc: dict | None) -> dict | None:
    if not dossier_facts_doc:
        return None
    return {"document_id": dossier_facts_doc.get("document_id"), "page": dossier_facts_doc.get("page"), "excerpt": dossier_facts_doc.get("excerpt")}


# --------------------------------------------------------------------------- matching
def suggest_links(requirements: list[dict], pieces: list[dict]) -> dict[str, list[dict]]:
    """Automatic, explainable suggestions. Returns {requirement_id: [{document_id, confidence, reason}]}."""
    out: dict[str, list[dict]] = {}
    for req in requirements:
        if req["kind"] != "document":
            continue
        found = []
        for doc in pieces:
            if req.get("proof_type") and doc.get("proof_type") == req["proof_type"]:
                conf = "high" if doc.get("proof_type_source") == "user" else (doc.get("proof_confidence") or "low")
                if conf == "low":
                    conf = "medium"
                found.append({"document_id": doc["id"], "confidence": conf,
                              "reason": f"type de pièce identique ({taxonomy.LABELS.get(doc['proof_type'], doc['proof_type'])})"})
                continue
            if not req.get("proof_type") and doc.get("has_text"):
                kws = keywords(req["label"])[:8]
                if len(kws) >= 2:
                    hay = norm(doc["name"] + " " + " ".join(p["text"] for p in doc["pages"])[:6000])
                    hits = [k for k in kws if k in hay]
                    if len(hits) >= 2 and len(hits) / len(kws) >= 0.6:
                        found.append({"document_id": doc["id"], "confidence": "medium",
                                      "reason": "mots communs : " + ", ".join(hits[:4])})
        out[req["id"]] = found
    return out


# --------------------------------------------------------------------------- main
def assess(dossier: dict, documents: list[dict], requirements: list[dict], links: list[dict], today: date | None = None) -> dict:
    today = today or date.today()
    facts = dossier.get("call_facts") or []
    deadline = _d(dossier.get("deadline"))
    reference_day = deadline if deadline and deadline >= today else today
    pieces = [d for d in documents if d["role"] == "piece"]
    piece_by_id = {d["id"]: d for d in pieces}
    active = [r for r in requirements if r["status"] == "active"]

    decisions = {(l["requirement_id"], l["document_id"]): l["decision"] for l in links}
    suggestions = suggest_links(active, pieces)

    checks: list[Check] = []

    def add(code, severity, title, detail, requirement_id=None, document_id=None, source=None):
        checks.append(Check(f"C{len(checks) + 1:03d}", code, severity, title, detail, requirement_id, document_id, source))

    # ---------------------------------------------------------------- dossier-level checks
    deadline_fact = _fact(facts, "deadline")
    if deadline:
        days = (deadline - today).days
        src = _source(deadline_fact) if dossier.get("deadline_source") == "call" else None
        if days < 0:
            add("DEADLINE_PASSED", "error", "Date limite dépassée",
                f"La date limite ({format_date_fr(deadline)}) est passée depuis {-days} jour{'s' if -days > 1 else ''}.", source=src)
        elif days <= 7:
            add("DEADLINE_SOON", "warning", "Date limite très proche",
                f"Il reste {days} jour{'s' if days > 1 else ''} avant la date limite ({format_date_fr(deadline)}).", source=src)

    # duplicates
    seen_hash: dict[str, dict] = {}
    for doc in pieces:
        if doc["sha256"] in seen_hash:
            add("DUPLICATE", "warning", "Fichier importé deux fois",
                f"« {doc['name']} » est identique à « {seen_hash[doc['sha256']]['name']} ». Une copie ne compte pas comme une pièce distincte.",
                document_id=doc["id"])
        else:
            seen_hash[doc["sha256"]] = doc

    for doc in pieces:
        if not doc["has_text"] and doc.get("proof_type_source") != "user":
            add("UNREAD", "info", "Contenu non lu automatiquement",
                f"« {doc['name']} » ne contient pas de texte lisible (scan ou image). Indiquez son type pour qu'il soit rattaché.",
                document_id=doc["id"])
        if doc["facts"].get("uncached_formulas"):
            add("FORMULAS", "warning", "Formules sans valeurs calculées",
                f"« {doc['name']} » contient {doc['facts']['uncached_formulas']} formule(s) sans résultat enregistré : ouvrez-le dans un tableur, enregistrez-le, puis réimportez-le pour que les totaux soient vérifiés.",
                document_id=doc["id"])

    # budget checks
    max_amount = _fact(facts, "max_amount")
    min_cofi = _fact(facts, "min_cofinancing_pct")
    max_duration = _fact(facts, "max_duration_months")
    budget_docs = [d for d in pieces if d["facts"].get("budget")]
    rule_results: dict[str, str] = {}  # call fact key -> pass | fail | unknown

    for doc in budget_docs:
        b = doc["facts"]["budget"]
        for t in b.get("totals", []):
            gap = round(t["amount"] - t["lines_sum"], 2)
            if abs(gap) > max(1.0, 0.002 * abs(t["amount"])):
                add("BUDGET_TOTAL", "error", "Total du budget incohérent",
                    f"Dans « {doc['name']} », la ligne « {t['label']} » indique {format_amount(t['amount'], b.get('currency'))} "
                    f"alors que les {t['line_count']} lignes au-dessus totalisent {format_amount(t['lines_sum'], b.get('currency'))} "
                    f"(écart de {format_amount(abs(gap), b.get('currency'))}).", document_id=doc["id"])

    requested_values = []
    for doc in pieces:
        b = doc["facts"].get("budget") or {}
        if b.get("requested"):
            requested_values.append((b["requested"]["amount"], b.get("currency"), doc))
        elif doc["facts"].get("requested_amount"):
            ra = doc["facts"]["requested_amount"]
            requested_values.append((ra["amount"], ra.get("currency"), doc))
    distinct = {round(v[0], 2) for v in requested_values}
    if len(distinct) > 1:
        desc = " ; ".join(f"{format_amount(v, c)} dans « {d['name']} »" for v, c, d in requested_values)
        add("AMOUNT_MISMATCH", "error", "Montant demandé différent selon les documents",
            f"Le montant demandé n'est pas le même partout : {desc}.", document_id=requested_values[0][2]["id"])

    if max_amount:
        cap, cap_cur = float(max_amount["value"]), max_amount.get("currency")
        if requested_values:
            amount, cur, doc = max(requested_values, key=lambda v: v[0])
            if cur and cap_cur and cur != cap_cur and not {cur, cap_cur} <= {"FCFA", "XAF", "XOF"}:
                add("CURRENCY", "warning", "Devise différente de celle de l'appel",
                    f"L'appel exprime le plafond en {cap_cur}, « {doc['name']} » en {cur}. Comparez après conversion.",
                    document_id=doc["id"], source=_source(max_amount))
                rule_results["max_amount"] = "unknown"
            elif amount > cap + 0.5:
                add("BUDGET_CEILING", "error", "Montant demandé supérieur au plafond",
                    f"Vous demandez {format_amount(amount, cur or cap_cur)} (« {doc['name']} ») alors que l'appel plafonne l'aide à "
                    f"{format_amount(cap, cap_cur)}.", document_id=doc["id"], source=_source(max_amount))
                rule_results["max_amount"] = "fail"
            else:
                rule_results["max_amount"] = "pass"
        else:
            rule_results["max_amount"] = "unknown"
            if budget_docs:
                add("REQUESTED_NOT_FOUND", "warning", "Montant demandé introuvable",
                    "Aucune ligne « montant demandé » ou « subvention demandée » n'a été trouvée dans le budget : "
                    f"le respect du plafond de {format_amount(cap, cap_cur)} ne peut pas être vérifié.", source=_source(max_amount))

    if min_cofi:
        pct = float(min_cofi["value"])
        b = next((d["facts"]["budget"] for d in budget_docs if d["facts"]["budget"].get("expense_total")), None)
        doc = next((d for d in budget_docs if d["facts"]["budget"].get("expense_total")), None)
        if b and b.get("cofinancing") and b.get("expense_total"):
            ratio = 100 * b["cofinancing"]["amount"] / b["expense_total"]
            if ratio + 0.05 < pct:
                add("COFINANCING", "error", "Cofinancement insuffisant",
                    f"Votre apport représente {ratio:.1f} % du budget ({format_amount(b['cofinancing']['amount'], b.get('currency'))} "
                    f"sur {format_amount(b['expense_total'], b.get('currency'))}), l'appel en exige au moins {pct:g} %.",
                    document_id=doc["id"], source=_source(min_cofi))
                rule_results["min_cofinancing_pct"] = "fail"
            else:
                rule_results["min_cofinancing_pct"] = "pass"
        else:
            rule_results["min_cofinancing_pct"] = "unknown"
            if budget_docs:
                add("COFINANCING_NOT_FOUND", "warning", "Apport propre introuvable dans le budget",
                    f"L'appel exige un cofinancement d'au moins {pct:g} %, mais aucune ligne « apport », « fonds propres » ou "
                    "« cofinancement » n'a été trouvée.", source=_source(min_cofi))

    if max_duration:
        limit = int(max_duration["value"])
        spans = [(d["facts"]["timeline"], d) for d in pieces if d["facts"].get("timeline")]
        if spans:
            span, doc = max(spans, key=lambda s: s[0]["months"])
            if span["months"] > limit + 0.5:
                add("DURATION", "error", "Durée du projet supérieure au maximum",
                    f"« {doc['name']} » s'étend du {format_date_fr(_d(span['start']))} au {format_date_fr(_d(span['end']))} "
                    f"(environ {span['months']:.0f} mois) ; l'appel limite la durée à {limit} mois.", document_id=doc["id"], source=_source(max_duration))
                rule_results["max_duration_months"] = "fail"
            else:
                rule_results["max_duration_months"] = "pass"
        else:
            rule_results["max_duration_months"] = "unknown"

    # ---------------------------------------------------------------- requirement evaluation
    doc_level: dict[str, list[Check]] = {}
    for x in checks:
        if x.document_id and not x.requirement_id:
            doc_level.setdefault(x.document_id, []).append(x)
    req_results = []
    for req in requirements:
        result = {"id": req["id"], "links": [], "checks": [], "status": None, "explanation": "",
                  "rejected": [doc["id"] for doc in pieces if decisions.get((req["id"], doc["id"])) == "rejected"]}
        if req["status"] != "active":
            result["status"] = "ignored"
            result["explanation"] = "Exigence écartée : elle n'est pas prise en compte."
            req_results.append(result)
            continue
        c = req.get("constraints") or {}
        if req["kind"] == "document":
            linked = []
            auto = {s["document_id"]: s for s in suggestions.get(req["id"], [])}
            for doc in pieces:
                decision = decisions.get((req["id"], doc["id"]))
                if decision == "rejected":
                    continue
                if decision == "confirmed":
                    linked.append({"document_id": doc["id"], "origin": "user", "confidence": "high", "reason": "rattaché par vous"})
                elif doc["id"] in auto:
                    s = auto[doc["id"]]
                    linked.append({"document_id": doc["id"], "origin": "auto", "confidence": s["confidence"], "reason": s["reason"]})
            result["links"] = linked
            own_checks: list[Check] = []
            for link in linked:
                doc = piece_by_id[link["document_id"]]
                before = len(checks)
                _document_checks(add, req, doc, c, reference_day, deadline)
                own_checks.extend(checks[before:])
                own_checks.extend(x for x in doc_level.get(doc["id"], []) if x.severity in {"error", "warning"} and x not in own_checks)
            result["checks"] = [x.id for x in own_checks]
            distinct_hashes = {piece_by_id[l["document_id"]]["sha256"] for l in linked}
            needed = max(1, int(req.get("min_count") or 1))
            if not linked:
                result["status"] = "missing"
                ptype = taxonomy.BY_CODE.get(req.get("proof_type") or "")
                result["explanation"] = "Aucune pièce ne correspond encore." + (f" Cette pièce est {ptype.external_hint} : anticipez le délai." if ptype and ptype.external else "")
            elif any(x.severity == "error" for x in own_checks):
                result["status"] = "problem"
                result["explanation"] = next(x.title for x in own_checks if x.severity == "error") + "."
            elif len(distinct_hashes) < needed:
                result["status"] = "partial"
                result["coverage"] = len(distinct_hashes) / needed
                result["explanation"] = f"{len(distinct_hashes)} pièce(s) distincte(s) sur {needed} demandées."
            elif all(l["confidence"] == "high" for l in linked):
                result["status"] = "covered"
                result["explanation"] = "Pièce rattachée par vous." if all(l["origin"] == "user" for l in linked) else "Pièce reconnue avec un niveau de confiance élevé."
            else:
                result["status"] = "to_verify"
                result["explanation"] = "Rattachement proposé automatiquement : confirmez qu'il s'agit bien de la bonne pièce."
        else:
            rule_key = c.get("rule")
            auto_result = rule_results.get(rule_key) if rule_key else None
            if auto_result == "fail":
                result["status"] = "problem"
                result["explanation"] = "Le contrôle automatique montre que cette règle n'est pas respectée."
                code = {"max_amount": "BUDGET_CEILING", "min_cofinancing_pct": "COFINANCING", "max_duration_months": "DURATION"}[rule_key]
                result["checks"] = [x.id for x in checks if x.code == code]
            elif auto_result == "pass":
                result["status"] = "covered"
                result["explanation"] = "Vérifié automatiquement à partir de vos pièces."
            elif req.get("declared"):
                result["status"] = "covered"
                result["explanation"] = "Vous avez confirmé remplir cette condition."
            else:
                result["status"] = "to_confirm"
                result["explanation"] = ("Condition d'éligibilité : confirmez que vous la remplissez." if req["kind"] == "condition"
                                         else "Règle à respecter : confirmez-la, ou ajoutez la pièce qui permet de la vérifier.")
        req_results.append(result)

    # ---------------------------------------------------------------- readiness
    total_w = covered_w = 0.0
    counts = {k: 0 for k in STATUS_LABELS}
    for req, res in zip(requirements, req_results):
        if res["status"] == "ignored":
            continue
        counts[res["status"]] += 1
        if not req["required"]:
            continue
        w = 2.0 if req["critical"] else 1.0
        credit = res.get("coverage", 0.0) if res["status"] == "partial" else CREDIT[res["status"]]
        total_w += w
        covered_w += w * credit
    score = round(100 * covered_w / total_w) if total_w else 0
    required_active = [(r, x) for r, x in zip(requirements, req_results) if x["status"] != "ignored" and r["required"]]
    errors = [x for x in checks if x.severity == "error"]
    if not active:
        readiness = {"code": "empty", "label": "Checklist vide"}
    elif all(x["status"] == "covered" for _, x in required_active) and not errors:
        readiness = {"code": "ready", "label": "Prêt à déposer"}
    elif errors or any(x["status"] in {"problem"} for _, x in required_active):
        readiness = {"code": "blocked", "label": "Corrections nécessaires"}
    else:
        readiness = {"code": "in_progress", "label": "En préparation"}

    actions = _next_actions(requirements, req_results, checks, piece_by_id, deadline, today)
    return {
        "score": score,
        "readiness": readiness,
        "counts": counts,
        "required_total": len(required_active),
        "requirements": {r["id"]: x for r, x in zip(requirements, req_results)},
        "checks": [x.as_dict() for x in checks],
        "actions": actions,
        "deadline": {"date": deadline.isoformat() if deadline else None, "days_left": (deadline - today).days if deadline else None,
                     "source": dossier.get("deadline_source")},
        "reference_day": reference_day.isoformat(),
        "today": today.isoformat(),
    }


def _document_checks(add, req: dict, doc: dict, c: dict, reference_day: date, deadline: date | None) -> None:
    rid, did, name = req["id"], doc["id"], doc["name"]
    facts = doc["facts"]
    if c.get("max_pages"):
        if doc.get("page_count"):
            if doc["page_count"] > c["max_pages"]:
                add("PAGE_LIMIT", "error", "Nombre de pages dépassé",
                    f"« {name} » compte {doc['page_count']} pages ; l'appel en autorise {c['max_pages']} au maximum.", rid, did)
        elif doc["ext"] in {"docx"}:
            add("PAGE_UNKNOWN", "info", "Nombre de pages non vérifiable",
                f"Le nombre de pages de « {name} » n'est pas enregistré dans le fichier. Exportez-le en PDF pour le vérifier (maximum {c['max_pages']}).", rid, did)
    if c.get("max_age_months"):
        ref = _d(facts.get("issue_date")) or _d(facts.get("latest_date"))
        limit = add_months(reference_day, -int(c["max_age_months"]))
        if ref is None:
            if doc["has_text"]:
                add("DATE_NOT_FOUND", "warning", "Date du document introuvable",
                    f"L'appel demande un document de moins de {c['max_age_months']} mois, mais aucune date n'a été trouvée dans « {name} ».", rid, did)
        elif ref < limit:
            when = "à la date limite" if deadline and reference_day == deadline else "aujourd'hui"
            add("STALE", "error", "Document trop ancien",
                f"« {name} » est daté du {format_date_fr(ref)} ; il doit dater de moins de {c['max_age_months']} mois {when} "
                f"(donc après le {format_date_fr(limit)}).", rid, did)
    expiry = _d(facts.get("expiry_date"))
    if expiry and (c.get("must_be_valid") or req.get("proof_type") == "identity"):
        if expiry < reference_day:
            add("EXPIRED", "error", "Document expiré",
                f"« {name} » expire le {format_date_fr(expiry)}, " + (f"avant la date limite ({format_date_fr(reference_day)})." if deadline and reference_day == deadline else "elle n'est donc plus valable aujourd'hui."), rid, did)
    if c.get("format") == "pdf" and doc["ext"] != "pdf":
        add("FORMAT", "warning", "Format attendu : PDF", f"L'appel demande un PDF ; « {name} » est au format {doc['ext'].upper()}.", rid, did)
    if (c.get("signed") or req.get("proof_type") in {"support_letter", "declaration"}) and doc["has_text"] and facts.get("signature_cue") is False:
        add("SIGNATURE", "warning", "Signature non détectée",
            f"Aucune mention de signature n'a été trouvée dans « {name} ». Vérifiez que le document est bien signé.", rid, did)


def _next_actions(requirements, results, checks, piece_by_id, deadline, today) -> list[dict]:
    days_left = (deadline - today).days if deadline else None
    urgent = days_left is not None and days_left <= 21
    actions = []
    by_req = {r["id"]: r for r in requirements}
    for chk in checks:
        if chk.severity != "error" or chk.code == "DEADLINE_PASSED":
            continue
        req = by_req.get(chk.requirement_id) if chk.requirement_id else None
        actions.append({"verb": "Corriger", "title": chk.title, "detail": chk.detail, "requirement_id": chk.requirement_id,
                        "document_id": chk.document_id, "check_id": chk.id, "priority": 100 + (10 if req and req["critical"] else 0)})
    for req, res in zip(requirements, results):
        if res["status"] in {"ignored", "covered", "problem"} or not req["required"]:
            continue
        ptype = taxonomy.BY_CODE.get(req.get("proof_type") or "")
        crit = 10 if req["critical"] else 0
        if res["status"] == "missing":
            if ptype and ptype.external:
                actions.append({"verb": "Demander", "title": req["label"], "requirement_id": req["id"], "priority": 80 + crit + (15 if urgent else 0),
                                "detail": f"Pièce {ptype.external_hint} : lancez la demande maintenant, le délai ne dépend pas de vous."})
            else:
                actions.append({"verb": "Ajouter", "title": req["label"], "requirement_id": req["id"], "priority": 60 + crit,
                                "detail": "Importez la pièce correspondante dans l'onglet Pièces."})
        elif res["status"] == "partial":
            actions.append({"verb": "Compléter", "title": req["label"], "requirement_id": req["id"], "priority": 55 + crit, "detail": res["explanation"]})
        elif res["status"] == "to_verify":
            doc = piece_by_id.get(res["links"][0]["document_id"]) if res["links"] else None
            actions.append({"verb": "Vérifier", "title": req["label"], "requirement_id": req["id"], "priority": 40 + crit,
                            "detail": f"Confirmez que « {doc['name']} » correspond bien à cette exigence." if doc else res["explanation"]})
        elif res["status"] == "to_confirm":
            actions.append({"verb": "Confirmer", "title": req["label"], "requirement_id": req["id"], "priority": 35 + crit, "detail": res["explanation"]})
    for chk in checks:
        if chk.severity == "warning":
            actions.append({"verb": "Vérifier", "title": chk.title, "detail": chk.detail, "requirement_id": chk.requirement_id,
                            "document_id": chk.document_id, "check_id": chk.id, "priority": 30})
    actions.sort(key=lambda a: -a["priority"])
    for i, a in enumerate(actions, 1):
        a["id"] = f"A{i:02d}"
    return actions
