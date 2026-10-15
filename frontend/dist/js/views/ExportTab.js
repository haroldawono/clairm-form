import { api } from '../lib/api.js';
import { Icon } from '../components/ui.js';
import { L } from '../lib/i18n.js';
export function ExportTab(props) {
    const st = props.ctx.state;
    const a = st.assessment;
    const id = st.dossier.id;
    const linkedDocs = new Set();
    Object.keys(a.requirements).forEach((rid) => a.requirements[rid].links.forEach((l) => linkedDocs.add(l.document_id)));
    const pieces = st.documents.filter((d) => d.role === 'piece');
    const unlinked = pieces.filter((d) => !linkedDocs.has(d.id));
    return (React.createElement("div", { className: "export" },
        a.readiness.code !== 'ready' ? (React.createElement("div", { className: "notice", role: "note" },
            React.createElement(Icon, { name: "info" }),
            React.createElement("p", null, L(`Le dossier n’est pas encore prêt (${a.readiness.label.toLowerCase()}). Vous pouvez exporter à tout moment : le rapport liste ce qui reste à faire et le paquet ne contient que les pièces rattachées.`, `The application is not ready yet (${a.readiness.label.toLowerCase()}). You can export at any time: the report lists what remains to be done and the package only contains linked documents.`)))) : null,
        React.createElement("div", { className: "export-grid" },
            React.createElement("article", { className: "export-card" },
                React.createElement("h2", { className: "section-title small" }, L('Rapport de préparation (PDF)', 'Readiness report (PDF)')),
                React.createElement("p", null, L('État du dossier, checklist complète avec statut, pièce et page source de chaque exigence, contrôles et prochaines actions.', 'Application status, full checklist with the status, document and source page of each requirement, checks and next actions.')),
                React.createElement("a", { className: "btn btn-primary", href: api.exportUrl(id, 'report.pdf'), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " ",
                    L('Télécharger le rapport', 'Download the report'))),
            React.createElement("article", { className: "export-card" },
                React.createElement("h2", { className: "section-title small" }, L('Paquet de dépôt (ZIP)', 'Submission package (ZIP)')),
                React.createElement("p", null, L('Vos pièces renommées dans l’ordre de la checklist (« 01_Formulaire_de_candidature.pdf »…), le rapport et un manifeste avec l’empreinte SHA-256 de chaque fichier.', 'Your documents renamed in checklist order (“01_Application_form.pdf”…), the report, and a manifest with the SHA-256 fingerprint of each file.')),
                React.createElement("a", { className: "btn btn-secondary", href: api.exportUrl(id, 'package.zip'), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " ",
                    L('Télécharger le paquet', 'Download the package')),
                unlinked.length ? (React.createElement("p", { className: "muted small" },
                    L(`${unlinked.length} pièce(s) non rattachée(s) ne seront pas incluses :`, `${unlinked.length} unlinked document(s) will not be included:`),
                    " ",
                    unlinked.map((d) => d.name).join(', '),
                    ".")) : null),
            React.createElement("article", { className: "export-card" },
                React.createElement("h2", { className: "section-title small" }, L('Données (JSON)', 'Data (JSON)')),
                React.createElement("p", null, L('Toutes les exigences, décisions, contrôles et l’historique des modifications, pour archivage ou réutilisation.', 'All requirements, decisions, checks and change history, for archiving or reuse.')),
                React.createElement("a", { className: "btn btn-secondary", href: api.exportUrl(id, 'data.json'), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " ",
                    L('Exporter les données', 'Export the data')))),
        React.createElement("section", { className: "danger-zone" },
            React.createElement("h2", { className: "section-title small" }, L('Effacer le dossier', 'Erase the application')),
            React.createElement("p", { className: "muted" }, L('Supprime le dossier, ses fichiers et son historique.', 'Deletes the application, its files and its history.')),
            React.createElement("button", { type: "button", className: "btn btn-danger-outline", onClick: props.onDeleteDossier },
                React.createElement(Icon, { name: "trash" }),
                " ",
                L('Supprimer ce dossier', 'Delete this application')))));
}
