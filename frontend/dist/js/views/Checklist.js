import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS, STATUS_ORDER } from '../lib/format.js';
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
                    React.createElement("span", { className: "sr-only" }, "Rechercher une exigence"),
                    React.createElement(Icon, { name: "search", size: 16 }),
                    React.createElement("input", { type: "search", placeholder: "Rechercher\u2026", value: this.state.q, onChange: (e) => this.setState({ q: e.target.value }) })),
                React.createElement("label", { className: "field field-inline" },
                    React.createElement("span", { className: "field-label-inline" }, "Statut"),
                    React.createElement("select", { value: this.state.status, onChange: (e) => this.setState({ status: e.target.value }) },
                        React.createElement("option", { value: "" },
                            "Tous (",
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
                        React.createElement("option", { value: "" }, "Tous"),
                        React.createElement("option", { value: "document" }, "Pi\u00E8ces"),
                        React.createElement("option", { value: "condition" }, "Conditions"),
                        React.createElement("option", { value: "rule" }, "R\u00E8gles"))),
                filtered ? (React.createElement("button", { type: "button", className: "btn btn-quiet btn-sm", onClick: () => this.setState({ status: '', kind: '', q: '' }) }, "Effacer les filtres")) : null,
                React.createElement("span", { className: "toolbar-spacer" }),
                React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => this.setState({ adding: true }) },
                    React.createElement(Icon, { name: "plus" }),
                    " Ajouter une exigence")),
            !state.requirements.length ? (React.createElement("div", { className: "empty" },
                React.createElement("p", null, "La checklist est vide."),
                React.createElement("p", { className: "muted" },
                    "Importez le r\u00E8glement dans l\u2019onglet ",
                    React.createElement("a", { href: `#/d/${state.dossier.id}/appel` }, "Appel"),
                    ", ou ajoutez les exigences \u00E0 la main."))) : null,
            state.requirements.length && !rows.length ? React.createElement("p", { className: "empty muted" }, "Aucune exigence ne correspond \u00E0 ces filtres.") : null,
            groups.map((g) => {
                const list = rows.filter((r) => r.kind === g);
                if (!list.length)
                    return null;
                return (React.createElement("section", { key: g, className: "req-group", "aria-label": KIND[g] },
                    React.createElement("h2", { className: "group-title" },
                        g === 'document' ? 'Pièces à fournir' : g === 'condition' ? 'Conditions d’éligibilité' : 'Règles à respecter',
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
                                        r.critical ? React.createElement("span", { className: "flag flag-critical" }, "critique") : null,
                                        !r.required ? React.createElement("span", { className: "flag" }, "facultatif") : null,
                                        r.min_count > 1 ? React.createElement("span", { className: "flag" },
                                            r.min_count,
                                            " pi\u00E8ces") : null,
                                        chips.map((c) => (React.createElement("span", { key: c, className: "flag" }, c))),
                                        res.links.length ? (React.createElement("span", { className: "req-docs truncate" }, res.links.map((l) => docs[l.document_id]).join(', '))) : (React.createElement("span", { className: "req-expl" }, res.explanation)))),
                                React.createElement("span", { className: "req-src" }, r.origin === 'manual' ? 'ajoutée' : r.source_page ? `p. ${r.source_page}` : ''))));
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
                this.setState({ error: 'Décrivez l’exigence en quelques mots (3 caractères minimum).' });
                return;
            }
            this.setState({ busy: true });
            const ok = await this.props.ctx.run(() => api.addRequirement(this.props.ctx.state.dossier.id, {
                label: this.state.label.trim(),
                kind: this.state.kind,
                proof_type: this.state.kind === 'document' && this.state.proof ? this.state.proof : null,
                critical: this.state.critical,
                required: this.state.required,
            }), 'Exigence ajoutée à la checklist.');
            if (ok)
                this.props.onClose();
            else
                this.setState({ busy: false });
        };
    }
    render() {
        const types = this.props.ctx.state.proof_types.filter((t) => t.code !== 'other');
        return (React.createElement(Modal, { title: "Ajouter une exigence", onClose: this.props.onClose, busy: this.state.busy, footer: [
                React.createElement("button", { key: "c", type: "button", className: "btn btn-quiet", onClick: this.props.onClose, disabled: this.state.busy }, "Annuler"),
                React.createElement("button", { key: "s", type: "submit", form: "add-req", className: "btn btn-primary", disabled: this.state.busy }, this.state.busy ? 'Ajout…' : 'Ajouter'),
            ] },
            React.createElement("form", { id: "add-req", className: "form", onSubmit: this.submit, noValidate: true },
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" }, "Exigence"),
                    React.createElement("textarea", { rows: 3, maxLength: 300, "data-autofocus": true, value: this.state.label, placeholder: "Ex. Attestation de domiciliation bancaire", onChange: (e) => this.setState({ label: e.target.value, error: '' }) })),
                React.createElement("fieldset", { className: "field" },
                    React.createElement("legend", { className: "field-label" }, "Nature"),
                    React.createElement("div", { className: "segmented" }, ['document', 'condition', 'rule'].map((k) => (React.createElement("label", { key: k, className: cx('seg-opt', this.state.kind === k && 'seg-on') },
                        React.createElement("input", { type: "radio", name: "kind", value: k, checked: this.state.kind === k, onChange: () => this.setState({ kind: k }) }),
                        KIND[k]))))),
                this.state.kind === 'document' ? (React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" },
                        "Type de pi\u00E8ce ",
                        React.createElement("span", { className: "optional" }, "pour le rattachement automatique")),
                    React.createElement("select", { value: this.state.proof, onChange: (e) => this.setState({ proof: e.target.value }) },
                        React.createElement("option", { value: "" }, "Non pr\u00E9cis\u00E9"),
                        types.map((t) => (React.createElement("option", { key: t.code, value: t.code }, t.label)))))) : null,
                React.createElement("label", { className: "check" },
                    React.createElement("input", { type: "checkbox", checked: this.state.critical, onChange: (e) => this.setState({ critical: e.target.checked }) }),
                    "Critique (le dossier est irrecevable sans elle)"),
                React.createElement("label", { className: "check" },
                    React.createElement("input", { type: "checkbox", checked: !this.state.required, onChange: (e) => this.setState({ required: !e.target.checked }) }),
                    "Facultative"),
                this.state.error ? (React.createElement("p", { className: "field-error", role: "alert" }, this.state.error)) : null)));
    }
}
