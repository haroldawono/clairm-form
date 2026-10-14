import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { ACCEPT_PIECES, amount, dateShort, size } from '../lib/format.js';
import { Icon } from '../components/ui.js';
import { Uploader } from '../components/Uploader.js';
export class Pieces extends Component {
    constructor() {
        super(...arguments);
        this.state = { busy: null };
        this.setType = async (doc, code) => {
            this.setState({ busy: doc.id });
            const label = this.props.ctx.state.proof_types.find((t) => t.code === code);
            await this.props.ctx.run(() => api.setDocType(this.props.ctx.state.dossier.id, doc.id, code), `« ${doc.name} » classé comme ${label ? label.label : code}.`);
            this.setState({ busy: null });
        };
    }
    render() {
        const { ctx } = this.props;
        const st = ctx.state;
        const pieces = st.documents.filter((d) => d.role === 'piece');
        const reqLabel = {};
        st.requirements.forEach((r) => (reqLabel[r.id] = r.label));
        const usage = {};
        Object.keys(st.assessment.requirements).forEach((rid) => st.assessment.requirements[rid].links.forEach((l) => (usage[l.document_id] = (usage[l.document_id] || []).concat(rid))));
        const checksByDoc = {};
        st.assessment.checks.forEach((c) => c.document_id && (checksByDoc[c.document_id] = (checksByDoc[c.document_id] || []).concat(c)));
        return (React.createElement("div", { className: "pieces" },
            React.createElement(Uploader, { ctx: ctx, role: "piece", accept: ACCEPT_PIECES, multiple: true, title: "Ajouter vos pi\u00E8ces", hint: "Glissez-d\u00E9posez plusieurs fichiers : PDF, Word, Excel, CSV, texte, ou photos (JPG, PNG) \u2014 20 Mo max. par fichier." }),
            !pieces.length ? (React.createElement("div", { className: "empty" },
                React.createElement("p", null, "Aucune pi\u00E8ce pour l\u2019instant."),
                React.createElement("p", { className: "muted" }, "Chaque fichier est lu localement, son type est reconnu, puis il est rattach\u00E9 \u00E0 l\u2019exigence correspondante."))) : (React.createElement("ul", { className: "piece-list" }, pieces.map((d) => {
                const used = usage[d.id] || [];
                const issues = (checksByDoc[d.id] || []).filter((c) => c.severity !== 'info');
                const f = d.facts || {};
                const facts = [];
                if (d.page_count)
                    facts.push(`${d.page_count} page${d.page_count > 1 ? 's' : ''}`);
                if (f.issue_date)
                    facts.push(`daté du ${dateShort(f.issue_date)}`);
                if (f.expiry_date)
                    facts.push(`expire le ${dateShort(f.expiry_date)}`);
                if (f.budget && f.budget.expense_total)
                    facts.push(`total ${amount(f.budget.expense_total, f.budget.currency)}`);
                if (f.budget && f.budget.requested)
                    facts.push(`demandé ${amount(f.budget.requested.amount, f.budget.currency)}`);
                else if (f.requested_amount)
                    facts.push(`demandé ${amount(f.requested_amount.amount, f.requested_amount.currency)}`);
                if (f.timeline)
                    facts.push(`${dateShort(f.timeline.start)} → ${dateShort(f.timeline.end)}`);
                if (!d.has_text)
                    facts.push('aucun texte lisible');
                const typeId = `type-${d.id}`;
                return (React.createElement("li", { key: d.id, className: cx('piece', issues.some((c) => c.severity === 'error') && 'piece-error') },
                    React.createElement("div", { className: "piece-head" },
                        React.createElement("button", { type: "button", className: "piece-name", onClick: () => ctx.openDocument(d.id) },
                            React.createElement(Icon, { name: "doc" }),
                            " ",
                            React.createElement("span", { className: "truncate" }, d.name)),
                        React.createElement("span", { className: "muted small nowrap" },
                            d.ext.toUpperCase(),
                            " \u00B7 ",
                            size(d.size)),
                        React.createElement("span", { className: "toolbar-spacer" }),
                        React.createElement("a", { className: "icon-btn", href: api.fileUrl(st.dossier.id, d.id), download: true, "aria-label": `Télécharger ${d.name}` },
                            React.createElement(Icon, { name: "download" })),
                        React.createElement("button", { type: "button", className: "icon-btn danger-hover", "aria-label": `Supprimer ${d.name}`, onClick: () => ctx.askDeleteDocument(d.id) },
                            React.createElement(Icon, { name: "trash" }))),
                    React.createElement("div", { className: "piece-body" },
                        React.createElement("div", { className: "piece-type" },
                            React.createElement("label", { htmlFor: typeId, className: "field-label-inline" }, "Type"),
                            React.createElement("select", { id: typeId, value: d.proof_type || 'other', disabled: this.state.busy === d.id, onChange: (e) => this.setType(d, e.target.value) }, st.proof_types.map((t) => (React.createElement("option", { key: t.code, value: t.code }, t.label)))),
                            React.createElement("span", { className: cx('confidence', `conf-${d.proof_type_source === 'user' ? 'user' : d.proof_confidence}`) }, d.proof_type_source === 'user'
                                ? 'choisi par vous'
                                : d.proof_type === 'other'
                                    ? 'non reconnu'
                                    : d.proof_confidence === 'high'
                                        ? 'reconnu'
                                        : 'à vérifier')),
                        d.proof_type_source !== 'user' && d.proof_confidence !== 'high' && d.proof_reasons.length ? React.createElement("p", { className: "muted small" },
                            "Indices : ",
                            d.proof_reasons.join(' ; ')) : null,
                        facts.length ? React.createElement("p", { className: "piece-facts" }, facts.join(' · ')) : null,
                        React.createElement("p", { className: "piece-usage" }, used.length ? (React.createElement("span", null,
                            "Couvre :",
                            ' ',
                            used.map((rid, i) => (React.createElement("span", { key: rid },
                                i ? ', ' : '',
                                React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openRequirement(rid) }, reqLabel[rid])))))) : (React.createElement("span", { className: "muted" }, "Rattach\u00E9e \u00E0 aucune exigence."))),
                        issues.length ? (React.createElement("ul", { className: "check-list compact" }, issues.map((c) => (React.createElement("li", { key: c.id, className: cx('check-item', `sev-${c.severity}`) },
                            React.createElement(Icon, { name: "alert", size: 16 }),
                            React.createElement("div", null,
                                React.createElement("strong", null, c.title),
                                React.createElement("p", null, c.detail))))))) : null)));
            })))));
    }
}
