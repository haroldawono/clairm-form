import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
const GROUPS = [
    { sev: 'error', title: 'À corriger', empty: 'Aucune erreur détectée.' },
    { sev: 'warning', title: 'À vérifier', empty: 'Aucun point d’attention.' },
    { sev: 'info', title: 'Pour information', empty: '' },
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
        React.createElement("p", { className: "intro-note" }, "ClairForm recalcule ces contr\u00F4les \u00E0 chaque changement : totaux et lignes du budget, plafond et cofinancement exig\u00E9s par l\u2019appel, dur\u00E9e du calendrier, validit\u00E9 et anciennet\u00E9 des pi\u00E8ces, nombre de pages, signatures, doublons. Chaque r\u00E9sultat cite la pi\u00E8ce et, si possible, la phrase du r\u00E8glement concern\u00E9e."),
        !checks.length ? (React.createElement("div", { className: "empty" },
            React.createElement("p", null, "Aucun contr\u00F4le \u00E0 signaler pour le moment."),
            React.createElement("p", { className: "muted" }, "Les contr\u00F4les portent sur les pi\u00E8ces import\u00E9es : ajoutez budget, calendrier et justificatifs pour qu\u2019ils s\u2019appliquent."))) : null,
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
                                "\u00AB ",
                                c.source.excerpt,
                                " \u00BB",
                                ' ',
                                React.createElement("button", { type: "button", className: "source-link", onClick: () => ctx.openDocument(c.source.document_id, c.source.page) },
                                    "appel, p. ",
                                    c.source.page))) : null,
                            React.createElement("div", { className: "check-links" },
                                c.requirement_id && reqs[c.requirement_id] ? (React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openRequirement(c.requirement_id) },
                                    "Exigence : ",
                                    reqs[c.requirement_id])) : null,
                                c.document_id && docs[c.document_id] ? (React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openDocument(c.document_id) },
                                    "Pi\u00E8ce : ",
                                    docs[c.document_id])) : null))))))));
            })
            : null));
}
