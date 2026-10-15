import { Component, cx } from '../lib/react.js';
import { Icon, Spinner, StatusBar, ConfirmDialog, Modal } from '../components/ui.js';
import { dateShort, daysLabel, parseIso } from '../lib/format.js';
import { L } from '../lib/i18n.js';
export class Home extends Component {
    constructor() {
        super(...arguments);
        this.state = { creating: false, deleting: null, deleteBusy: false };
    }
    render() {
        const { dossiers, loading, error, busy } = this.props;
        return (React.createElement("main", { className: "home", id: "main" },
            React.createElement("section", { className: "home-intro" },
                React.createElement("h1", { className: "display" }, L('Votre dossier de candidature, vérifié pièce par pièce.', 'Your grant application, checked document by document.')),
                React.createElement("p", { className: "lede" }, L('Importez le règlement d’un appel à projets : ClairForm en tire la liste des pièces et des conditions, la compare à vos documents et signale ce qui manque, ce qui est périmé ou ce qui contredit le règlement. Rien n’est confié à un service tiers.', 'Import the rules of a call for proposals: ClairForm turns them into a list of required documents and conditions, compares it with your files, and flags what is missing, out of date, or in conflict with the rules. Nothing is handed to a third-party service.')),
                React.createElement("div", { className: "intro-actions" },
                    React.createElement("button", { type: "button", className: "btn btn-primary btn-lg", onClick: () => this.setState({ creating: true }) },
                        React.createElement(Icon, { name: "plus" }),
                        " ",
                        L('Nouveau dossier', 'New application')),
                    React.createElement("button", { type: "button", className: "btn btn-secondary btn-lg", onClick: this.props.onDemo, disabled: busy === 'demo' }, busy === 'demo' ? React.createElement(Spinner, { label: L('Préparation du dossier…', 'Preparing the application…') }) : L('Découvrir avec un dossier prérempli', 'Try it with a sample application'))),
                React.createElement("p", { className: "fine" }, L('Le dossier prérempli contient un appel à projets et huit pièces, analysés en direct par le même moteur que vos documents.', 'The sample contains a call for proposals and eight documents (in French), analysed live by the same engine as your own files.'))),
            React.createElement("section", { className: "home-list", "aria-labelledby": "mine" },
                React.createElement("div", { className: "section-head" },
                    React.createElement("h2", { id: "mine", className: "section-title" }, L('Mes dossiers', 'My applications'))),
                loading && !dossiers ? React.createElement(Spinner, { label: L('Chargement des dossiers…', 'Loading applications…') }) : null,
                error ? (React.createElement("div", { className: "inline-error", role: "alert" },
                    React.createElement(Icon, { name: "alert" }),
                    React.createElement("span", null, error),
                    React.createElement("button", { type: "button", className: "btn btn-quiet", onClick: this.props.onRetry }, L('Réessayer', 'Try again')))) : null,
                dossiers && !dossiers.length ? (React.createElement("div", { className: "empty" },
                    React.createElement("p", null, L('Aucun dossier pour l’instant.', 'No applications yet.')),
                    React.createElement("p", { className: "muted" }, L('Créez-en un pour l’appel auquel vous répondez, ou ouvrez le dossier prérempli pour découvrir le résultat.', 'Create one for the call you are answering, or open the sample application to see the result.')))) : null,
                dossiers && dossiers.length ? (React.createElement("ul", { className: "dossier-list" }, dossiers.map((d) => {
                    const days = d.deadline ? Math.round((parseIso(d.deadline).getTime() - startOfToday()) / 86400000) : null;
                    return (React.createElement("li", { key: d.id, className: "dossier-row" },
                        React.createElement("button", { type: "button", className: "dossier-open", onClick: () => this.props.onOpen(d.id) },
                            React.createElement("span", { className: "dossier-name" }, d.title),
                            React.createElement("span", { className: "dossier-meta" },
                                d.program ? React.createElement("span", null, d.program) : null,
                                React.createElement("span", null, d.deadline ? L(`Date limite ${dateShort(d.deadline)} (${daysLabel(days)})`, `Deadline ${dateShort(d.deadline)} (${daysLabel(days)})`) : L('Date limite non renseignée', 'No deadline set')),
                                React.createElement("span", null,
                                    d.document_count,
                                    " document",
                                    d.document_count > 1 ? 's' : '')),
                            React.createElement("span", { className: "dossier-progress" },
                                React.createElement(StatusBar, { counts: d.counts, total: 0 }),
                                React.createElement("span", { className: cx('readiness-tag', `rt-${d.readiness.code}`) }, d.readiness.code === 'empty' ? L('À commencer', 'Not started') : `${d.score} % · ${d.readiness.label}`))),
                        React.createElement("button", { type: "button", className: "icon-btn danger-hover", "aria-label": L(`Supprimer le dossier ${d.title}`, `Delete application ${d.title}`), onClick: () => this.setState({ deleting: d }) },
                            React.createElement(Icon, { name: "trash" }))));
                }))) : null),
            React.createElement("section", { className: "how", "aria-labelledby": "how" },
                React.createElement("h2", { id: "how", className: "section-title" }, L('Trois étapes', 'Three steps')),
                React.createElement("ol", { className: "steps" },
                    React.createElement("li", null,
                        React.createElement("strong", null, L('Importer l’appel.', 'Import the call.')),
                        ' ',
                        L('Le règlement (PDF, Word ou texte) devient une checklist : chaque pièce, condition et règle garde sa page et sa phrase d’origine.', 'The rules (PDF, Word or text) become a checklist: every document, condition and rule keeps its page and original sentence.')),
                    React.createElement("li", null,
                        React.createElement("strong", null, L('Ajouter vos pièces.', 'Add your documents.')),
                        ' ',
                        L('Chaque document est reconnu (CNI, statuts, budget, CV…) puis rattaché à l’exigence qu’il couvre. Vous confirmez ou corrigez.', 'Each file is recognised (ID card, statutes, budget, CV…) and linked to the requirement it covers. You confirm or correct.')),
                    React.createElement("li", null,
                        React.createElement("strong", null, L('Corriger et exporter.', 'Fix and export.')),
                        ' ',
                        L('Totaux du budget, plafond, dates de validité, nombre de pages : les écarts sont signalés avec leur source. Vous exportez un rapport et un paquet de pièces renommées.', 'Budget totals, caps, validity dates, page counts: every gap is flagged with its source. You export a report and a package of renamed documents.')))),
            this.state.creating ? (React.createElement(NewDossierModal, { onClose: () => this.setState({ creating: false }), onSubmit: async (t, p, d) => {
                    const ok = await this.props.onCreate(t, p, d);
                    if (ok)
                        this.setState({ creating: false });
                    return ok;
                } })) : null,
            this.state.deleting ? (React.createElement(ConfirmDialog, { title: L('Supprimer ce dossier ?', 'Delete this application?'), danger: true, busy: this.state.deleteBusy, confirmLabel: L('Supprimer définitivement', 'Delete permanently'), message: L(`« ${this.state.deleting.title} » et ses ${this.state.deleting.document_count} document(s) seront effacés. Cette action est irréversible.`, `“${this.state.deleting.title}” and its ${this.state.deleting.document_count} document(s) will be erased. This cannot be undone.`), onCancel: () => this.setState({ deleting: null }), onConfirm: async () => {
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
                this.setState({ error: L('Donnez un nom au dossier (le nom du projet et celui de l’appel, par exemple).', 'Give the application a name (for instance the project and the call).') });
                return;
            }
            if (this.state.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(this.state.deadline)) {
                this.setState({ error: L('La date limite doit être une date valide.', 'The deadline must be a valid date.') });
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
        return (React.createElement(Modal, { title: this.props.heading || L('Nouveau dossier', 'New application'), onClose: this.props.onClose, busy: this.state.busy, footer: [
                React.createElement("button", { key: "c", type: "button", className: "btn btn-quiet", onClick: this.props.onClose, disabled: this.state.busy }, L('Annuler', 'Cancel')),
                React.createElement("button", { key: "s", type: "submit", form: formId, className: "btn btn-primary", disabled: this.state.busy }, this.state.busy ? L('Enregistrement…', 'Saving…') : this.props.submitLabel || L('Créer le dossier', 'Create application')),
            ] },
            React.createElement("form", { id: formId, className: "form", onSubmit: this.submit, noValidate: true },
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" }, L('Nom du dossier', 'Application name')),
                    React.createElement("input", { type: "text", value: this.state.title, maxLength: 160, required: true, "data-autofocus": true, "aria-invalid": this.state.error && !this.state.title.trim() ? 'true' : undefined, placeholder: L('Ex. Kits solaires — Fonds Tremplin 2027', 'e.g. Solar kits — Tremplin Fund 2027'), onChange: (e) => this.setState({ title: e.target.value, error: '' }) })),
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" },
                        L('Programme ou financeur', 'Programme or funder'),
                        " ",
                        React.createElement("span", { className: "optional" }, L('facultatif', 'optional'))),
                    React.createElement("input", { type: "text", value: this.state.program, maxLength: 200, onChange: (e) => this.setState({ program: e.target.value }) })),
                React.createElement("label", { className: "field" },
                    React.createElement("span", { className: "field-label" },
                        L('Date limite de dépôt', 'Submission deadline'),
                        " ",
                        React.createElement("span", { className: "optional" }, L('facultatif — sinon lue dans l’appel', 'optional — otherwise read from the call'))),
                    React.createElement("input", { type: "date", value: this.state.deadline, onChange: (e) => this.setState({ deadline: e.target.value, error: '' }) })),
                this.state.error ? (React.createElement("p", { className: "field-error", role: "alert" }, this.state.error)) : null)));
    }
}
