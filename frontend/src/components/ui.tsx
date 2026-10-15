import { Component, cx } from '../lib/react.js';
import { STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import type { Status } from '../lib/types.js';

// ------------------------------------------------------------------ icons (inline, stroke-based)
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  upload: 'M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  download: 'M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M9 7V4h6v3',
  doc: 'M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  back: 'M15 5l-7 7 7 7',
  alert: 'M12 8v5m0 3.5v.5M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 11v6m0-9.5V8M12 21a9 9 0 100-18 9 9 0 000 18z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
};

export function Icon(props: { name: string; size?: number; label?: string }) {
  const s = props.size || 18;
  return (
    <svg
      className="icon"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props.label ? undefined : 'true'}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      focusable="false"
    >
      <path d={PATHS[props.name] || ''} />
    </svg>
  );
}

export function StatusChip(props: { status: Status; small?: boolean }) {
  const meta = STATUS[props.status];
  return (
    <span className={cx('chip', `chip-${props.status}`, props.small && 'chip-small')} title={meta.hint}>
      <span className="chip-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function Spinner(props: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner-ring" aria-hidden="true" />
      {props.label ? <span>{props.label}</span> : <span className="sr-only">{L('Chargement…', 'Loading…')}</span>}
    </span>
  );
}

// ------------------------------------------------------------------ modal / drawer
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const stack: any[] = [];

interface ModalProps {
  title: string;
  onClose: () => void;
  variant?: 'dialog' | 'drawer' | 'wide';
  footer?: any;
  subtitle?: any;
  busy?: boolean;
}

export class Modal extends Component<ModalProps, {}> {
  private panel: HTMLElement | null = null;
  private previous: Element | null = null;
  private titleId = 'm' + Math.random().toString(36).slice(2, 9);

  componentDidMount() {
    this.previous = document.activeElement;
    stack.push(this);
    document.addEventListener('keydown', this.onKey, true);
    const root = document.getElementById('root');
    if (root) root.setAttribute('aria-hidden', 'true');
    document.body.classList.add('no-scroll');
    window.setTimeout(() => {
      if (!this.panel) return;
      const target = this.panel.querySelector<HTMLElement>('[data-autofocus]') || this.panel.querySelector<HTMLElement>(FOCUSABLE);
      (target || this.panel).focus();
    }, 0);
  }

  componentWillUnmount() {
    const i = stack.indexOf(this);
    if (i >= 0) stack.splice(i, 1);
    document.removeEventListener('keydown', this.onKey, true);
    if (!stack.length) {
      const root = document.getElementById('root');
      if (root) root.removeAttribute('aria-hidden');
      document.body.classList.remove('no-scroll');
    }
    const prev = this.previous as HTMLElement | null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
  }

  onKey = (e: KeyboardEvent) => {
    if (stack[stack.length - 1] !== this || !this.panel) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!this.props.busy) this.props.onClose();
      return;
    }
    if (e.key === 'Tab') {
      const items = Array.from(this.panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !this.panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  render() {
    const variant = this.props.variant || 'dialog';
    const host = document.getElementById('modal-root') as Element;
    return ReactDOM.createPortal(
      <div className={cx('overlay', `overlay-${variant}`)} onMouseDown={(e: any) => e.target === e.currentTarget && !this.props.busy && this.props.onClose()}>
        <section
          className={cx('modal', `modal-${variant}`)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={this.titleId}
          tabIndex={-1}
          ref={(el: HTMLElement | null) => (this.panel = el)}
        >
          <header className="modal-head">
            <div>
              <h2 id={this.titleId} className="modal-title">
                {this.props.title}
              </h2>
              {this.props.subtitle ? <div className="modal-sub">{this.props.subtitle}</div> : null}
            </div>
            <button type="button" className="icon-btn" onClick={this.props.onClose} disabled={this.props.busy} aria-label={L('Fermer', 'Close')}>
              <Icon name="close" />
            </button>
          </header>
          <div className="modal-body">{this.props.children}</div>
          {this.props.footer ? <footer className="modal-foot">{this.props.footer}</footer> : null}
        </section>
      </div>,
      host,
    );
  }
}

export function ConfirmDialog(props: {
  title: string;
  message: any;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      busy={props.busy}
      footer={[
        <button key="c" type="button" className="btn btn-quiet" onClick={props.onCancel} disabled={props.busy} data-autofocus>
          {L('Annuler', 'Cancel')}
        </button>,
        <button key="o" type="button" className={cx('btn', props.danger ? 'btn-danger' : 'btn-primary')} onClick={props.onConfirm} disabled={props.busy}>
          {props.busy ? L('En cours…', 'Working…') : props.confirmLabel}
        </button>,
      ]}
    >
      <p className="confirm-text">{props.message}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts
export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export function Toasts(props: { items: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {props.items.map((t) => (
        <div key={t.id} className={cx('toast', `toast-${t.kind}`)} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} />
          <span>{t.text}</span>
          <button type="button" className="icon-btn" onClick={() => props.onDismiss(t.id)} aria-label={L('Fermer la notification', 'Dismiss notification')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ segmented status bar
export function StatusBar(props: { counts: Record<string, number>; total: number }) {
  const order: Status[] = ['covered', 'to_verify', 'partial', 'to_confirm', 'missing', 'problem'];
  const total = Math.max(1, order.reduce((n, s) => n + (props.counts[s] || 0), 0));
  return (
    <div className="statusbar" role="img" aria-label={order.map((s) => `${props.counts[s] || 0} ${STATUS[s].label.toLowerCase()}`).join(', ')}>
      {order.map((s) =>
        props.counts[s] ? <span key={s} className={`seg seg-${s}`} style={{ width: `${(100 * props.counts[s]) / total}%` }} /> : null,
      )}
    </div>
  );
}
