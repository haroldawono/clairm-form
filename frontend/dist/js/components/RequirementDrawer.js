import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
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
                r.critical ? React.createElement("span", { className: "flag flag-critical" }, L('critique', 'critical')) : null,
                !r.required ? React.createElement("span", { className: "flag" }, L('facultatif', 'optional')) : null), footer: [
                React.createElement("button", { key: "ignore", type: "button", className: "btn btn-quiet", disabled: !!busy, onClick: () => this.patch('status', { status: ignored ? 'active' : 'ignored' }, ignored ? L('Exigence réintégrée.', 'Requirement restored.') : L('Exigence écartée.', 'Requirement dismissed.')) },
                    React.createElement(Icon, { name: ignored ? 'undo' : 'close', size: 16 }),
                    " ",
                    ignored ? L('Réintégrer', 'Restore') : L('Écarter (ne me concerne pas)', 'Dismiss (does not apply to me)')),
                r.origin === 'manual' ? (React.createElement("button", { key: "del", type: "button", className: "btn btn-quiet danger-text", disabled: !!busy, onClick: async () => {
                        this.setState({ busy: 'delete' });
                        const ok = await ctx.run(() => api.deleteRequirement(st.dossier.id, r.id), L('Exigence supprimée.', 'Requirement deleted.'));
                        if (ok)
                            this.props.onClose();
                        else
                            this.setState({ busy: null });
                    } },
                    React.createElement(Icon, { name: "trash", size: 16 }),
                    " ",
                    L('Supprimer', 'Delete'))) : null,
                React.createElement("span", { key: "sp", className: "toolbar-spacer" }),
                React.createElement("button", { key: "close", type: "button", className: "btn btn-secondary", onClick: this.props.onClose }, L('Terminé', 'Done')),
            ] },
            React.createElement("p", { className: cx('explain', `explain-${res.status}`) }, res.explanation || STATUS[res.status].hint),
            checks.length ? (React.createElement("ul", { className: "check-list compact" }, checks.map((c) => (React.createElement("li", { key: c.id, className: cx('check-item', `sev-${c.severity}`) },
                React.createElement(Icon, { name: c.severity === 'info' ? 'info' : 'alert', size: 16 }),
                React.createElement("div", null,
                    React.createElement("strong", null, c.title),
                    React.createElement("p", null, c.detail))))))) : null,
            r.kind === 'document' ? (React.createElement("section", { className: "drawer-section", "aria-labelledby": "pieces-h" },
                React.createElement("h3", { id: "pieces-h", className: "drawer-h" },
                    L('Pièces rattachées', 'Linked documents'),
                    " ",
                    r.min_count > 1 ? React.createElement("span", { className: "muted" }, L(`(${r.min_count} distinctes demandées)`, `(${r.min_count} separate documents required)`)) : null),
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
                                l.origin === 'user' ? L('Confirmé par vous', 'Confirmed by you') : L(`Proposé automatiquement — ${l.reason}`, `Suggested automatically — ${l.reason}`),
                                l.origin === 'auto' && l.confidence !== 'high' ? L(' (confiance moyenne)', ' (medium confidence)') : '')),
                        React.createElement("div", { className: "link-actions" },
                            l.origin === 'auto' ? (React.createElement("button", { type: "button", className: "btn btn-primary btn-sm", disabled: !!busy, onClick: () => this.link(d.id, 'confirmed', L('Rattachement confirmé.', 'Link confirmed.')) },
                                React.createElement(Icon, { name: "check", size: 15 }),
                                " ",
                                L('Confirmer', 'Confirm'))) : null,
                            React.createElement("button", { type: "button", className: "btn btn-quiet btn-sm", disabled: !!busy, onClick: () => this.link(d.id, 'rejected', L('Pièce détachée de cette exigence.', 'Document unlinked from this requirement.')) }, l.origin === 'auto' ? L('Pas la bonne pièce', 'Wrong document') : L('Détacher', 'Unlink')))));
                }))) : (React.createElement("p", { className: "muted" }, L('Aucune pièce rattachée.', 'No linked document.'))),
                linkable.length ? (React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" }, L('Rattacher une pièce existante', 'Link an existing document')),
                    React.createElement("select", { value: "", disabled: !!busy, onChange: (e) => e.target.value && this.link(e.target.value, 'confirmed', L('Pièce rattachée.', 'Document linked.')) },
                        React.createElement("option", { value: "" }, L('Choisir…', 'Choose…')),
                        linkable.map((d) => (React.createElement("option", { key: d.id, value: d.id },
                            d.name,
                            " (",
                            d.proof_type_label || L('type inconnu', 'unknown type'),
                            ")")))))) : null,
                rejected.length ? (React.createElement("p", { className: "muted small" },
                    L('Écartée(s) pour cette exigence :', 'Rejected for this requirement:'),
                    ' ',
                    rejected.map((d, i) => (React.createElement("span", { key: d.id },
                        i ? ', ' : '',
                        d.name,
                        ' ',
                        React.createElement("button", { type: "button", className: "link-btn", disabled: !!busy, onClick: () => this.link(d.id, null, L('Décision annulée.', 'Decision undone.')) }, L('rétablir', 'restore'))))))) : null,
                React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.go('pieces') },
                    React.createElement(Icon, { name: "upload", size: 15 }),
                    " ",
                    L('Importer une nouvelle pièce', 'Import a new document')))) : (React.createElement("section", { className: "drawer-section" },
                React.createElement("h3", { className: "drawer-h" }, r.kind === 'condition' ? L('Votre situation', 'Your situation') : L('Respect de la règle', 'Compliance with the rule')),
                r.constraints.rule && res.status !== 'to_confirm' && !r.declared ? (React.createElement("p", { className: "muted" }, L('Résultat issu des contrôles automatiques sur vos pièces.', 'Result based on the automatic checks of your documents.'))) : null,
                React.createElement("button", { type: "button", className: cx('btn', r.declared ? 'btn-quiet' : 'btn-primary'), disabled: !!busy, onClick: () => this.patch('declared', { declared: !r.declared }, r.declared ? L('Confirmation retirée.', 'Confirmation withdrawn.') : L('Confirmation enregistrée.', 'Confirmation saved.')) },
                    React.createElement(Icon, { name: r.declared ? 'undo' : 'check', size: 16 }),
                    ' ',
                    r.declared ? L('Retirer ma confirmation', 'Withdraw my confirmation') : r.kind === 'condition' ? L('Je confirme remplir cette condition', 'I confirm I meet this condition') : L('Je confirme respecter cette règle', 'I confirm I follow this rule')),
                r.constraints.rule && r.declared && res.status === 'problem' ? (React.createElement("p", { className: "field-error" }, L('Votre confirmation ne lève pas l’erreur détectée dans vos pièces : corrigez la pièce concernée.', 'Your confirmation does not clear the error found in your documents: fix the document concerned.'))) : null)),
            React.createElement("section", { className: "drawer-section", "aria-labelledby": "src-h" },
                React.createElement("h3", { id: "src-h", className: "drawer-h" }, L('Source', 'Source')),
                r.origin === 'manual' ? (React.createElement("p", { className: "muted" }, L('Exigence ajoutée par vous.', 'Requirement added by you.'))) : (React.createElement("div", null,
                    React.createElement("blockquote", { className: "excerpt" }, r.statement),
                    React.createElement("p", { className: "muted small" },
                        source ? `${source.name}, page ${r.source_page}` : L('Document d’appel retiré', 'Call document removed'),
                        r.section ? L(` — section « ${r.section} »`, ` — section “${r.section}”`) : '',
                        ". ",
                        L('Retenue car :', 'Kept because:'),
                        " ",
                        r.reason || L('formulation obligatoire', 'mandatory wording'),
                        "."),
                    source ? (React.createElement("button", { type: "button", className: "link-btn", onClick: () => ctx.openDocument(source.id, r.source_page || undefined) },
                        React.createElement(Icon, { name: "eye", size: 15 }),
                        " ",
                        L('Voir dans l’appel', 'See in the call'))) : null)),
                chips.length ? (React.createElement("p", { className: "chips-line" },
                    L('Contraintes repérées :', 'Constraints found:'),
                    ' ',
                    chips.map((c) => (React.createElement("span", { key: c, className: "flag" }, c))))) : null),
            React.createElement("details", { className: "drawer-section settings" },
                React.createElement("summary", { className: "drawer-h" }, L('Corriger l’exigence', 'Correct the requirement')),
                React.createElement("div", { className: "form" },
                    React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, L('Intitulé', 'Title')),
                        React.createElement("div", { className: "field-row" },
                            React.createElement("input", { type: "text", value: this.state.label, maxLength: 300, onChange: (e) => this.setState({ label: e.target.value }) }),
                            React.createElement("button", { type: "button", className: "btn btn-secondary btn-sm", disabled: !!busy || this.state.label.trim() === r.label || this.state.label.trim().length < 3, onClick: () => this.patch('label', { label: this.state.label.trim(), reviewed: true }, L('Intitulé enregistré.', 'Title saved.')) }, L('Enregistrer', 'Save')))),
                    React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, L('Nature', 'Kind')),
                        React.createElement("select", { value: r.kind, disabled: !!busy, onChange: (e) => this.patch('kind', { kind: e.target.value }, L('Nature modifiée.', 'Kind changed.')) },
                            React.createElement("option", { value: "document" }, KIND.document),
                            React.createElement("option", { value: "condition" }, KIND.condition),
                            React.createElement("option", { value: "rule" }, KIND.rule))),
                    r.kind === 'document' ? (React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, L('Type de pièce attendu', 'Expected document type')),
                        React.createElement("select", { value: r.proof_type || '', disabled: !!busy, onChange: (e) => this.patch('proof', { proof_type: e.target.value || null }, L('Type de pièce modifié.', 'Document type changed.')) },
                            React.createElement("option", { value: "" }, L('Non précisé', 'Not specified')),
                            st.proof_types
                                .filter((t) => t.code !== 'other')
                                .map((t) => (React.createElement("option", { key: t.code, value: t.code }, t.label)))))) : null,
                    r.kind === 'document' ? (React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, L('Nombre de pièces distinctes demandées', 'Number of separate documents required')),
                        React.createElement("select", { value: String(r.min_count), disabled: !!busy, onChange: (e) => this.patch('count', { min_count: Number(e.target.value) }, L('Nombre mis à jour.', 'Number updated.')) }, [1, 2, 3, 4, 5].map((n) => (React.createElement("option", { key: n, value: String(n) }, n)))))) : null,
                    React.createElement("label", { className: "check" },
                        React.createElement("input", { type: "checkbox", checked: r.critical, disabled: !!busy, onChange: (e) => this.patch('critical', { critical: e.target.checked }, L('Priorité mise à jour.', 'Priority updated.')) }),
                        L('Critique (dossier irrecevable sans elle)', 'Critical (application rejected without it)')),
                    React.createElement("label", { className: "check" },
                        React.createElement("input", { type: "checkbox", checked: !r.required, disabled: !!busy, onChange: (e) => this.patch('required', { required: !e.target.checked }, L('Exigence mise à jour.', 'Requirement updated.')) }),
                        L('Facultative (ne compte pas dans le pourcentage)', 'Optional (not counted in the percentage)')),
                    React.createElement("label", { className: "field" },
                        React.createElement("span", { className: "field-label" }, L('Note personnelle', 'Personal note')),
                        React.createElement("textarea", { rows: 2, maxLength: 2000, value: this.state.note, onChange: (e) => this.setState({ note: e.target.value }) })),
                    React.createElement("button", { type: "button", className: "btn btn-secondary btn-sm", disabled: !!busy || this.state.note === (r.note || ''), onClick: () => this.patch('note', { note: this.state.note }, L('Note enregistrée.', 'Note saved.')) }, L('Enregistrer la note', 'Save the note'))))));
    }
}
