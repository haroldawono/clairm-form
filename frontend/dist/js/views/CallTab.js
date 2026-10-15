import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { ACCEPT_CALL, size, STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import { Icon, Spinner } from '../components/ui.js';
import { Uploader } from '../components/Uploader.js';
import { segment } from '../components/highlight.js';
export class CallTab extends Component {
    constructor() {
        super(...arguments);
        this.state = { selected: null, pages: null, loading: false, error: null };
        this.cache = {};
    }
    componentDidMount() {
        this.ensureSelection();
    }
    componentDidUpdate() {
        this.ensureSelection();
    }
    calls() {
        return this.props.ctx.state.documents.filter((d) => d.role === 'call');
    }
    ensureSelection() {
        const calls = this.calls();
        if (this.state.selected && calls.some((c) => c.id === this.state.selected))
            return;
        if (calls.length)
            this.select(calls[calls.length - 1].id);
        else if (this.state.selected)
            this.setState({ selected: null, pages: null });
    }
    select(id) {
        if (this.cache[id]) {
            this.setState({ selected: id, pages: this.cache[id], error: null, loading: false });
            return;
        }
        this.setState({ selected: id, pages: null, loading: true, error: null });
        api
            .docText(this.props.ctx.state.dossier.id, id)
            .then((res) => {
            this.cache[id] = res.pages;
            if (this.state.selected === id)
                this.setState({ pages: res.pages, loading: false });
        })
            .catch((err) => this.setState({ loading: false, error: err.message }));
    }
    render() {
        const { ctx } = this.props;
        const calls = this.calls();
        const reqs = ctx.state.requirements.filter((r) => r.source_doc_id === this.state.selected);
        const results = ctx.state.assessment.requirements;
        return (React.createElement("div", { className: "call-tab" },
            React.createElement("div", { className: "call-side" },
                React.createElement(Uploader, { ctx: ctx, role: "call", accept: ACCEPT_CALL, multiple: true, compact: calls.length > 0, title: calls.length ? L('Ajouter un document d’appel', 'Add a call document') : L('Importer le règlement de l’appel', 'Import the call for proposals'), hint: L('PDF texte, Word (.docx) ou texte — 20 Mo max. Annexes et formulaires officiels acceptés (5 au plus).', 'Text PDF, Word (.docx) or text — 20 MB max. Annexes and official forms accepted (up to 5).') }),
                calls.length ? (React.createElement("ul", { className: "call-list", "aria-label": L('Documents de l’appel', 'Call documents') }, calls.map((c) => (React.createElement("li", { key: c.id, className: cx('call-item', c.id === this.state.selected && 'call-item-active') },
                    React.createElement("button", { type: "button", className: "call-pick", onClick: () => this.select(c.id), "aria-pressed": c.id === this.state.selected },
                        React.createElement(Icon, { name: "doc" }),
                        React.createElement("span", { className: "call-pick-text" },
                            React.createElement("span", { className: "truncate" }, c.name),
                            React.createElement("span", { className: "muted" },
                                c.page_count ? `${c.page_count} p. · ` : '',
                                size(c.size),
                                " \u00B7 ",
                                c.requirement_count || 0,
                                " ",
                                L('exigence(s)', 'requirement(s)')))),
                    React.createElement("button", { type: "button", className: "icon-btn danger-hover", "aria-label": L(`Retirer ${c.name}`, `Remove ${c.name}`), onClick: () => ctx.askDeleteDocument(c.id) },
                        React.createElement(Icon, { name: "trash" }))))))) : null,
                calls.length ? (React.createElement("p", { className: "fine" }, L('Les passages surlignés sont ceux que ClairForm a retenus comme exigences. Cliquez sur un passage pour le vérifier ou le corriger. Une phrase oubliée ? Ajoutez-la depuis la checklist.', 'Highlighted passages are the ones ClairForm kept as requirements. Click a passage to check or correct it. A sentence was missed? Add it from the checklist.'))) : null),
            React.createElement("div", { className: "reader", "aria-live": "polite" },
                !calls.length ? (React.createElement("div", { className: "reader-empty" },
                    React.createElement("p", null, L('Le texte de l’appel s’affichera ici, avec chaque exigence surlignée à l’endroit où elle a été lue.', 'The text of the call will appear here, with each requirement highlighted where it was read.')))) : null,
                this.state.loading ? React.createElement(Spinner, { label: L('Ouverture du texte…', 'Opening the text…') }) : null,
                this.state.error ? (React.createElement("div", { className: "inline-error", role: "alert" },
                    React.createElement(Icon, { name: "alert" }),
                    " ",
                    React.createElement("span", null, this.state.error),
                    React.createElement("button", { type: "button", className: "btn btn-quiet", onClick: () => this.state.selected && this.select(this.state.selected) }, L('Réessayer', 'Try again')))) : null,
                this.state.pages
                    ? this.state.pages.map((p) => {
                        const marks = reqs.filter((r) => r.source_page === p.n).reduce((acc, r) => acc.concat([r.excerpt].concat(r.statement.split('\n').slice(1)).map((x) => ({ id: r.id, excerpt: x }))), []);
                        return (React.createElement("article", { key: p.n, className: "page", "aria-label": `Page ${p.n}` },
                            React.createElement("div", { className: "page-num" },
                                "p. ",
                                p.n),
                            React.createElement("div", { className: "page-text" }, segment(p.text, marks).map((seg, i) => seg.ids ? (React.createElement("mark", { key: i, role: "button", tabIndex: 0, onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ctx.openRequirement(seg.ids[0])), className: cx('hl', (seg.ids || []).some((id) => results[id] && results[id].status === 'ignored') && 'hl-ignored'), onClick: () => ctx.openRequirement(seg.ids[0]), title: (seg.ids || []).map((id) => (results[id] ? STATUS[results[id].status].label : '')).join(' / ') }, seg.text)) : (React.createElement("span", { key: i }, seg.text))))));
                    })
                    : null)));
    }
}
