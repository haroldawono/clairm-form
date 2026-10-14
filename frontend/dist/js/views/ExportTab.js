import { api } from '../lib/api.js';
import { Icon } from '../components/ui.js';
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
            React.createElement("p", null,
                "Le dossier n\u2019est pas encore pr\u00EAt (",
                a.readiness.label.toLowerCase(),
                "). Vous pouvez exporter \u00E0 tout moment : le rapport liste ce qui reste \u00E0 faire et le paquet ne contient que les pi\u00E8ces rattach\u00E9es."))) : null,
        React.createElement("div", { className: "export-grid" },
            React.createElement("article", { className: "export-card" },
                React.createElement("h2", { className: "section-title small" }, "Rapport de pr\u00E9paration (PDF)"),
                React.createElement("p", null, "\u00C9tat du dossier, checklist compl\u00E8te avec statut, pi\u00E8ce et page source de chaque exigence, contr\u00F4les et prochaines actions."),
                React.createElement("a", { className: "btn btn-primary", href: api.exportUrl(id, 'report.pdf'), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " T\u00E9l\u00E9charger le rapport")),
            React.createElement("article", { className: "export-card" },
                React.createElement("h2", { className: "section-title small" }, "Paquet de d\u00E9p\u00F4t (ZIP)"),
                React.createElement("p", null, "Vos pi\u00E8ces renomm\u00E9es dans l\u2019ordre de la checklist (\u00AB 01_Formulaire_de_candidature.pdf \u00BB\u2026), le rapport et un manifeste avec l\u2019empreinte SHA-256 de chaque fichier."),
                React.createElement("a", { className: "btn btn-secondary", href: api.exportUrl(id, 'package.zip'), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " T\u00E9l\u00E9charger le paquet"),
                unlinked.length ? (React.createElement("p", { className: "muted small" },
                    unlinked.length,
                    " pi\u00E8ce(s) non rattach\u00E9e(s) ne seront pas incluses : ",
                    unlinked.map((d) => d.name).join(', '),
                    ".")) : null),
            React.createElement("article", { className: "export-card" },
                React.createElement("h2", { className: "section-title small" }, "Donn\u00E9es (JSON)"),
                React.createElement("p", null, "Toutes les exigences, d\u00E9cisions, contr\u00F4les et l\u2019historique des modifications, pour archivage ou r\u00E9utilisation."),
                React.createElement("a", { className: "btn btn-secondary", href: api.exportUrl(id, 'data.json'), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " Exporter les donn\u00E9es"))),
        React.createElement("section", { className: "danger-zone" },
            React.createElement("h2", { className: "section-title small" }, "Effacer le dossier"),
            React.createElement("p", { className: "muted" }, "Supprime le dossier, ses fichiers et son historique de cet ordinateur."),
            React.createElement("button", { type: "button", className: "btn btn-danger-outline", onClick: props.onDeleteDossier },
                React.createElement(Icon, { name: "trash" }),
                " Supprimer ce dossier"))));
}
