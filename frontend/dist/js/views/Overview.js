import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
import { FACT_LABELS, factValue, STATUS } from '../lib/format.js';
export function Overview(props) {
    const { state, go } = props.ctx;
    const a = state.assessment;
    const calls = state.documents.filter((d) => d.role === 'call');
    const pieces = state.documents.filter((d) => d.role === 'piece');
    const facts = state.dossier.call_facts;
    if (!calls.length && !state.requirements.length) {
        return (React.createElement("section", { className: "onboard" },
            React.createElement("h2", { className: "section-title" }, "Commencez par l\u2019appel \u00E0 projets"),
            React.createElement("ol", { className: "steps steps-cards" },
                React.createElement("li", { className: "step-now" },
                    React.createElement("strong", null, "Importer le r\u00E8glement de l\u2019appel"),
                    React.createElement("span", null, "PDF texte, Word ou .txt. ClairForm en extrait les pi\u00E8ces demand\u00E9es, les conditions et les r\u00E8gles chiffr\u00E9es."),
                    React.createElement("button", { type: "button", className: "btn btn-primary", onClick: () => go('appel') },
                        React.createElement(Icon, { name: "upload" }),
                        " Importer l\u2019appel")),
                React.createElement("li", null,
                    React.createElement("strong", null, "Ajouter vos pi\u00E8ces"),
                    React.createElement("span", null, "Vous pouvez d\u00E9j\u00E0 les importer : elles seront rattach\u00E9es d\u00E8s que la checklist existera."),
                    React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => go('pieces') }, "Ajouter des pi\u00E8ces")),
                React.createElement("li", null,
                    React.createElement("strong", null, "Pas de r\u00E8glement num\u00E9rique ?"),
                    React.createElement("span", null, "Saisissez les exigences \u00E0 la main dans la checklist."),
                    React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => go('checklist') }, "Ouvrir la checklist")))));
    }
    const actions = a.actions.slice(0, 6);
    return (React.createElement("div", { className: "overview" },
        React.createElement("section", { className: "panel actions-panel", "aria-labelledby": "next" },
            React.createElement("div", { className: "section-head" },
                React.createElement("h2", { id: "next", className: "section-title" }, "Prochaines actions"),
                a.actions.length > 6 ? React.createElement("span", { className: "muted" },
                    a.actions.length - 6,
                    " autre(s) dans la checklist") : null),
            actions.length ? (React.createElement("ol", { className: "action-list" }, actions.map((x) => (React.createElement(ActionRow, { key: x.id, action: x, ctx: props.ctx }))))) : (React.createElement("p", { className: "all-clear" },
                React.createElement(Icon, { name: "check" }),
                " Toutes les exigences connues sont couvertes et aucun contr\u00F4le ne signale d\u2019erreur. Relisez le r\u00E8glement une derni\u00E8re fois, puis exportez le dossier."))),
        React.createElement("aside", { className: "overview-side" },
            React.createElement("section", { className: "panel", "aria-labelledby": "facts" },
                React.createElement("h2", { id: "facts", className: "section-title small" }, "Lu dans l\u2019appel"),
                facts.length ? (React.createElement("dl", { className: "facts" }, facts.map((f) => (React.createElement("div", { key: f.key, className: "fact" },
                    React.createElement("dt", null, FACT_LABELS[f.key] || f.key),
                    React.createElement("dd", null,
                        React.createElement("span", { className: "fact-value" }, factValue(f.key, f.value, f.currency)),
                        React.createElement("button", { type: "button", className: "source-link", onClick: () => props.ctx.openDocument(f.document_id, f.page) },
                            "p. ",
                            f.page))))))) : (React.createElement("p", { className: "muted" }, "Aucune date limite ni r\u00E8gle chiffr\u00E9e n\u2019a \u00E9t\u00E9 rep\u00E9r\u00E9e. Saisissez la date limite via \u00AB Modifier \u00BB."))),
            React.createElement("section", { className: "panel", "aria-labelledby": "dist" },
                React.createElement("h2", { id: "dist", className: "section-title small" }, "R\u00E9partition"),
                React.createElement("ul", { className: "dist" }, ['problem', 'missing', 'partial', 'to_verify', 'to_confirm', 'covered'].map((s) => (React.createElement("li", { key: s },
                    React.createElement("button", { type: "button", className: "dist-row", onClick: () => go('checklist'), disabled: !a.counts[s] },
                        React.createElement("span", { className: `dot dot-${s}`, "aria-hidden": "true" }),
                        React.createElement("span", null, STATUS[s].label),
                        React.createElement("strong", null, a.counts[s] || 0)))))),
                React.createElement("p", { className: "fine" },
                    pieces.length,
                    " pi\u00E8ce(s) import\u00E9e(s). Le pourcentage pond\u00E8re les exigences critiques double ; une pi\u00E8ce \u00AB \u00E0 v\u00E9rifier \u00BB compte pour moiti\u00E9.")))));
}
function ActionRow(props) {
    const x = props.action;
    const target = () => {
        if (x.requirement_id)
            props.ctx.openRequirement(x.requirement_id);
        else if (x.check_id)
            props.ctx.go('controles');
        else if (x.document_id)
            props.ctx.go('pieces');
    };
    return (React.createElement("li", { className: cx('action', `verb-${x.verb.toLowerCase()}`) },
        React.createElement("span", { className: "action-verb" }, x.verb),
        React.createElement("div", { className: "action-body" },
            React.createElement("button", { type: "button", className: "action-title", onClick: target }, x.title),
            x.detail ? React.createElement("p", { className: "action-detail" }, x.detail) : null)));
}
