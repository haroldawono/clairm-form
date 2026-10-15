import { Component, cx } from '../lib/react.js';
import { api, upload, ApiError, UploadHandle } from '../lib/api.js';
import { dateLong, daysLabel, plural } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import { Icon, StatusBar, ConfirmDialog } from '../components/ui.js';
import { RequirementDrawer } from '../components/RequirementDrawer.js';
import { DocTextModal } from '../components/DocTextModal.js';
import { NewDossierModal } from './Home.js';
import { Overview } from './Overview.js';
import { CallTab } from './CallTab.js';
import { Checklist } from './Checklist.js';
import { Pieces } from './Pieces.js';
import { ChecksTab } from './ChecksTab.js';
import { ExportTab } from './ExportTab.js';
import type { DossierState } from '../lib/types.js';

export type Tab = 'synthese' | 'appel' | 'checklist' | 'pieces' | 'controles' | 'export';
export const TABS: { id: Tab; label: string }[] = [
  { id: 'synthese', label: L('Synthèse', 'Overview') },
  { id: 'appel', label: L('Appel', 'Call') },
  { id: 'checklist', label: 'Checklist' },
  { id: 'pieces', label: L('Pièces', 'Documents') },
  { id: 'controles', label: L('Contrôles', 'Checks') },
  { id: 'export', label: L('Exporter', 'Export') },
];

export interface UploadItem {
  key: number;
  name: string;
  size: number;
  role: 'call' | 'piece';
  phase: 'sending' | 'reading' | 'done' | 'error' | 'cancelled';
  progress: number;
  message?: string;
  file?: File;
  handle?: UploadHandle;
}

export interface Ctx {
  state: DossierState;
  run: (op: () => Promise<DossierState>, success?: string) => Promise<boolean>;
  openRequirement: (rid: string) => void;
  openDocument: (docId: string, page?: number) => void;
  go: (tab: Tab, rid?: string) => void;
  uploads: UploadItem[];
  startUploads: (files: File[], role: 'call' | 'piece') => void;
  cancelUpload: (key: number) => void;
  retryUpload: (key: number) => void;
  clearUpload: (key: number) => void;
  askDeleteDocument: (docId: string) => void;
  notify: (kind: 'success' | 'error' | 'info', text: string) => void;
}

interface Props {
  state: DossierState;
  tab: Tab;
  requirementId: string | null;
  onState: (s: DossierState) => void;
  notify: (kind: 'success' | 'error' | 'info', text: string) => void;
  navigate: (hash: string) => void;
  onDeleted: () => void;
}

interface State {
  uploads: UploadItem[];
  docView: { id: string; page?: number } | null;
  editing: boolean;
  deleteDoc: string | null;
  deleteDossier: boolean;
  busy: boolean;
}

let uploadSeq = 0;

export class Dossier extends Component<Props, State> {
  state: State = { uploads: [], docView: null, editing: false, deleteDoc: null, deleteDossier: false, busy: false };
  private queue: Promise<void> = Promise.resolve();
  private alive = true;

  componentWillUnmount() {
    this.alive = false;
    this.state.uploads.forEach((u) => u.handle && u.phase === 'sending' && u.handle.abort());
  }

  run = async (op: () => Promise<DossierState>, success?: string): Promise<boolean> => {
    try {
      const s = await op();
      this.props.onState(s);
      if (success) this.props.notify('success', success);
      return true;
    } catch (err) {
      this.props.notify('error', err instanceof ApiError ? err.message : L('Une erreur inattendue est survenue.', 'An unexpected error occurred.'));
      return false;
    }
  };

  // ---------------------------------------------------------------- uploads (sequential, cancellable)
  patchUpload(key: number, patch: Partial<UploadItem>) {
    if (!this.alive) return;
    this.setState((s) => ({ uploads: s.uploads.map((u) => (u.key === key ? { ...u, ...patch } : u)) }));
  }

  startUploads = (files: File[], role: 'call' | 'piece') => {
    const items: UploadItem[] = files.map((f) => ({ key: ++uploadSeq, name: f.name, size: f.size, role, phase: 'sending', progress: 0, file: f }));
    this.setState((s) => ({ uploads: [...s.uploads.filter((u) => u.phase !== 'done'), ...items] }));
    items.forEach((item) => {
      this.queue = this.queue.then(() => this.sendOne(item.key));
    });
  };

  sendOne = async (key: number) => {
    const item = this.state.uploads.find((u) => u.key === key);
    if (!item || item.phase !== 'sending' || !item.file) return;
    const handle = upload(
      this.props.state.dossier.id,
      item.role,
      item.file,
      (p) => this.patchUpload(key, { progress: p }),
      () => this.patchUpload(key, { phase: 'reading', progress: 1 }),
    );
    this.patchUpload(key, { handle });
    try {
      const res = await handle.promise;
      if (!this.alive) return;
      this.props.onState(res.state);
      const d = res.document;
      const msg =
        d.role === 'call'
          ? L(`${d.requirement_count || 0} exigence(s) lue(s) dans l’appel.`, `${d.requirement_count || 0} requirement(s) read from the call.`)
          : d.proof_type && d.proof_type !== 'other' && !d.has_text
          ? L(`Classé d’après son nom : ${d.proof_type_label}. Aucun texte lisible : vérifiez ce type.`, `Classified from its name: ${d.proof_type_label}. No readable text: please check this type.`)
          : d.proof_type && d.proof_type !== 'other'
          ? L(`Reconnu comme : ${d.proof_type_label}.`, `Recognised as: ${d.proof_type_label}.`)
          : d.has_text
          ? L('Type non reconnu : choisissez-le dans la liste.', 'Type not recognised: choose it from the list.')
          : L('Pas de texte lisible (scan) : indiquez son type.', 'No readable text (scan): please set its type.');
      this.patchUpload(key, { phase: 'done', message: msg, file: undefined, handle: undefined });
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'ABORTED' || e.code === 'UPLOAD-CANCELLED') return; // cancelUpload() reports the outcome
      else this.patchUpload(key, { phase: 'error', message: e.message || L('Import impossible.', 'Import failed.'), handle: undefined });
    }
  };

  cancelUpload = async (key: number) => {
    const item = this.state.uploads.find((u) => u.key === key);
    if (!item) return;
    if (!item.handle) {
      if (item.phase === 'sending') this.patchUpload(key, { phase: 'cancelled', message: L('Import annulé : le fichier n’a pas été ajouté.', 'Import cancelled: the file was not added.') });
      return;
    }
    const handle = item.handle;
    handle.abort();
    // The server may already hold the bytes: ask it to discard this upload whatever its stage.
    try {
      const state = await api.cancelUpload(this.props.state.dossier.id, handle.uploadId);
      if (this.alive) this.props.onState(state);
      this.patchUpload(key, { phase: 'cancelled', message: L('Import annulé : le fichier n’a pas été ajouté.', 'Import cancelled: the file was not added.'), handle: undefined });
    } catch (err) {
      this.patchUpload(key, { phase: 'error', message: L(`Annulation non confirmée par le serveur : ${(err as Error).message}`, `Cancellation not confirmed by the server: ${(err as Error).message}`), handle: undefined });
    }
  };

  retryUpload = (key: number) => {
    this.patchUpload(key, { phase: 'sending', progress: 0, message: undefined });
    this.queue = this.queue.then(() => this.sendOne(key));
  };

  clearUpload = (key: number) => this.setState((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) }));

  // ---------------------------------------------------------------- navigation helpers
  go = (tab: Tab, rid?: string) => this.props.navigate(`#/d/${this.props.state.dossier.id}/${tab}${rid ? '/' + rid : ''}`);
  openRequirement = (rid: string) => this.go(this.props.tab, rid);
  closeRequirement = () => this.go(this.props.tab);

  render() {
    const { state, tab } = this.props;
    const d = state.dossier;
    const a = state.assessment;
    const ctx: Ctx = {
      state,
      run: this.run,
      openRequirement: this.openRequirement,
      openDocument: (id, page) => this.setState({ docView: { id, page } }),
      go: this.go,
      uploads: this.state.uploads,
      startUploads: this.startUploads,
      cancelUpload: this.cancelUpload,
      retryUpload: this.retryUpload,
      clearUpload: this.clearUpload,
      askDeleteDocument: (id) => this.setState({ deleteDoc: id }),
      notify: this.props.notify,
    };
    const calls = state.documents.filter((x) => x.role === 'call').length;
    const pieces = state.documents.filter((x) => x.role === 'piece').length;
    const active = state.requirements.filter((r) => r.status === 'active').length;
    const issues = a.checks.filter((c) => c.severity !== 'info').length;
    const counters: Record<Tab, string> = {
      synthese: '',
      appel: calls ? String(calls) : '',
      checklist: active ? String(active) : '',
      pieces: pieces ? String(pieces) : '',
      controles: issues ? String(issues) : '',
      export: '',
    };
    const selected = this.props.requirementId ? state.requirements.find((r) => r.id === this.props.requirementId) : null;
    const deleteDoc = this.state.deleteDoc ? state.documents.find((x) => x.id === this.state.deleteDoc) : null;
    const days = a.deadline.days_left;

    return (
      <main className="dossier" id="main">
        <header className="dossier-head">
          <div className="dh-title">
            <a className="back-link" href="#/">
              <Icon name="back" size={16} /> {L('Mes dossiers', 'My applications')}
            </a>
            <h1 className="dossier-title">{d.title}</h1>
            <div className="dh-meta">
              {d.is_demo ? <span className="tag tag-demo">{L('Démonstration', 'Sample')}</span> : null}
              {d.program ? <span>{d.program}</span> : null}
              <span className={cx('deadline', days !== null && days < 0 && 'deadline-late', days !== null && days >= 0 && days <= 7 && 'deadline-soon')}>
                {a.deadline.date
                  ? L(
                      `Date limite : ${dateLong(a.deadline.date)} — ${daysLabel(days)}${a.deadline.source === 'call' ? ' (lue dans l’appel)' : ''}`,
                      `Deadline: ${dateLong(a.deadline.date)} — ${daysLabel(days)}${a.deadline.source === 'call' ? ' (read from the call)' : ''}`,
                    )
                  : L('Date limite inconnue', 'Deadline unknown')}
              </span>
              <button type="button" className="link-btn" onClick={() => this.setState({ editing: true })}>
                <Icon name="edit" size={15} /> {L('Modifier', 'Edit')}
              </button>
            </div>
          </div>
          <div className={cx('dh-score', `score-${a.readiness.code}`)}>
            <div className="score-line">
              <span className="score-num">{a.readiness.code === 'empty' ? '—' : `${a.score}\u202f%`}</span>
              <span className="score-label">{a.readiness.label}</span>
            </div>
            <StatusBar counts={a.counts} total={a.required_total} />
            <p className="score-note">
              {a.readiness.code === 'empty'
                ? L('Importez l’appel pour obtenir la checklist.', 'Import the call to get the checklist.')
                : L(
                    `${plural(a.counts.covered, 'exigence couverte', 'exigences couvertes')} sur ${active} · ${plural(
                      a.checks.filter((c) => c.severity === 'error').length,
                      'point à corriger',
                      'points à corriger',
                    )}`,
                    `${a.counts.covered} of ${active} requirements covered · ${plural(
                      a.checks.filter((c) => c.severity === 'error').length,
                      'issue to fix',
                      'issues to fix',
                      'no issues to fix',
                    )}`,
                  )}
            </p>
          </div>
        </header>

        <nav className="tabs" aria-label={L('Sections du dossier', 'Application sections')}>
          {TABS.map((t) => (
            <a key={t.id} href={`#/d/${d.id}/${t.id}`} className={cx('tab', t.id === tab && 'tab-active')} aria-current={t.id === tab ? 'page' : undefined}>
              {t.label}
              {counters[t.id] ? <span className={cx('tab-count', t.id === 'controles' && issues > 0 && 'tab-count-alert')}>{counters[t.id]}</span> : null}
            </a>
          ))}
        </nav>

        <div className="tab-panel">
          {tab === 'synthese' ? <Overview ctx={ctx} /> : null}
          {tab === 'appel' ? <CallTab ctx={ctx} /> : null}
          {tab === 'checklist' ? <Checklist ctx={ctx} /> : null}
          {tab === 'pieces' ? <Pieces ctx={ctx} /> : null}
          {tab === 'controles' ? <ChecksTab ctx={ctx} /> : null}
          {tab === 'export' ? <ExportTab ctx={ctx} onDeleteDossier={() => this.setState({ deleteDossier: true })} /> : null}
        </div>

        {selected ? <RequirementDrawer ctx={ctx} requirement={selected} onClose={this.closeRequirement} /> : null}
        {this.props.requirementId && !selected ? <MissingRequirement onClose={this.closeRequirement} /> : null}
        {this.state.docView ? (
          <DocTextModal
            dossierId={d.id}
            docId={this.state.docView.id}
            page={this.state.docView.page}
            state={state}
            onOpenRequirement={(rid) => {
              this.setState({ docView: null });
              this.openRequirement(rid);
            }}
            onClose={() => this.setState({ docView: null })}
          />
        ) : null}
        {this.state.editing ? (
          <NewDossierModal
            heading={L('Modifier le dossier', 'Edit application')}
            submitLabel={L('Enregistrer', 'Save')}
            initial={{ title: d.title, program: d.program, deadline: d.deadline_source === 'user' ? d.deadline : null }}
            onClose={() => this.setState({ editing: false })}
            onSubmit={async (title, program, deadline) => {
              const ok = await this.run(() => api.patch(d.id, { title, program, deadline }), L('Dossier mis à jour.', 'Application updated.'));
              if (ok) this.setState({ editing: false });
              return ok;
            }}
          />
        ) : null}
        {deleteDoc ? (
          <ConfirmDialog
            title={deleteDoc.role === 'call' ? L('Retirer ce document d’appel ?', 'Remove this call document?') : L('Supprimer cette pièce ?', 'Delete this document?')}
            danger
            busy={this.state.busy}
            confirmLabel={L('Supprimer', 'Delete')}
            message={
              deleteDoc.role === 'call'
                ? L(
                    `« ${deleteDoc.name} » sera supprimé, ainsi que les ${deleteDoc.requirement_count || 0} exigence(s) qui en ont été extraites (vos décisions sur ces exigences seront perdues).`,
                    `“${deleteDoc.name}” will be deleted, together with the ${deleteDoc.requirement_count || 0} requirement(s) extracted from it (your decisions on them will be lost).`,
                  )
                : L(
                    `« ${deleteDoc.name} » sera supprimé du dossier. Les exigences qu’il couvrait redeviendront à traiter.`,
                    `“${deleteDoc.name}” will be removed from the application. The requirements it covered will need attention again.`,
                  )
            }
            onCancel={() => this.setState({ deleteDoc: null })}
            onConfirm={async () => {
              this.setState({ busy: true });
              const ok = await this.run(() => api.deleteDoc(d.id, deleteDoc.id), L('Document supprimé.', 'Document deleted.'));
              this.setState({ busy: false, deleteDoc: ok ? null : this.state.deleteDoc });
            }}
          />
        ) : null}
        {this.state.deleteDossier ? (
          <ConfirmDialog
            title={L('Supprimer tout le dossier ?', 'Delete the whole application?')}
            danger
            busy={this.state.busy}
            confirmLabel={L('Supprimer définitivement', 'Delete permanently')}
            message={L(
              `Le dossier « ${d.title} », ses ${state.documents.length} document(s) et votre travail de vérification seront effacés.`,
              `The application “${d.title}”, its ${state.documents.length} document(s) and your review work will be erased.`,
            )}
            onCancel={() => this.setState({ deleteDossier: false })}
            onConfirm={async () => {
              this.setState({ busy: true });
              try {
                await api.remove(d.id);
                this.props.notify('success', L('Dossier supprimé.', 'Application deleted.'));
                this.props.onDeleted();
              } catch (err) {
                this.props.notify('error', (err as Error).message);
                this.setState({ busy: false });
              }
            }}
          />
        ) : null}
      </main>
    );
  }
}

function MissingRequirement(props: { onClose: () => void }) {
  return (
    <ConfirmDialog
      title={L('Exigence introuvable', 'Requirement not found')}
      message={L('Cette exigence n’existe plus dans le dossier (son document d’appel a peut-être été retiré).', 'This requirement no longer exists in the application (its call document may have been removed).')}
      confirmLabel={L('Fermer', 'Close')}
      onConfirm={props.onClose}
      onCancel={props.onClose}
    />
  );
}
