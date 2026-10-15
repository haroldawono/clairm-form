import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS, STATUS_ORDER } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import { Icon, Modal, StatusChip } from '../components/ui.js';
export class Checklist extends Component {
    constructor() {
        super(...arguments);
        this.state = { status: '', kind: '', q: '', adding: false };
    }
    render() {
        const { ctx } = this.props;
        const { state } = ctx;
        const results = state.assessment.requirements;
        const docs = {};
        state.documents.forEach((d) => (docs[d.id] = d.name));
        const q = this.state.q.trim().toLowerCase();
        const rows = state.requirements.filter((r) => {
            const res = results[r.id];
            if (this.state.status && res.status !== this.state.status)
                return false;
            if (this.state.kind && r.kind !== this.state.kind)
                return false;
            if (q && !(r.label + ' ' + r.statement).toLowerCase().includes(q))
                return false;
            return true;
        });
        const groups = ['document', 'condition', 'rule'];
        const counts = {};
        state.requirements.forEach((r) => (counts[results[r.id].status] = (counts[results[r.id].status] || 0) + 1));
        const filtered = this.state.status || this.state.kind || q;
        return (React.createElement("div", { className: "checklist" },
            React.createElement("div", { className: "toolbar", role: "search" },
                React.createElement("label", { className: "field field-inline" },
                    React.createElement("span", { className: "sr-only" }, L('Rechercher une exigence', 'Search requirements')),
                    React.createElement(Icon, { name: "search", size: 16 }),
                    React.createElement("input", { type: "search", placeholder: L('Rechercher…', 'Search…'), value: this.state.q, onChange: (e) => this.setState({ q: e.target.value }) })),
                React.createElement("label", { className: "field field-inline" },
                    React.createElement("span", { className: "field-label-inline" }, L('Statut', 'Status')),
                    React.createElement("select", { value: this.state.status, onChange: (e) => this.setState({ status: e.target.value }) },
                        React.createElement("option", { value: "" },
                            L('Tous', 'All'),
                            " (",
                            state.requirements.length,
                            ")"),
                        STATUS_ORDER.filter((s) => counts[s]).map((s) => (React.createElement("option", { key: s, value: s },
                            STATUS[s].label,
                            " (",
                            counts[s],
                            ")"))))),
                React.createElement("label", { className: "field field-inline" },
                    React.createElement("span", { className: "field-label-inline" }, "Type"),
                    React.createElement("select", { value: this.state.kind, onChange: (e) => this.setState({ kind: e.target.value }) },
                        React.createElement("option", { value: "" }, L('Tous', 'All')),
                        React.createElement("option", { value: "document" }, L('Pièces', 'Documents')),
                        React.createElement("option", { value: "condition" }, "Conditions"),
                        React.createElement("option", { value: "rule" }, L('Règles', 'Rules')))),
                filtered ? (React.createElement("button", { type: "button", className: "btn btn-quiet btn-sm", onClick: () => this.setState({ status: '', kind: '', q: '' }) }, L('Effacer les filtres', 'Clear filters'))) : null,
                React.createElement("span", { className: "toolbar-spacer" }),
                React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => this.setState({ adding: true }) },
                    React.createElement(Icon, { name: "plus" }),
                    " ",
                    L('Ajouter une exigence', 'Add a requirement'))),
            !state.requirements.length ? (React.createElement("div", { className: "empty" },
                React.createElement("p", null, L('La checklist est vide.', 'The checklist is empty.')),
                React.createElement("p", { className: "muted" },
                    L('Importez le règlement dans l’onglet', 'Import the rules in the'),
                    " ",
                    React.createElement("a", { href: `#/d/${state.dossier.id}/appel` }, L('Appel', 'Call')),
                    L(', ou ajoutez les exigences à la main.', ' tab, or add the requirements by hand.')))) : null,
            state.requirements.length && !rows.length ? React.createElement("p", { className: "empty muted" }, L('Aucune exigence ne correspond à ces filtres.', 'No requirement matches these filters.')) : null,
            groups.map((g) => {
                const list = rows.filter((r) => r.kind === g);
                if (!list.length)
                    return null;
                return (React.createElement("section", { key: g, className: "req-group", "aria-label": KIND[g] },
                    React.createElement("h2", { className: "group-title" },
                        g === 'document' ? L('Pièces à fournir', 'Required documents') : g === 'condition' ? L('Conditions d’éligibilité', 'Eligibility conditions') : L('Règles à respecter', 'Rules to follow'),
                        React.createElement("span", { className: "muted" },
                            " ",
                            list.length)),
                    React.createElement("ul", { className: "req-list" }, list.map((r) => {
                        const res = results[r.id];
                        const chips = constraintChips(r.constraints);
                        return (React.createElement("li", { key: r.id },
                            React.createElement("button", { type: "button", className: cx('req-row', `rs-${res.status}`), onClick: () => ctx.openRequirement(r.id) },
                                React.createElement(StatusChip, { status: res.status }),
                                React.createElement("span", { className: "req-main" },
                                    React.createElement("span", { className: "req-label" }, r.label),
                                    React.createElement("span", { className: "req-sub" },
                                        r.critical ? React.createElement("span", { className: "flag flag-critical" }, L('critique', 'critical')) : null,
                                        !r.required ? React.createElement("span", { className: "flag" }, L('facultatif', 'optional')) : null,
                                        r.min_count > 1 ? React.createElement("span", { className: "flag" }, L(`${r.min_count} pièces`, `${r.min_count} documents`)) : null,
                                        chips.map((c) => (React.createElement("span", { key: c, className: "flag" }, c))),
                                        res.links.length ? (React.createElement("span", { className: "req-docs truncate" }, res.links.map((l) => docs[l.document_id]).join(', '))) : (React.createElement("span", { className: "req-expl" }, res.explanation)))),
                                React.createElement("span", { className: "req-src" }, r.origin === 'manual' ? L('ajoutée', 'added') : r.source_page ? `p. ${r.source_page}` : ''))));
                    }))));
            }),
            this.state.adding ? React.createElement(AddRequirement, { ctx: ctx, onClose: () => this.setState({ adding: false }) }) : null));
    }
}
class AddRequirement extends Component {
    constructor() {
        super(...arguments);
        this.state = { label: '', kind: 'document', proof: '', critical: false, required: true, busy: false, error: '' };
        this.submit = async (e) => {
            e.preventDefault();
            if (this.state.label.trim().length < 3) {
                this.setState({ error: L('Décrivez l’exigence en quelques mots (3 caractères minimum).', 'Describe the requirement in a few words (at least 3 characters).') });
                return;
            }
            this.setState({ busy: true });
            const ok = await this.props.ctx.run(() => api.addRequirement(this.props.ctx.state.dossier.id, {
                label: this.state.label.trim(),
                kind: this.state.kind,
                proof_type: this.state.kind === 'document' && this.state.proof ? this.state.proof : null,
                critical: this.state.critical,
                required: this.state.required,
            }), L('Exigence ajoutée à la checklist.', 'Requirement added to the checklist.'));
            if (ok)
                this.props.onClose();
            else
                this.setState({ busy: false });
        };
    }
    render() {
        const types = this.props.ctx.state.proof_types.filter((t) => t.code !== 'other');
        return (React.createElement(Modal, { title: L('Ajouter une exigence', 'Add a requirement'), onClose: this.props.onClose, busy: this.state.busy, footer: [
                React.createElement("button", { key: "c", type: "button", className: "btn btn-quiet", onClick: this.props.onClose, disabled: this.state.busy }, L('Annuler', 'Cancel')),
                React.createElement("button", { key: "s", type: "submit", form: "add-req", className: "btn btn-primary", disabled: this.state.busy }, this.state.busy ? L('Ajout…', 'Adding…') : L('Ajouter', 'Add')),
            ] },
            React.createElement("form", { id: "add-req", className: "form", onSubmit: this.submit, noValidate: true },
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" }, L('Exigence', 'Requirement')),
                    React.createElement("textarea", { rows: 3, maxLength: 300, "data-autofocus": true, value: this.state.label, placeholder: L('Ex. Attestation de domiciliation bancaire', 'e.g. Bank account certificate'), onChange: (e) => this.setState({ label: e.target.value, error: '' }) })),
                React.createElement("fieldset", { className: "field" },
                    React.createElement("legend", { className: "field-label" }, L('Nature', 'Kind')),
                    React.createElement("div", { className: "segmented" }, ['document', 'condition', 'rule'].map((k) => (React.createElement("label", { key: k, className: cx('seg-opt', this.state.kind === k && 'seg-on') },
                        React.createElement("input", { type: "radio", name: "kind", value: k, checked: this.state.kind === k, onChange: () => this.setState({ kind: k }) }),
                        KIND[k]))))),
                this.state.kind === 'document' ? (React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" },
                        L('Type de pièce', 'Document type'),
                        " ",
                        React.createElement("span", { className: "optional" }, L('pour le rattachement automatique', 'for automatic linking'))),
                    React.createElement("select", { value: this.state.proof, onChange: (e) => this.setState({ proof: e.target.value }) },
                        React.createElement("option", { value: "" }, L('Non précisé', 'Not specified')),
                        types.map((t) => (React.createElement("option", { key: t.code, value: t.code }, t.label)))))) : null,
                React.createElement("label", { className: "check" },
                    React.createElement("input", { type: "checkbox", checked: this.state.critical, onChange: (e) => this.setState({ critical: e.target.checked }) }),
                    L('Critique (le dossier est irrecevable sans elle)', 'Critical (the application is rejected without it)')),
                React.createElement("label", { className: "check" },
                    React.createElement("input", { type: "checkbox", checked: !this.state.required, onChange: (e) => this.setState({ required: !e.target.checked }) }),
                    L('Facultative', 'Optional')),
                this.state.error ? (React.createElement("p", { className: "field-error", role: "alert" }, this.state.error)) : null)));
    }
}
