import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS } from '../lib/format.js';
import { Icon, Modal, StatusChip } from './ui.js';
export class RequirementDrawer extends Component {
    constructor(props) {
        super(props);
        this.state = { busy: null, label: props.requirement.label, note: props.requirement.note || '', editingLabel: false };
    }
    componentDidUpdate(prev) {
        if (prev.requirement.id !== this.props.requirement.id) {
            this.setState({ label: this.props.requirement.label, note: this.props.requirement.note || '', editingLabel: false, busy: null });
        }
    }
    async act(key, op, success) {
        this.setState({ busy: key });
        await this.props.ctx.run(op, success);
        this.setState({ busy: null });
    }
    patch(key, fields, success) {
        const { ctx, requirement } = this.props;
        return this.act(key, () => api.patchRequirement(ctx.state.dossier.id, requirement.id, fields), success);
    }
    link(docId, decision, success) {
        const { ctx, requirement } = this.props;
        return this.act(`link-${docId}`, () => api.setLink(ctx.state.dossier.id, requirement.id, docId, decision), success);
    }
    render() {
        const { ctx, requirement: r } = this.props;
        const st = ctx.state;
        const res = st.assessment.requirements[r.id];
        const busy = this.state.busy;
        const docs = st.documents.filter((d) => d.role === 'piece');
        const byId = {};
        docs.forEach((d) => (byId[d.id] = d));
        const linkedIds = new Set(res.links.map((l) => l.document_id));
        const checks = st.assessment.checks.filter((c) => res.checks.includes(c.id));
        const chips = constraintChips(r.constraints);
        const source = r.source_doc_id ? st.documents.find((d) => d.id === r.source_doc_id) : null;
        const rejected = docs.filter((d) => !linkedIds.has(d.id) && r.kind === 'document' && (res.rejected || []).includes(d.id));
        const linkable = docs.filter((d) => !linkedIds.has(d.id) && !rejected.some((x) => x.id === d.id));
        const ignored = r.status === 'ignored';
        return (React.createElement(Modal, { variant: "drawer", title: r.label, busy: false, onClose: this.props.onClose, subtitle: React.createElement("span", { className: "drawer-sub" },
                React.createElement(StatusChip, { status: res.status }),
                " ",
                React.createElement("span", { className: "muted" }, KIND[r.kind]),
                r.critical ? React.createElement("span", { className: "flag flag-critical" }, "critique") : null,
                !r.required ? React.createElement("span", { className: "flag" }, "facultatif") : null), footer: [
                React.createElement("button", { key: "ignore", type: "button", className: "btn btn-quiet", disabled: !!busy, onClick: () => this.patch('status', { status: ignored ? 'active' : 'ignored' }, ignored ? 'Exigence réintégrée.' : 'Exigence écartée.') },
                    React.createElement(Icon, { name: ignored ? 'undo' : 'close', size: 16 }),
                    " ",
                    ignored ? 'Réintégrer' : 'Écarter (ne me concerne pas)'),
                r.origin === 'manual' ? (React.createElement("button", { key: "del", type: "button", className: "btn btn-quiet danger-text", disabled: !!busy, onClick: async () => {
                        this.setState({ busy: 'delete' });
                        const ok = await ctx.run(() => api.deleteRequirement(st.dossier.id, r.id), 'Exigence supprimée.');
                        if (ok)
                            this.props.onClose();
                        else
                            this.setState({ busy: null });
                    } },
                    React.createElement(Icon, { name: "trash", size: 16 }),
                    " Supprimer")) : null,
                React.createElement("span", { key: "sp", className: "toolbar-spacer" }),
                React.createElement("button", { key: "close", type: "button", className: "btn btn-secondary", onClick: this.props.onClose }, "Termin\u00E9"),
            ] },
            React.createElement("p", { className: cx('explain', `explain-${res.status}`) }, res.explanation || STATUS[res.status].hint),
            checks.length ? (React.createElement("ul", { className: "check-list compact" }, checks.map((c) => (React.createElement("li", { key: c.id, className: cx('check-item', `sev-${c.severity}`) },
                React.createElement(Icon, { name: c.severity === 'info' ? 'info' : 'alert', size: 16 }),
                React.createElement("div", null,
                    React.createElement("strong", null, c.title),
                    React.createElement("p", null, c.detail))))))) : null,
            r.kind === 'document' ? (React.createElement("section", { className: "drawer-section", "aria-labelledby": "pieces-h" },
                React.createElement("h3", { id: "pieces-h", className: "drawer-h" },
                    "Pi\u00E8ces rattach\u00E9es ",
                    r.min_count > 1 ? React.createElement("span", { className: "muted" },
                        "(",
                        r.min_count,
                        " distinctes demand\u00E9es)") : null),
                res.links.length ? (React.createElement("ul", { className: "link-list" }, res.links.map((l) => {
                    const d = byId[l.document_id];
                    if (!d)
                        return null;
                    return (React.createElement("li", { key: l.document_id, className: "link-item" },
                        React.createElement("div", { className: "link-main" },
                            React.createElement("button", { type: "button", className: "link-doc", onClick: () => ctx.openDocument(d.id) },
                                React.createElement(Icon, { name: "doc", size: 16 }),
                                " ",
                                React.createElement("span", { className: "truncate" }, d.name)),
                            React.createElement("span", { className: "muted small" },
                                l.origin === 'user' ? 'Confirmé par vous' : `Proposé automatiquement — ${l.reason}`,
                                l.origin === 'auto' && l.confidence !== 'high' ? ' (confiance moyenne)' : '')),
                        React.createElement("div", { className: "link-actions" },
                            l.origin === 'auto' ? (React.createElement("button", { type: "button", className: "btn btn-primary btn-sm", disabled: !!busy, onClick: () => this.link(d.id, 'confirmed', 'Rattachement confirmé.') },
                                React.createElement(Icon, { name: "check", size: 15 }),
                                " Confirmer")) : null,
                            React.createElement("button", { type: "button", className: "btn btn-quiet btn-sm", disabled: !!busy, onClick: () => this.link(d.id, 'rejected', 'Pièce détachée de cette exigence.') }, l.origin === 'auto' ? 'Pas la bonne pièce' : 'Détacher'))));
                }))) : (React.createElement("p", { className: "muted" }, "Aucune pi\u00E8ce rattach\u00E9e.")),
                linkable.length ? (React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" }, "Rattacher une pi\u00E8ce existante"),
                    React.createElement("select", { value: "", disabled: !!busy, onChange: (e) => e.target.value && this.link(e.target.value, 'confirmed', 'Pièce rattachée.') },
                        React.createElement("option", { value: "" }, "Choisir\u2026"),
                        linkable.map((d) => (React.createElement("option", { key: d.id, value: d.id },
                            d.name,
                            " (",
                            d.proof_type_label || 'type inconnu',
                            ")")))))) : null,
                rejected.length ? (React.createElement("p", { className: "muted small" },
                    "\u00C9cart\u00E9e(s) pour cette exigence :",
                    ' ',
                    rejected.map((d, i) => (React.createElement("span", { key: d.id },
                        i ? ', ' : '',
                        d.name,
                        ' ',
                        React.createElement("button", { type: "button", className: "link-btn", disabled: !!busy, onClick: () => this.link(d.id, null, 'Décision annulée.') }, "r\u00E9tablir")))))) : null,
                React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.go('pieces') },
                    React.createElement(Icon, { name: "upload", size: 15 }),
                    " Importer une nouvelle pi\u00E8ce"))) : (React.createElement("section", { className: "drawer-section" },
                React.createElement("h3", { className: "drawer-h" }, r.kind === 'condition' ? 'Votre situation' : 'Respect de la règle'),
                r.constraints.rule && res.status !== 'to_confirm' && !r.declared ? (React.createElement("p", { className: "muted" }, "R\u00E9sultat issu des contr\u00F4les automatiques sur vos pi\u00E8ces.")) : null,
                React.createElement("button", { type: "button", className: cx('btn', r.declared ? 'btn-quiet' : 'btn-primary'), disabled: !!busy, onClick: () => this.patch('declared', { declared: !r.declared }, r.declared ? 'Confirmation retirée.' : 'Confirmation enregistrée.') },
                    React.createElement(Icon, { name: r.declared ? 'undo' : 'check', size: 16 }),
                    ' ',
                    r.declared ? 'Retirer ma confirmation' : r.kind === 'condition' ? 'Je confirme remplir cette condition' : 'Je confirme respecter cette règle'),
                r.constraints.rule && r.declared && res.status === 'problem' ? (React.createElement("p", { className: "field-error" }, "Votre confirmation ne l\u00E8ve pas l\u2019erreur d\u00E9tect\u00E9e dans vos pi\u00E8ces : corrigez la pi\u00E8ce concern\u00E9e.")) : null)),
            React.createElement("section", { className: "drawer-section", "aria-labelledby": "src-h" },
                React.createElement("h3", { id: "src-h", className: "drawer-h" }, "Source"),
                r.origin === 'manual' ? (React.createElement("p", { className: "muted" }, "Exigence ajout\u00E9e par vous.")) : (React.createElement("div", null,
                    React.createElement("blockquote", { className: "excerpt" }, r.statement),
                    React.createElement("p", { className: "muted small" },
                        source ? `${source.name}, page ${r.source_page}` : 'Document d’appel retiré',
                        r.section ? ` — section « ${r.section} »` : '',
                        ". Retenue car : ",
                        r.reason || 'formulation obligatoire',
                        "."),
                    source ? (React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openDocument(source.id, r.source_page || undefined) },
                        React.createElement(Icon, { name: "eye", size: 15 }),
                        " Voir dans l\u2019appel")) : null)),
                chips.length ? (React.createElement("p", { className: "chips-line" },
                    "Contraintes rep\u00E9r\u00E9es :",
                    ' ',
                    chips.map((c) => (React.createElement("span", { key: c, className: "flag" }, c))))) : null),
            React.createElement("details", { className: "drawer-section settings" },
                React.createElement("summary", { className: "drawer-h" }, "Corriger l\u2019exigence"),
                React.createElement("div", { className: "form" },
                    React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, "Intitul\u00E9"),
                        React.createElement("div", { className: "field-row" },
                            React.createElement("input", { type: "text", value: this.state.label, maxLength: 300, onChange: (e) => this.setState({ label: e.target.value }) }),
                            React.createElement("button", { type: "button", className: "btn btn-secondary btn-sm", disabled: !!busy || this.state.label.trim() === r.label || this.state.label.trim().length < 3, onClick: () => this.patch('label', { label: this.state.label.trim(), reviewed: true }, 'Intitulé enregistré.') }, "Enregistrer"))),
                    React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, "Nature"),
                        React.createElement("select", { value: r.kind, disabled: !!busy, onChange: (e) => this.patch('kind', { kind: e.target.value }, 'Nature modifiée.') },
                            React.createElement("option", { value: "document" }, KIND.document),
                            React.createElement("option", { value: "condition" }, KIND.condition),
                            React.createElement("option", { value: "rule" }, KIND.rule))),
                    r.kind === 'document' ? (React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, "Type de pi\u00E8ce attendu"),
                        React.createElement("select", { value: r.proof_type || '', disabled: !!busy, onChange: (e) => this.patch('proof', { proof_type: e.target.value || null }, 'Type de pièce modifié.') },
                            React.createElement("option", { value: "" }, "Non pr\u00E9cis\u00E9"),
                            st.proof_types
                                .filter((t) => t.code !== 'other')
                                .map((t) => (React.createElement("option", { key: t.code, value: t.code }, t.label)))))) : null,
                    r.kind === 'document' ? (React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, "Nombre de pi\u00E8ces distinctes demand\u00E9es"),
                        React.createElement("select", { value: String(r.min_count), disabled: !!busy, onChange: (e) => this.patch('count', { min_count: Number(e.target.value) }, 'Nombre mis à jour.') }, [1, 2, 3, 4, 5].map((n) => (React.createElement("option", { key: n, value: String(n) }, n)))))) : null,
                    React.createElement("label", { className: "check" },
                        React.createElement("input", { type: "checkbox", checked: r.critical, disabled: !!busy, onChange: (e) => this.patch('critical', { critical: e.target.checked }, 'Priorité mise à jour.') }),
                        "Critique (dossier irrecevable sans elle)"),
                    React.createElement("label", { className: "check" },
                        React.createElement("input", { type: "checkbox", checked: !r.required, disabled: !!busy, onChange: (e) => this.patch('required', { required: !e.target.checked }, 'Exigence mise à jour.') }),
                        "Facultative (ne compte pas dans le pourcentage)"),
                    React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, "Note personnelle"),
                        React.createElement("textarea", { rows: 2, maxLength: 2000, value: this.state.note, onChange: (e) => this.setState({ note: e.target.value }) })),
                    React.createElement("button", { type: "button", className: "btn btn-secondary btn-sm", disabled: !!busy || this.state.note === (r.note || ''), onClick: () => this.patch('note', { note: this.state.note }, 'Note enregistrée.') }, "Enregistrer la note")))));
    }
}
