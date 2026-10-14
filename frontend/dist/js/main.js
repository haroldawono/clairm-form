import { Component } from './lib/react.js';
import { api } from './lib/api.js';
import { Home } from './views/Home.js';
import { Dossier, TABS } from './views/Dossier.js';
import { Icon, Spinner, Toasts } from './components/ui.js';
function parseRoute(hash) {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'd' && parts[1]) {
        const tab = (TABS.some((t) => t.id === parts[2]) ? parts[2] : 'synthese');
        return { name: 'dossier', id: parts[1], tab, rid: parts[3] || null };
    }
    return { name: 'home' };
}
let toastSeq = 0;
class App extends Component {
    constructor() {
        super(...arguments);
        this.state = {
            route: parseRoute(location.hash),
            dossiers: null,
            listLoading: false,
            listError: null,
            current: null,
            currentError: null,
            toasts: [],
            busy: null,
            server: null,
        };
        this.onHash = () => {
            const route = parseRoute(location.hash);
            const prev = this.state.route;
            this.setState({ route });
            const sameDossier = prev.name === 'dossier' && route.name === 'dossier' && prev.id === route.id;
            if (!sameDossier) {
                this.sync(route);
                window.scrollTo(0, 0);
            }
            else if (prev.name === 'dossier' && route.name === 'dossier' && prev.tab !== route.tab) {
                window.scrollTo(0, 0);
            }
            const title = route.name === 'dossier' && this.state.current ? `${this.state.current.dossier.title} — ClairForm` : 'ClairForm';
            document.title = title;
        };
        this.loadList = () => {
            this.setState({ listLoading: true, listError: null });
            api
                .list()
                .then((dossiers) => this.setState({ dossiers, listLoading: false }))
                .catch((err) => this.setState({ listLoading: false, listError: err.message }));
        };
        this.loadDossier = (id) => {
            this.setState({ current: null, currentError: null });
            api
                .get(id)
                .then((s) => {
                this.setState({ current: s });
                document.title = `${s.dossier.title} — ClairForm`;
            })
                .catch((err) => this.setState({ currentError: { message: err.message, code: err.code } }));
        };
        this.notify = (kind, text) => {
            const id = ++toastSeq;
            this.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
            if (kind !== 'error')
                window.setTimeout(() => this.dismiss(id), 4500);
        };
        this.dismiss = (id) => this.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        this.navigate = (hash) => {
            if (location.hash === hash)
                this.onHash();
            else
                location.hash = hash;
        };
        this.create = async (title, program, deadline) => {
            try {
                const s = await api.create(title, program, deadline);
                this.setState({ current: s });
                this.navigate(`#/d/${s.dossier.id}/synthese`);
                this.notify('success', 'Dossier créé. Importez maintenant le règlement de l’appel.');
                return true;
            }
            catch (err) {
                this.notify('error', err.message);
                return false;
            }
        };
        this.demo = async () => {
            this.setState({ busy: 'demo' });
            try {
                const s = await api.demo();
                this.setState({ current: s, busy: null });
                this.navigate(`#/d/${s.dossier.id}/synthese`);
                this.notify('info', 'Dossier prérempli créé : l’appel et les pièces viennent d’être analysés.');
            }
            catch (err) {
                this.setState({ busy: null });
                this.notify('error', err.message);
            }
        };
        this.remove = async (id) => {
            try {
                await api.remove(id);
                this.notify('success', 'Dossier supprimé.');
                this.loadList();
                return true;
            }
            catch (err) {
                this.notify('error', err.message);
                return false;
            }
        };
    }
    componentDidMount() {
        window.addEventListener('hashchange', this.onHash);
        api.health().then((h) => this.setState({ server: { mode: h.mode, problems: h.problems || [], retention_days: h.retention_days } })).catch(() => undefined);
        this.sync(this.state.route);
    }
    sync(route) {
        if (route.name === 'home') {
            this.loadList();
        }
        else if (!this.state.current || this.state.current.dossier.id !== route.id) {
            this.loadDossier(route.id);
        }
    }
    render() {
        const { route, current } = this.state;
        let body;
        if (route.name === 'home') {
            body = (React.createElement(Home, { dossiers: this.state.dossiers, loading: this.state.listLoading, error: this.state.listError, busy: this.state.busy, onRetry: this.loadList, onCreate: this.create, onDemo: this.demo, onOpen: (id) => this.navigate(`#/d/${id}/synthese`), onDelete: this.remove }));
        }
        else if (this.state.currentError) {
            const notFound = this.state.currentError.code === 'NOT-FOUND';
            body = (React.createElement("main", { className: "center-state", id: "main" },
                React.createElement(Icon, { name: "alert", size: 28 }),
                React.createElement("h1", { className: "section-title" }, notFound ? 'Dossier introuvable' : 'Impossible d’ouvrir ce dossier'),
                React.createElement("p", null, notFound ? 'Il a peut-être été supprimé, ou le lien est incomplet.' : this.state.currentError.message),
                React.createElement("div", { className: "intro-actions" },
                    !notFound ? (React.createElement("button", { type: "button", className: "btn btn-primary", onClick: () => this.loadDossier(route.id) }, "R\u00E9essayer")) : null,
                    React.createElement("a", { className: "btn btn-secondary", href: "#/" }, "Revenir \u00E0 mes dossiers"))));
        }
        else if (!current || current.dossier.id !== route.id) {
            body = (React.createElement("main", { className: "center-state", id: "main" },
                React.createElement(Spinner, { label: "Ouverture du dossier\u2026" })));
        }
        else {
            body = (React.createElement(Dossier, { state: current, tab: route.tab, requirementId: route.rid, onState: (s) => this.setState({ current: s }), notify: this.notify, navigate: this.navigate, onDeleted: () => {
                    this.setState({ current: null });
                    this.navigate('#/');
                } }));
        }
        return (React.createElement("div", { className: "app" },
            React.createElement("a", { className: "skip", href: "#main", onClick: (e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) {
                    m.setAttribute('tabindex', '-1');
                    m.focus();
                } } }, "Aller au contenu"),
            React.createElement("header", { className: "topbar" },
                React.createElement("a", { className: "brand", href: "#/", "aria-label": "ClairForm \u2014 accueil" },
                    React.createElement("span", { className: "brand-mark", "aria-hidden": "true" },
                        React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" },
                            React.createElement("path", { d: "M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" }),
                            React.createElement("path", { d: "M9 13.5l2.2 2.2L15.5 11" }))),
                    React.createElement("span", { className: "brand-name" }, "ClairForm")),
                this.state.server && this.state.server.mode === 'public' ? (React.createElement("span", { className: "local-badge", title: `Vos dossiers ne sont visibles que depuis ce navigateur. Ils sont effacés après ${this.state.server.retention_days || 7} jours sans activité. Aucun service tiers n’analyse vos documents.` },
                    React.createElement(Icon, { name: "lock", size: 15 }),
                    " Espace priv\u00E9")) : (React.createElement("span", { className: "local-badge", title: "Les documents sont lus et analys\u00E9s sur cet ordinateur. Aucun appel r\u00E9seau sortant." },
                    React.createElement(Icon, { name: "lock", size: 15 }),
                    " Analyse 100 % locale"))),
            this.state.server && this.state.server.problems.length ? (React.createElement("div", { className: "server-alert", role: "alert" },
                React.createElement(Icon, { name: "alert" }),
                React.createElement("div", null,
                    React.createElement("strong", null, "La lecture des documents ne fonctionne pas sur ce serveur."),
                    React.createElement("p", null, this.state.server.problems.join(' · ')),
                    React.createElement("p", null, "Relancez \u00AB pip install -r requirements.txt \u00BB dans le dossier du projet, puis red\u00E9marrez ClairForm.")))) : null,
            body,
            React.createElement(Toasts, { items: this.state.toasts, onDismiss: this.dismiss })));
    }
}
ReactDOM.render(React.createElement(App, null), document.getElementById('root'));
