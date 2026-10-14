import { Component, cx } from '../lib/react.js';
import { Icon, Spinner, StatusBar, ConfirmDialog, Modal } from '../components/ui.js';
import { dateShort, daysLabel, parseIso } from '../lib/format.js';
export class Home extends Component {
    constructor() {
        super(...arguments);
        this.state = { creating: false, deleting: null, deleteBusy: false };
    }
    render() {
        const { dossiers, loading, error, busy } = this.props;
        return (React.createElement("main", { className: "home", id: "main" },
            React.createElement("section", { className: "home-intro" },
                React.createElement("h1", { className: "display" }, "Votre dossier de candidature, v\u00E9rifi\u00E9 pi\u00E8ce par pi\u00E8ce."),
                React.createElement("p", { className: "lede" }, "Importez le r\u00E8glement d\u2019un appel \u00E0 projets : ClairForm en tire la liste des pi\u00E8ces et des conditions, la compare \u00E0 vos documents et signale ce qui manque, ce qui est p\u00E9rim\u00E9 ou ce qui contredit le r\u00E8glement. Tout est analys\u00E9 sur cet ordinateur."),
                React.createElement("div", { className: "intro-actions" },
                    React.createElement("button", { type: "button", className: "btn btn-primary btn-lg", onClick: () => this.setState({ creating: true }) },
                        React.createElement(Icon, { name: "plus" }),
                        " Nouveau dossier"),
                    React.createElement("button", { type: "button", className: "btn btn-secondary btn-lg", onClick: this.props.onDemo, disabled: busy === 'demo' }, busy === 'demo' ? React.createElement(Spinner, { label: "Pr\u00E9paration du dossier\u2026" }) : 'Découvrir avec un dossier prérempli')),
                React.createElement("p", { className: "fine" }, "Le dossier pr\u00E9rempli contient un appel \u00E0 projets et huit pi\u00E8ces, analys\u00E9s en direct par le m\u00EAme moteur que vos documents.")),
            React.createElement("section", { className: "home-list", "aria-labelledby": "mine" },
                React.createElement("div", { className: "section-head" },
                    React.createElement("h2", { id: "mine", className: "section-title" }, "Mes dossiers")),
                loading && !dossiers ? React.createElement(Spinner, { label: "Chargement des dossiers\u2026" }) : null,
                error ? (React.createElement("div", { className: "inline-error", role: "alert" },
                    React.createElement(Icon, { name: "alert" }),
                    React.createElement("span", null, error),
                    React.createElement("button", { type: "button", className: "btn btn-quiet", onClick: this.props.onRetry }, "R\u00E9essayer"))) : null,
                dossiers && !dossiers.length ? (React.createElement("div", { className: "empty" },
                    React.createElement("p", null, "Aucun dossier pour l\u2019instant."),
                    React.createElement("p", { className: "muted" }, "Cr\u00E9ez-en un pour l\u2019appel auquel vous r\u00E9pondez, ou ouvrez le dossier pr\u00E9rempli pour d\u00E9couvrir le r\u00E9sultat."))) : null,
                dossiers && dossiers.length ? (React.createElement("ul", { className: "dossier-list" }, dossiers.map((d) => {
                    const days = d.deadline ? Math.round((parseIso(d.deadline).getTime() - startOfToday()) / 86400000) : null;
                    return (React.createElement("li", { key: d.id, className: "dossier-row" },
                        React.createElement("button", { type: "button", className: "dossier-open", onClick: () => this.props.onOpen(d.id) },
                            React.createElement("span", { className: "dossier-name" }, d.title),
                            React.createElement("span", { className: "dossier-meta" },
                                d.program ? React.createElement("span", null, d.program) : null,
                                React.createElement("span", null, d.deadline ? `Date limite ${dateShort(d.deadline)} (${daysLabel(days)})` : 'Date limite non renseignée'),
                                React.createElement("span", null,
                                    d.document_count,
                                    " document",
                                    d.document_count > 1 ? 's' : '')),
                            React.createElement("span", { className: "dossier-progress" },
                                React.createElement(StatusBar, { counts: d.counts, total: 0 }),
                                React.createElement("span", { className: cx('readiness-tag', `rt-${d.readiness.code}`) }, d.readiness.code === 'empty' ? 'À commencer' : `${d.score} % · ${d.readiness.label}`))),
                        React.createElement("button", { type: "button", className: "icon-btn danger-hover", "aria-label": `Supprimer le dossier ${d.title}`, onClick: () => this.setState({ deleting: d }) },
                            React.createElement(Icon, { name: "trash" }))));
                }))) : null),
            React.createElement("section", { className: "how", "aria-labelledby": "how" },
                React.createElement("h2", { id: "how", className: "section-title" }, "Trois \u00E9tapes"),
                React.createElement("ol", { className: "steps" },
                    React.createElement("li", null,
                        React.createElement("strong", null, "Importer l\u2019appel."),
                        " Le r\u00E8glement (PDF, Word ou texte) devient une checklist : chaque pi\u00E8ce, condition et r\u00E8gle garde sa page et sa phrase d\u2019origine."),
                    React.createElement("li", null,
                        React.createElement("strong", null, "Ajouter vos pi\u00E8ces."),
                        " Chaque document est reconnu (CNI, statuts, budget, CV\u2026) puis rattach\u00E9 \u00E0 l\u2019exigence qu\u2019il couvre. Vous confirmez ou corrigez."),
                    React.createElement("li", null,
                        React.createElement("strong", null, "Corriger et exporter."),
                        " Totaux du budget, plafond, dates de validit\u00E9, nombre de pages : les \u00E9carts sont signal\u00E9s avec leur source. Vous exportez un rapport et un paquet de pi\u00E8ces renomm\u00E9es."))),
            this.state.creating ? (React.createElement(NewDossierModal, { onClose: () => this.setState({ creating: false }), onSubmit: async (t, p, d) => {
                    const ok = await this.props.onCreate(t, p, d);
                    if (ok)
                        this.setState({ creating: false });
                    return ok;
                } })) : null,
            this.state.deleting ? (React.createElement(ConfirmDialog, { title: "Supprimer ce dossier ?", danger: true, busy: this.state.deleteBusy, confirmLabel: "Supprimer d\u00E9finitivement", message: `« ${this.state.deleting.title} » et ses ${this.state.deleting.document_count} document(s) seront effacés de cet ordinateur. Cette action est irréversible.`, onCancel: () => this.setState({ deleting: null }), onConfirm: async () => {
                    this.setState({ deleteBusy: true });
                    const ok = await this.props.onDelete(this.state.deleting.id);
                    this.setState({ deleteBusy: false, deleting: ok ? null : this.state.deleting });
                } })) : null));
    }
}
function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}
export class NewDossierModal extends Component {
    constructor(props) {
        super(props);
        this.submit = async (e) => {
            e.preventDefault();
            const title = this.state.title.trim();
            if (!title) {
                this.setState({ error: 'Donnez un nom au dossier (le nom du projet et celui de l’appel, par exemple).' });
                return;
            }
            if (this.state.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(this.state.deadline)) {
                this.setState({ error: 'La date limite doit être une date valide.' });
                return;
            }
            this.setState({ busy: true, error: '' });
            const ok = await this.props.onSubmit(title, this.state.program.trim(), this.state.deadline || null);
            if (!ok)
                this.setState({ busy: false });
        };
        this.state = {
            title: props.initial ? props.initial.title : '',
            program: props.initial ? props.initial.program : '',
            deadline: props.initial && props.initial.deadline ? props.initial.deadline : '',
            busy: false,
            error: '',
        };
    }
    render() {
        const formId = 'dossier-form';
        return (React.createElement(Modal, { title: this.props.heading || 'Nouveau dossier', onClose: this.props.onClose, busy: this.state.busy, footer: [
                React.createElement("button", { key: "c", type: "button", className: "btn btn-quiet", onClick: this.props.onClose, disabled: this.state.busy }, "Annuler"),
                React.createElement("button", { key: "s", type: "submit", form: formId, className: "btn btn-primary", disabled: this.state.busy }, this.state.busy ? 'Enregistrement…' : this.props.submitLabel || 'Créer le dossier'),
            ] },
            React.createElement("form", { id: formId, className: "form", onSubmit: this.submit, noValidate: true },
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" }, "Nom du dossier"),
                    React.createElement("input", { type: "text", value: this.state.title, maxLength: 160, required: true, "data-autofocus": true, "aria-invalid": this.state.error && !this.state.title.trim() ? 'true' : undefined, placeholder: "Ex. Kits solaires \u2014 Fonds Tremplin 2027", onChange: (e) => this.setState({ title: e.target.value, error: '' }) })),
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" },
                        "Programme ou financeur ",
                        React.createElement("span", { className: "optional" }, "facultatif")),
                    React.createElement("input", { type: "text", value: this.state.program, maxLength: 200, onChange: (e) => this.setState({ program: e.target.value }) })),
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" },
                        "Date limite de d\u00E9p\u00F4t ",
                        React.createElement("span", { className: "optional" }, "facultatif \u2014 sinon lue dans l\u2019appel")),
                    React.createElement("input", { type: "date", value: this.state.deadline, onChange: (e) => this.setState({ deadline: e.target.value, error: '' }) })),
                this.state.error ? (React.createElement("p", { className: "field-error", role: "alert" }, this.state.error)) : null)));
    }
}
