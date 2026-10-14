import { Component, cx } from '../lib/react.js';
import { Icon, Spinner, StatusBar, ConfirmDialog, Modal } from '../components/ui.js';
import { dateShort, daysLabel, parseIso } from '../lib/format.js';
import type { DossierSummary } from '../lib/types.js';

interface Props {
  dossiers: DossierSummary[] | null;
  loading: boolean;
  error: string | null;
  busy: string | null;
  onRetry: () => void;
  onCreate: (title: string, program: string, deadline: string | null) => Promise<boolean>;
  onDemo: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
}

interface State {
  creating: boolean;
  deleting: DossierSummary | null;
  deleteBusy: boolean;
}

export class Home extends Component<Props, State> {
  state: State = { creating: false, deleting: null, deleteBusy: false };

  render() {
    const { dossiers, loading, error, busy } = this.props;
    return (
      <main className="home" id="main">
        <section className="home-intro">
          <h1 className="display">Votre dossier de candidature, vérifié pièce par pièce.</h1>
          <p className="lede">
            Importez le règlement d’un appel à projets : ClairForm en tire la liste des pièces et des conditions, la compare à vos documents et
            signale ce qui manque, ce qui est périmé ou ce qui contredit le règlement. Tout est analysé sur cet ordinateur.
          </p>
          <div className="intro-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => this.setState({ creating: true })}>
              <Icon name="plus" /> Nouveau dossier
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={this.props.onDemo} disabled={busy === 'demo'}>
              {busy === 'demo' ? <Spinner label="Préparation du dossier…" /> : 'Découvrir avec un dossier prérempli'}
            </button>
          </div>
          <p className="fine">Le dossier prérempli contient un appel à projets et huit pièces, analysés en direct par le même moteur que vos documents.</p>
        </section>

        <section className="home-list" aria-labelledby="mine">
          <div className="section-head">
            <h2 id="mine" className="section-title">
              Mes dossiers
            </h2>
          </div>
          {loading && !dossiers ? <Spinner label="Chargement des dossiers…" /> : null}
          {error ? (
            <div className="inline-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
              <button type="button" className="btn btn-quiet" onClick={this.props.onRetry}>
                Réessayer
              </button>
            </div>
          ) : null}
          {dossiers && !dossiers.length ? (
            <div className="empty">
              <p>Aucun dossier pour l’instant.</p>
              <p className="muted">Créez-en un pour l’appel auquel vous répondez, ou ouvrez le dossier prérempli pour découvrir le résultat.</p>
            </div>
          ) : null}
          {dossiers && dossiers.length ? (
            <ul className="dossier-list">
              {dossiers.map((d) => {
                const days = d.deadline ? Math.round(((parseIso(d.deadline) as Date).getTime() - startOfToday()) / 86400000) : null;
                return (
                  <li key={d.id} className="dossier-row">
                    <button type="button" className="dossier-open" onClick={() => this.props.onOpen(d.id)}>
                      <span className="dossier-name">{d.title}</span>
                      <span className="dossier-meta">
                        {d.program ? <span>{d.program}</span> : null}
                        <span>
                          {d.deadline ? `Date limite ${dateShort(d.deadline)} (${daysLabel(days)})` : 'Date limite non renseignée'}
                        </span>
                        <span>{d.document_count} document{d.document_count > 1 ? 's' : ''}</span>
                      </span>
                      <span className="dossier-progress">
                        <StatusBar counts={d.counts} total={0} />
                        <span className={cx('readiness-tag', `rt-${d.readiness.code}`)}>
                          {d.readiness.code === 'empty' ? 'À commencer' : `${d.score} % · ${d.readiness.label}`}
                        </span>
                      </span>
                    </button>
                    <button type="button" className="icon-btn danger-hover" aria-label={`Supprimer le dossier ${d.title}`} onClick={() => this.setState({ deleting: d })}>
                      <Icon name="trash" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="how" aria-labelledby="how">
          <h2 id="how" className="section-title">
            Trois étapes
          </h2>
          <ol className="steps">
            <li>
              <strong>Importer l’appel.</strong> Le règlement (PDF, Word ou texte) devient une checklist : chaque pièce, condition et règle garde sa
              page et sa phrase d’origine.
            </li>
            <li>
              <strong>Ajouter vos pièces.</strong> Chaque document est reconnu (CNI, statuts, budget, CV…) puis rattaché à l’exigence qu’il
              couvre. Vous confirmez ou corrigez.
            </li>
            <li>
              <strong>Corriger et exporter.</strong> Totaux du budget, plafond, dates de validité, nombre de pages : les écarts sont signalés avec
              leur source. Vous exportez un rapport et un paquet de pièces renommées.
            </li>
          </ol>
        </section>

        {this.state.creating ? (
          <NewDossierModal
            onClose={() => this.setState({ creating: false })}
            onSubmit={async (t, p, d) => {
              const ok = await this.props.onCreate(t, p, d);
              if (ok) this.setState({ creating: false });
              return ok;
            }}
          />
        ) : null}
        {this.state.deleting ? (
          <ConfirmDialog
            title="Supprimer ce dossier ?"
            danger
            busy={this.state.deleteBusy}
            confirmLabel="Supprimer définitivement"
            message={`« ${this.state.deleting.title} » et ses ${this.state.deleting.document_count} document(s) seront effacés de cet ordinateur. Cette action est irréversible.`}
            onCancel={() => this.setState({ deleting: null })}
            onConfirm={async () => {
              this.setState({ deleteBusy: true });
              const ok = await this.props.onDelete((this.state.deleting as DossierSummary).id);
              this.setState({ deleteBusy: false, deleting: ok ? null : this.state.deleting });
            }}
          />
        ) : null}
      </main>
    );
  }
}

function startOfToday(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

interface NewProps {
  onClose: () => void;
  onSubmit: (title: string, program: string, deadline: string | null) => Promise<boolean>;
  initial?: { title: string; program: string; deadline: string | null };
  heading?: string;
  submitLabel?: string;
}

export class NewDossierModal extends Component<NewProps, { title: string; program: string; deadline: string; busy: boolean; error: string }> {
  constructor(props: NewProps) {
    super(props);
    this.state = {
      title: props.initial ? props.initial.title : '',
      program: props.initial ? props.initial.program : '',
      deadline: props.initial && props.initial.deadline ? props.initial.deadline : '',
      busy: false,
      error: '',
    };
  }

  submit = async (e: any) => {
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
    if (!ok) this.setState({ busy: false });
  };

  render() {
    const formId = 'dossier-form';
    return (
      <Modal
        title={this.props.heading || 'Nouveau dossier'}
        onClose={this.props.onClose}
        busy={this.state.busy}
        footer={[
          <button key="c" type="button" className="btn btn-quiet" onClick={this.props.onClose} disabled={this.state.busy}>
            Annuler
          </button>,
          <button key="s" type="submit" form={formId} className="btn btn-primary" disabled={this.state.busy}>
            {this.state.busy ? 'Enregistrement…' : this.props.submitLabel || 'Créer le dossier'}
          </button>,
        ]}
      >
        <form id={formId} className="form" onSubmit={this.submit} noValidate>
          <label className="field">
            <span className="field-label">Nom du dossier</span>
            <input
              type="text"
              value={this.state.title}
              maxLength={160}
              required
              data-autofocus
              aria-invalid={this.state.error && !this.state.title.trim() ? 'true' : undefined}
              placeholder="Ex. Kits solaires — Fonds Tremplin 2027"
              onChange={(e: any) => this.setState({ title: e.target.value, error: '' })}
            />
          </label>
          <label className="field">
            <span className="field-label">
              Programme ou financeur <span className="optional">facultatif</span>
            </span>
            <input type="text" value={this.state.program} maxLength={200} onChange={(e: any) => this.setState({ program: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">
              Date limite de dépôt <span className="optional">facultatif — sinon lue dans l’appel</span>
            </span>
            <input type="date" value={this.state.deadline} onChange={(e: any) => this.setState({ deadline: e.target.value, error: '' })} />
          </label>
          {this.state.error ? (
            <p className="field-error" role="alert">
              {this.state.error}
            </p>
          ) : null}
        </form>
      </Modal>
    );
  }
}
