"""Catalogue of supporting-document types found in calls for proposals (FR + EN).

Each type lists the phrases that identify it in a call ("requirement" phrases) and in a
candidate's file (filename and content phrases). Phrases are matched on normalised text
(lower-case, no accents, punctuation removed), so they must be written that way.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .text import norm


@dataclass(frozen=True)
class ProofType:
    code: str
    label: str
    requirement: tuple[str, ...]
    filename: tuple[str, ...] = ()
    content: tuple[str, ...] = ()
    external: bool = False  # obtained from a third party (bank, partner, administration)
    external_hint: str = ""


TYPES: tuple[ProofType, ...] = (
    ProofType("identity", "Pièce d'identité",
              ("piece d identite", "carte d identite", "carte nationale d identite", "passeport", "cni", "identity document", "passport", "id card"),
              ("cni", "identite", "passeport", "passport", "identity", "id card", "carte identite"),
              ("carte nationale d identite", "republique", "passeport", "passport", "date de naissance", "lieu de naissance", "nationalite", "date of birth")),
    ProofType("registration", "Immatriculation / statuts",
              ("statuts", "immatriculation", "registre du commerce", "rccm", "kbis", "recepisse de declaration", "certificat d enregistrement",
               "certificate of incorporation", "acte constitutif", "enregistrement legal", "existence legale"),
              ("statuts", "rccm", "kbis", "immatriculation", "registre", "recepisse", "incorporation", "enregistrement"),
              ("registre du commerce", "rccm", "immatricul", "statuts", "recepisse de declaration", "numero d enregistrement", "siege social",
               "certificate of incorporation", "objet social"),
              external=True, external_hint="délivré par une administration (registre, préfecture)"),
    ProofType("tax", "Attestation fiscale",
              ("attestation fiscale", "attestation de non redevance", "situation fiscale", "regularite fiscale", "attestation de conformite fiscale",
               "tax clearance", "certificat fiscal", "niu"),
              ("fiscal", "fiscale", "impot", "non redevance", "tax", "dgi"),
              ("attestation de non redevance", "direction generale des impots", "regularite fiscale", "situation fiscale", "tax clearance",
               "numero d identifiant unique"),
              external=True, external_hint="délivrée par l'administration fiscale"),
    ProofType("social", "Attestation sociale",
              ("attestation sociale", "cnps", "urssaf", "securite sociale", "regularite sociale"),
              ("cnps", "urssaf", "sociale"),
              ("caisse nationale de prevoyance", "cnps", "urssaf", "cotisations sociales"),
              external=True, external_hint="délivrée par l'organisme social"),
    ProofType("bank", "Coordonnées bancaires",
              ("rib", "releve d identite bancaire", "attestation bancaire", "coordonnees bancaires", "bank details", "attestation d ouverture de compte"),
              ("rib", "bancaire", "banque", "bank"),
              ("iban", "code banque", "code guichet", "releve d identite bancaire", "titulaire du compte", "swift", "bic"),
              external=True, external_hint="délivrée par la banque"),
    ProofType("financial_statements", "États financiers",
              ("etats financiers", "bilan", "comptes annuels", "rapport financier", "compte de resultat", "financial statements", "annual accounts"),
              ("bilan", "etats financiers", "comptes", "financial"),
              ("compte de resultat", "total actif", "total passif", "bilan", "exercice clos", "etats financiers")),
    ProofType("cv", "CV",
              ("curriculum vitae", "cv", "c v", "resume"),
              ("cv", "curriculum", "resume"),
              ("experience professionnelle", "experiences professionnelles", "formation", "competences", "work experience", "education", "langues")),
    ProofType("project_note", "Note de présentation du projet",
              ("note de presentation", "note de projet", "description du projet", "presentation du projet", "document de projet", "dossier technique",
               "proposition technique", "note conceptuelle", "note d intention", "project description", "concept note", "project proposal", "memoire technique"),
              ("note", "projet", "presentation", "proposal", "concept"),
              ("probleme", "solution", "objectifs", "beneficiaires", "impact attendu", "resume du projet", "contexte", "activites prevues")),
    ProofType("budget", "Budget prévisionnel",
              ("budget previsionnel", "budget detaille", "budget du projet", "plan de financement", "budget", "budget plan", "financial plan"),
              ("budget", "financement", "financial"),
              ("total depenses", "total des depenses", "total", "montant demande", "subvention demandee", "ressources", "depenses", "apport")),
    ProofType("timeline", "Calendrier / plan de travail",
              ("calendrier", "chronogramme", "plan de travail", "planning", "timeline", "work plan", "diagramme de gantt", "plan d action"),
              ("calendrier", "chronogramme", "planning", "timeline", "gantt", "plan de travail"),
              ("debut", "fin", "mois 1", "etape", "jalon", "phase", "activite", "livrable")),
    ProofType("support_letter", "Lettre de soutien / d'engagement",
              ("lettre de soutien", "lettres de soutien", "lettre de recommandation", "lettre d engagement", "lettre de partenariat", "letter of support",
               "letters of support", "recommendation letter", "lettre d appui"),
              ("lettre", "soutien", "recommandation", "engagement", "partenaire", "letter", "support"),
              ("lettre de soutien", "nous soutenons", "nous apportons notre soutien", "s engage a", "recommande", "en qualite de partenaire",
               "letter of support"),
              external=True, external_hint="signée par un partenaire ou une institution"),
    ProofType("motivation_letter", "Lettre de motivation",
              ("lettre de motivation", "cover letter", "motivation letter", "lettre de candidature"),
              ("motivation", "cover letter", "lettre de candidature"),
              ("je souhaite", "ma motivation", "notre motivation", "je vous prie", "veuillez agreer", "dear")),
    ProofType("declaration", "Déclaration sur l'honneur",
              ("attestation sur l honneur", "declaration sur l honneur", "declaration d engagement", "engagement sur l honneur", "sworn statement",
               "self declaration", "declaration signee"),
              ("honneur", "declaration", "attestation"),
              ("sur l honneur", "atteste", "certifie", "je soussigne", "je soussignee", "declare")),
    ProofType("application_form", "Formulaire de candidature",
              ("formulaire de candidature", "fiche de candidature", "formulaire d inscription", "application form", "formulaire"),
              ("formulaire", "fiche", "candidature", "application form"),
              ("formulaire de candidature", "nom de la structure", "intitule du projet", "montant demande", "coordonnees du porteur")),
    ProofType("address", "Justificatif d'adresse",
              ("justificatif de domicile", "justificatif d adresse", "adresse du siege", "plan de localisation", "proof of address"),
              ("domicile", "adresse", "localisation", "address"),
              ("adresse", "plan de localisation", "facture", "quartier", "bp")),
    ProofType("diploma", "Diplôme / certificat",
              ("diplome", "diplomes", "certificat de formation", "attestation de formation", "degree certificate"),
              ("diplome", "certificat", "degree"),
              ("diplome", "delivre a", "certifie que", "a obtenu")),
    ProofType("media", "Vidéo / visuels",
              ("video", "pitch video", "photos", "visuels", "lien video"),
              ("video", "pitch", "photo"),
              ("youtube", "vimeo", "video")),
)

BY_CODE = {t.code: t for t in TYPES}
LABELS = {t.code: t.label for t in TYPES} | {"other": "Autre document"}


def detect_in_requirement(text: str) -> str | None:
    """Return the proof type named by a requirement sentence, preferring the most specific phrase."""
    t = f" {norm(text)} "
    best: tuple[int, int, str] | None = None
    for index, ptype in enumerate(TYPES):
        for phrase in ptype.requirement:
            pos = t.find(f" {phrase} ")
            if pos >= 0:
                # the earliest mention wins ("vidéo de présentation du projet" is a video);
                # on the same position the longest phrase wins
                key = (-pos, len(phrase), ptype.code)
                if best is None or key > best:
                    best = key
    return best[2] if best else None


def classify_document(filename: str, text: str) -> tuple[str, str, list[str]]:
    """Return (type code, confidence 'high'|'medium'|'low', reasons) for a candidate's document."""
    fname = f" {norm(filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' '))} "
    body = norm(text[:20000])
    head = f" {body[:400]} "
    body = f" {body} "
    scores: dict[str, float] = {}
    reasons: dict[str, list[str]] = {}
    for ptype in TYPES:
        score = 0.0
        why: list[str] = []
        fn_hits = [k for k in ptype.filename if f" {k} " in fname]
        if fn_hits:
            score += 3 + 0.5 * (len(fn_hits) - 1)
            why.append(f"nom du fichier : « {fn_hits[0]} »")
        req_head = [k for k in ptype.requirement if f" {k} " in head]
        if req_head:
            score += 2.5
            why.append(f"titre du document : « {req_head[0]} »")
        content_hits = [k for k in ptype.content if f" {k} " in body]
        if content_hits:
            score += min(3.0, 0.8 * len(content_hits))
            why.append("contenu : " + ", ".join(f"« {k} »" for k in content_hits[:3]))
        if score:
            scores[ptype.code] = score
            reasons[ptype.code] = why
    if not scores:
        return "other", "low", ["aucun indice reconnu"]
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    code, best = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0.0
    if best >= 5 and best - runner_up >= 1.5:
        confidence = "high"
    elif best >= 2.5 and best - runner_up >= 0.8:
        confidence = "medium"
    else:
        confidence = "low"
    return code, confidence, reasons[code]
