import { Component, cx } from '../lib/react.js';
import { Icon, Spinner } from './ui.js';
import { size } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import type { Ctx, UploadItem } from '../views/Dossier.js';

interface Props {
  ctx: Ctx;
  role: 'call' | 'piece';
  accept: string;
  title: string;
  hint: string;
  multiple: boolean;
  compact?: boolean;
}

export class Uploader extends Component<Props, { over: boolean }> {
  state = { over: false };
  private input: HTMLInputElement | null = null;

  take(list: FileList | null) {
    if (!list || !list.length) return;
    const files = Array.from(list);
    this.props.ctx.startUploads(this.props.multiple ? files : files.slice(0, 1), this.props.role);
    if (this.input) this.input.value = ''; // allows re-selecting the same file after a failure
  }

  render() {
    const items = this.props.ctx.uploads.filter((u) => u.role === this.props.role);
    return (
      <div className="uploader">
        <div
          className={cx('dropzone', this.state.over && 'dropzone-over', this.props.compact && 'dropzone-compact')}
          onDragOver={(e: any) => {
            e.preventDefault();
            if (!this.state.over) this.setState({ over: true });
          }}
          onDragLeave={() => this.setState({ over: false })}
          onDrop={(e: any) => {
            e.preventDefault();
            this.setState({ over: false });
            this.take(e.dataTransfer && e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={22} />
          <div className="dz-text">
            <strong>{this.props.title}</strong>
            <span>{this.props.hint}</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => this.input && this.input.click()}>
            {this.props.multiple ? L('Choisir des fichiers', 'Choose files') : L('Choisir un fichier', 'Choose a file')}
          </button>
          <input
            ref={(el: HTMLInputElement | null) => (this.input = el)}
            className="sr-only"
            type="file"
            tabIndex={-1}
            aria-label={this.props.title}
            accept={this.props.accept}
            multiple={this.props.multiple}
            onChange={(e: any) => this.take(e.target.files)}
          />
        </div>
        {items.length ? (
          <ul className="upload-queue" aria-live="polite">
            {items.map((u) => (
              <UploadRow key={u.key} item={u} ctx={this.props.ctx} />
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
}

function UploadRow(props: { item: UploadItem; ctx: Ctx }) {
  const u = props.item;
  const pct = Math.round(u.progress * 100);
  return (
    <li className={cx('upload-row', `up-${u.phase}`)}>
      <Icon name={u.phase === 'error' ? 'alert' : u.phase === 'done' ? 'check' : 'doc'} />
      <div className="up-main">
        <div className="up-name">
          <span className="truncate">{u.name}</span>
          <span className="muted">{size(u.size)}</span>
        </div>
        {u.phase === 'sending' && !u.handle ? <span className="muted small">{L('En attente…', 'Waiting…')}</span> : null}
        {u.phase === 'sending' && u.handle ? (
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={L(`Envoi de ${u.name}`, `Uploading ${u.name}`)}>
            <span style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {u.phase === 'reading' ? <Spinner label={L('Lecture et analyse du document…', 'Reading and analysing the document…')} /> : null}
        {u.message ? <p className="up-msg">{u.message}</p> : null}
      </div>
      <div className="up-actions">
        {u.phase === 'sending' || u.phase === 'reading' ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => props.ctx.cancelUpload(u.key)}>
            {L('Annuler', 'Cancel')}
          </button>
        ) : null}
        {u.phase === 'error' && u.file ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => props.ctx.retryUpload(u.key)}>
            {L('Réessayer', 'Try again')}
          </button>
        ) : null}
        {u.phase === 'error' || u.phase === 'done' || u.phase === 'cancelled' ? (
          <button type="button" className="icon-btn" aria-label={L(`Retirer ${u.name} de la liste`, `Remove ${u.name} from the list`)} onClick={() => props.ctx.clearUpload(u.key)}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
    </li>
  );
}
