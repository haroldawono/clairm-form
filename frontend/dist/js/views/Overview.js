import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
import { FACT_LABELS, factValue, STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
export function Overview(props) {
    const { state, go } = props.ctx;
    const a = state.assessment;
    const calls = state.documents.filter((d) => d.role === 'call');
    const pieces = state.documents.filter((d) => d.role === 'piece');
    const facts = state.dossier.call_facts;
    if (!calls.length && !state.requirements.length) {
        return (React.createElement("section", { className: "onboard" },
            React.createElement("h2", { className: "section-title" }, L('Commencez par l’appel à projets', 'Start with the call for proposals')),
            React.createElement("ol", { className: "steps steps-cards" },
                React.createElement("li", { className: "step-now" },
                    React.createElement("strong", null, L('Importer le règlement de l’appel', 'Import the call for proposals')),
                    React.createElement("span", null, L('PDF texte, Word ou .txt. ClairForm en extrait les pièces demandées, les conditions et les règles chiffrées.', 'Text PDF, Word or .txt. ClairForm extracts the required documents, conditions and numeric rules.')),
                    React.createElement("button", { type: "button", className: "btn btn-primary", onClick: () => go('appel') },
                        React.createElement(Icon, { name: "upload" }),
                        " ",
                        L('Importer l’appel', 'Import the call'))),
                React.createElement("li", null,
                    React.createElement("strong", null, L('Ajouter vos pièces', 'Add your documents')),
                    React.createElement("span", null, L('Vous pouvez déjà les importer : elles seront rattachées dès que la checklist existera.', 'You can already import them: they will be linked as soon as the checklist exists.')),
                    React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => go('pieces') }, L('Ajouter des pièces', 'Add documents'))),
                React.createElement("li", null,
                    React.createElement("strong", null, L('Pas de règlement numérique ?', 'No digital copy of the rules?')),
                    React.createElement("span", null, L('Saisissez les exigences à la main dans la checklist.', 'Type the requirements by hand in the checklist.')),
                    React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => go('checklist') }, L('Ouvrir la checklist', 'Open the checklist'))))));
    }
    const actions = a.actions.slice(0, 6);
    return (React.createElement("div", { className: "overview" },
        React.createElement("section", { className: "panel actions-panel", "aria-labelledby": "next" },
            React.createElement("div", { className: "section-head" },
                React.createElement("h2", { id: "next", className: "section-title" }, L('Prochaines actions', 'Next actions')),
                a.actions.length > 6 ? React.createElement("span", { className: "muted" }, L(`${a.actions.length - 6} autre(s) dans la checklist`, `${a.actions.length - 6} more in the checklist`)) : null),
            actions.length ? (React.createElement("ol", { className: "action-list" }, actions.map((x) => (React.createElement(ActionRow, { key: x.id, action: x, ctx: props.ctx }))))) : (React.createElement("p", { className: "all-clear" },
                React.createElement(Icon, { name: "check" }),
                ' ',
                L('Toutes les exigences connues sont couvertes et aucun contrôle ne signale d’erreur. Relisez le règlement une dernière fois, puis exportez le dossier.', 'All known requirements are covered and no check reports an error. Read the rules one last time, then export the application.')))),
        React.createElement("aside", { className: "overview-side" },
            React.createElement("section", { className: "panel", "aria-labelledby": "facts" },
                React.createElement("h2", { id: "facts", className: "section-title small" }, L('Lu dans l’appel', 'Read from the call')),
                facts.length ? (React.createElement("dl", { className: "facts" }, facts.map((f) => (React.createElement("div", { key: f.key, className: "fact" },
                    React.createElement("dt", null, FACT_LABELS[f.key] || f.key),
                    React.createElement("dd", null,
                        React.createElement("span", { className: "fact-value" }, factValue(f.key, f.value, f.currency)),
                        React.createElement("button", { type: "button", className: "source-link", onClick: () => props.ctx.openDocument(f.document_id, f.page) },
                            "p. ",
                            f.page))))))) : (React.createElement("p", { className: "muted" }, L('Aucune date limite ni règle chiffrée n’a été repérée. Saisissez la date limite via « Modifier ».', 'No deadline or numeric rule was found. Enter the deadline with “Edit”.')))),
            React.createElement("section", { className: "panel", "aria-labelledby": "dist" },
                React.createElement("h2", { id: "dist", className: "section-title small" }, L('Répartition', 'Breakdown')),
                React.createElement("ul", { className: "dist" }, ['problem', 'missing', 'partial', 'to_verify', 'to_confirm', 'covered'].map((s) => (React.createElement("li", { key: s },
                    React.createElement("button", { type: "button", className: "dist-row", onClick: () => go('checklist'), disabled: !a.counts[s] },
                        React.createElement("span", { className: `dot dot-${s}`, "aria-hidden": "true" }),
                        React.createElement("span", null, STATUS[s].label),
                        React.createElement("strong", null, a.counts[s] || 0)))))),
                React.createElement("p", { className: "fine" }, L(`${pieces.length} pièce(s) importée(s). Le pourcentage pondère les exigences critiques double ; une pièce « à vérifier » compte pour moitié.`, `${pieces.length} document(s) imported. Critical requirements count double in the percentage; a document “to check” counts for half.`))))));
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
        React.createElement("span", { className: "action-verb" }, x.verb_label || x.verb),
        React.createElement("div", { className: "action-body" },
            React.createElement("button", { type: "button", className: "action-title", onClick: target }, x.title),
            x.detail ? React.createElement("p", { className: "action-detail" }, x.detail) : null)));
}
