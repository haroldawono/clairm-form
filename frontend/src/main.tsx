import { Component } from './lib/react.js';
import { api, ApiError } from './lib/api.js';
import { Home } from './views/Home.js';
import { Dossier, Tab, TABS } from './views/Dossier.js';
import { Icon, Spinner, Toast, Toasts } from './components/ui.js';
import type { DossierState, DossierSummary } from './lib/types.js';

type Route = { name: 'home' } | { name: 'dossier'; id: string; tab: Tab; rid: string | null };

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'd' && parts[1]) {
    const tab = (TABS.some((t) => t.id === parts[2]) ? parts[2] : 'synthese') as Tab;
    return { name: 'dossier', id: parts[1], tab, rid: parts[3] || null };
  }
  return { name: 'home' };
}

interface State {
  route: Route;
  dossiers: DossierSummary[] | null;
  listLoading: boolean;
  listError: string | null;
  current: DossierState | null;
  currentError: { message: string; code: string } | null;
  toasts: Toast[];
  busy: string | null;
  server: { mode: string; problems: string[]; retention_days: number | null } | null;
}

let toastSeq = 0;

class App extends Component<{}, State> {
  state: State = {
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

  componentDidMount() {
    window.addEventListener('hashchange', this.onHash);
    api.health().then((h) => this.setState({ server: { mode: h.mode, problems: h.problems || [], retention_days: h.retention_days } })).catch(() => undefined);
    this.sync(this.state.route);
  }

  onHash = () => {
    const route = parseRoute(location.hash);
    const prev = this.state.route;
    this.setState({ route });
    const sameDossier = prev.name === 'dossier' && route.name === 'dossier' && prev.id === route.id;
    if (!sameDossier) {
      this.sync(route);
      window.scrollTo(0, 0);
    } else if (prev.name === 'dossier' && route.name === 'dossier' && prev.tab !== route.tab) {
      window.scrollTo(0, 0);
    }
    const title = route.name === 'dossier' && this.state.current ? `${this.state.current.dossier.title} — ClairForm` : 'ClairForm';
    document.title = title;
  };

  sync(route: Route) {
    if (route.name === 'home') {
      this.loadList();
    } else if (!this.state.current || this.state.current.dossier.id !== route.id) {
      this.loadDossier(route.id);
    }
  }

  loadList = () => {
    this.setState({ listLoading: true, listError: null });
    api
      .list()
      .then((dossiers) => this.setState({ dossiers, listLoading: false }))
      .catch((err: ApiError) => this.setState({ listLoading: false, listError: err.message }));
  };

  loadDossier = (id: string) => {
    this.setState({ current: null, currentError: null });
    api
      .get(id)
      .then((s) => {
        this.setState({ current: s });
        document.title = `${s.dossier.title} — ClairForm`;
      })
      .catch((err: ApiError) => this.setState({ currentError: { message: err.message, code: err.code } }));
  };

  notify = (kind: Toast['kind'], text: string) => {
    const id = ++toastSeq;
    this.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    if (kind !== 'error') window.setTimeout(() => this.dismiss(id), 4500);
  };

  dismiss = (id: number) => this.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

  navigate = (hash: string) => {
    if (location.hash === hash) this.onHash();
    else location.hash = hash;
  };

  create = async (title: string, program: string, deadline: string | null) => {
    try {
      const s = await api.create(title, program, deadline);
      this.setState({ current: s });
      this.navigate(`#/d/${s.dossier.id}/synthese`);
      this.notify('success', 'Dossier créé. Importez maintenant le règlement de l’appel.');
      return true;
    } catch (err) {
      this.notify('error', (err as Error).message);
      return false;
    }
  };

  demo = async () => {
    this.setState({ busy: 'demo' });
    try {
      const s = await api.demo();
      this.setState({ current: s, busy: null });
      this.navigate(`#/d/${s.dossier.id}/synthese`);
      this.notify('info', 'Dossier prérempli créé : l’appel et les pièces viennent d’être analysés.');
    } catch (err) {
      this.setState({ busy: null });
      this.notify('error', (err as Error).message);
    }
  };

  remove = async (id: string) => {
    try {
      await api.remove(id);
      this.notify('success', 'Dossier supprimé.');
      this.loadList();
      return true;
    } catch (err) {
      this.notify('error', (err as Error).message);
      return false;
    }
  };

  render() {
    const { route, current } = this.state;
    let body: any;
    if (route.name === 'home') {
      body = (
        <Home
          dossiers={this.state.dossiers}
          loading={this.state.listLoading}
          error={this.state.listError}
          busy={this.state.busy}
          onRetry={this.loadList}
          onCreate={this.create}
          onDemo={this.demo}
          onOpen={(id) => this.navigate(`#/d/${id}/synthese`)}
          onDelete={this.remove}
        />
      );
    } else if (this.state.currentError) {
      const notFound = this.state.currentError.code === 'NOT-FOUND';
      body = (
        <main className="center-state" id="main">
          <Icon name="alert" size={28} />
          <h1 className="section-title">{notFound ? 'Dossier introuvable' : 'Impossible d’ouvrir ce dossier'}</h1>
          <p>{notFound ? 'Il a peut-être été supprimé, ou le lien est incomplet.' : this.state.currentError.message}</p>
          <div className="intro-actions">
            {!notFound ? (
              <button type="button" className="btn btn-primary" onClick={() => this.loadDossier(route.id)}>
                Réessayer
              </button>
            ) : null}
            <a className="btn btn-secondary" href="#/">
              Revenir à mes dossiers
            </a>
          </div>
        </main>
      );
    } else if (!current || current.dossier.id !== route.id) {
      body = (
        <main className="center-state" id="main">
          <Spinner label="Ouverture du dossier…" />
        </main>
      );
    } else {
      body = (
        <Dossier
          state={current}
          tab={route.tab}
          requirementId={route.rid}
          onState={(s) => this.setState({ current: s })}
          notify={this.notify}
          navigate={this.navigate}
          onDeleted={() => {
            this.setState({ current: null });
            this.navigate('#/');
          }}
        />
      );
    }
    return (
      <div className="app">
        <a className="skip" href="#main" onClick={(e: any) => { e.preventDefault(); const m = document.getElementById('main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } }}>
          Aller au contenu
        </a>
        <header className="topbar">
          <a className="brand" href="#/" aria-label="ClairForm — accueil">
            <span className="brand-mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                <path d="M9 13.5l2.2 2.2L15.5 11" />
              </svg>
            </span>
            <span className="brand-name">ClairForm</span>
          </a>
          {this.state.server && this.state.server.mode === 'public' ? (
            <span
              className="local-badge"
              title={`Vos dossiers ne sont visibles que depuis ce navigateur. Ils sont effacés après ${this.state.server.retention_days || 7} jours sans activité. Aucun service tiers n’analyse vos documents.`}
            >
              <Icon name="lock" size={15} /> Espace privé
            </span>
          ) : (
            <span className="local-badge" title="Les documents sont lus et analysés sur cet ordinateur. Aucun appel réseau sortant.">
              <Icon name="lock" size={15} /> Analyse 100 % locale
            </span>
          )}
        </header>
        {this.state.server && this.state.server.problems.length ? (
          <div className="server-alert" role="alert">
            <Icon name="alert" />
            <div>
              <strong>La lecture des documents ne fonctionne pas sur ce serveur.</strong>
              <p>{this.state.server.problems.join(' · ')}</p>
              <p>Relancez « pip install -r requirements.txt » dans le dossier du projet, puis redémarrez ClairForm.</p>
            </div>
          </div>
        ) : null}
        {body}
        <Toasts items={this.state.toasts} onDismiss={this.dismiss} />
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('root'));
