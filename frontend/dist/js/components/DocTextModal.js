import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { Icon, Modal, Spinner } from './ui.js';
import { segment } from './highlight.js';
export class DocTextModal extends Component {
    constructor() {
        super(...arguments);
        this.state = { pages: null, name: '', hasText: true, error: null };
        this.body = null;
    }
    componentDidMount() {
        this.load();
    }
    load() {
        this.setState({ error: null, pages: null });
        api
            .docText(this.props.dossierId, this.props.docId)
            .then((res) => {
            this.setState({ pages: res.pages, name: res.name, hasText: res.has_text }, () => {
                if (this.props.page && this.body) {
                    const el = this.body.querySelector(`[data-page="${this.props.page}"]`);
                    if (el)
                        el.scrollIntoView({ block: 'start' });
                }
            });
        })
            .catch((err) => this.setState({ error: err.message }));
    }
    render() {
        const doc = this.props.state.documents.find((d) => d.id === this.props.docId);
        const reqs = this.props.state.requirements.filter((r) => r.source_doc_id === this.props.docId);
        return (React.createElement(Modal, { variant: "wide", title: doc ? doc.name : this.state.name || 'Document', subtitle: doc ? (doc.role === 'call' ? 'Texte extrait de l’appel — les passages surlignés sont des exigences' : 'Texte extrait de la pièce') : null, onClose: this.props.onClose, footer: [
                doc ? (React.createElement("a", { key: "dl", className: "btn btn-secondary", href: api.fileUrl(this.props.dossierId, this.props.docId), download: true },
                    React.createElement(Icon, { name: "download" }),
                    " T\u00E9l\u00E9charger l\u2019original")) : null,
                React.createElement("span", { key: "sp", className: "toolbar-spacer" }),
                React.createElement("button", { key: "c", type: "button", className: "btn btn-primary", onClick: this.props.onClose }, "Termin\u00E9"),
            ] },
            React.createElement("div", { ref: (el) => (this.body = el), className: "doc-text" },
                this.state.error ? (React.createElement("div", { className: "inline-error", role: "alert" },
                    React.createElement(Icon, { name: "alert" }),
                    " ",
                    React.createElement("span", null, this.state.error),
                    React.createElement("button", { type: "button", className: "btn btn-quiet", onClick: () => this.load() }, "R\u00E9essayer"))) : null,
                !this.state.pages && !this.state.error ? React.createElement(Spinner, { label: "Chargement du texte\u2026" }) : null,
                this.state.pages && !this.state.hasText ? (React.createElement("p", { className: "muted" }, "Aucun texte lisible dans ce fichier (scan ou image). T\u00E9l\u00E9chargez l\u2019original pour le consulter ; son type peut \u00EAtre choisi dans l\u2019onglet Pi\u00E8ces.")) : null,
                this.state.pages && this.state.hasText
                    ? this.state.pages.map((p) => (React.createElement("article", { key: p.n, "data-page": p.n, className: cx('page', this.props.page === p.n && 'page-target') },
                        React.createElement("div", { className: "page-num" },
                            "p. ",
                            p.n),
                        React.createElement("div", { className: "page-text" }, segment(p.text, reqs.filter((r) => r.source_page === p.n).reduce((acc, r) => acc.concat([r.excerpt].concat(r.statement.split('\n').slice(1)).map((x) => ({ id: r.id, excerpt: x }))), [])).map((seg, i) => seg.ids ? (React.createElement("mark", { key: i, role: "button", tabIndex: 0, className: "hl", onClick: () => this.props.onOpenRequirement(seg.ids[0]), onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), this.props.onOpenRequirement(seg.ids[0])) }, seg.text)) : (React.createElement("span", { key: i }, seg.text)))))))
                    : null)));
    }
}
