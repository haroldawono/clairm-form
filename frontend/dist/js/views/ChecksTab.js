import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
import { L } from '../lib/i18n.js';
const GROUPS = [
    { sev: 'error', title: L('À corriger', 'To fix'), empty: L('Aucune erreur détectée.', 'No errors found.') },
    { sev: 'warning', title: L('À vérifier', 'To check'), empty: L('Aucun point d’attention.', 'Nothing to check.') },
    { sev: 'info', title: L('Pour information', 'For information'), empty: '' },
];
export function ChecksTab(props) {
    const { ctx } = props;
    const st = ctx.state;
    const docs = {};
    st.documents.forEach((d) => (docs[d.id] = d.name));
    const reqs = {};
    st.requirements.forEach((r) => (reqs[r.id] = r.label));
    const checks = st.assessment.checks;
    return (React.createElement("div", { className: "checks" },
        React.createElement("p", { className: "intro-note" }, L('ClairForm recalcule ces contrôles à chaque changement : totaux et lignes du budget, plafond et cofinancement exigés par l’appel, durée du calendrier, validité et ancienneté des pièces, nombre de pages, signatures, doublons. Chaque résultat cite la pièce et, si possible, la phrase du règlement concernée.', 'ClairForm recalculates these checks after every change: budget totals and lines, cap and co-funding required by the call, timeline length, validity and age of documents, page counts, signatures, duplicates. Each result cites the document and, when possible, the sentence of the rules concerned.')),
        !checks.length ? (React.createElement("div", { className: "empty" },
            React.createElement("p", null, L('Aucun contrôle à signaler pour le moment.', 'Nothing to report for now.')),
            React.createElement("p", { className: "muted" }, L('Les contrôles portent sur les pièces importées : ajoutez budget, calendrier et justificatifs pour qu’ils s’appliquent.', 'Checks apply to imported documents: add the budget, timeline and supporting documents for them to run.')))) : null,
        checks.length
            ? GROUPS.map((g) => {
                const list = checks.filter((c) => c.severity === g.sev);
                if (!list.length)
                    return null;
                return (React.createElement("section", { key: g.sev, className: "check-group", "aria-label": g.title },
                    React.createElement("h2", { className: "group-title" },
                        g.title,
                        " ",
                        React.createElement("span", { className: "muted" }, list.length)),
                    React.createElement("ul", { className: "check-list" }, list.map((c) => (React.createElement("li", { key: c.id, className: cx('check-item', `sev-${c.severity}`) },
                        React.createElement(Icon, { name: c.severity === 'info' ? 'info' : 'alert' }),
                        React.createElement("div", { className: "check-body" },
                            React.createElement("strong", null, c.title),
                            React.createElement("p", null, c.detail),
                            c.source && c.source.excerpt ? (React.createElement("blockquote", { className: "excerpt small" },
                                L('«\u00a0', '“'),
                                c.source.excerpt,
                                L('\u00a0»', '”'),
                                ' ',
                                React.createElement("button", { type: "button", className: "source-link", onClick: () => ctx.openDocument(c.source.document_id, c.source.page) },
                                    L('appel', 'call'),
                                    ", p. ",
                                    c.source.page))) : null,
                            React.createElement("div", { className: "check-links" },
                                c.requirement_id && reqs[c.requirement_id] ? (React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openRequirement(c.requirement_id) },
                                    L('Exigence :', 'Requirement:'),
                                    " ",
                                    reqs[c.requirement_id])) : null,
                                c.document_id && docs[c.document_id] ? (React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openDocument(c.document_id) },
                                    L('Pièce :', 'Document:'),
                                    " ",
                                    docs[c.document_id])) : null))))))));
            })
            : null));
}
