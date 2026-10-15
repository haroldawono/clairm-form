import { Component, cx } from '../lib/react.js';
import { STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
// ------------------------------------------------------------------ icons (inline, stroke-based)
const PATHS = {
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
export function Icon(props) {
    const s = props.size || 18;
    return (React.createElement("svg", { className: "icon", width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": props.label ? undefined : 'true', role: props.label ? 'img' : undefined, "aria-label": props.label, focusable: "false" },
        React.createElement("path", { d: PATHS[props.name] || '' })));
}
export function StatusChip(props) {
    const meta = STATUS[props.status];
    return (React.createElement("span", { className: cx('chip', `chip-${props.status}`, props.small && 'chip-small'), title: meta.hint },
        React.createElement("span", { className: "chip-dot", "aria-hidden": "true" }),
        meta.label));
}
export function Spinner(props) {
    return (React.createElement("span", { className: "spinner", role: "status" },
        React.createElement("span", { className: "spinner-ring", "aria-hidden": "true" }),
        props.label ? React.createElement("span", null, props.label) : React.createElement("span", { className: "sr-only" }, L('Chargement…', 'Loading…'))));
}
// ------------------------------------------------------------------ modal / drawer
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const stack = [];
export class Modal extends Component {
    constructor() {
        super(...arguments);
        this.panel = null;
        this.previous = null;
        this.titleId = 'm' + Math.random().toString(36).slice(2, 9);
        this.onKey = (e) => {
            if (stack[stack.length - 1] !== this || !this.panel)
                return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (!this.props.busy)
                    this.props.onClose();
                return;
            }
            if (e.key === 'Tab') {
                const items = Array.from(this.panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
                if (!items.length) {
                    e.preventDefault();
                    return;
                }
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && (document.activeElement === first || !this.panel.contains(document.activeElement))) {
                    e.preventDefault();
                    last.focus();
                }
                else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
    }
    componentDidMount() {
        this.previous = document.activeElement;
        stack.push(this);
        document.addEventListener('keydown', this.onKey, true);
        const root = document.getElementById('root');
        if (root)
            root.setAttribute('aria-hidden', 'true');
        document.body.classList.add('no-scroll');
        window.setTimeout(() => {
            if (!this.panel)
                return;
            const target = this.panel.querySelector('[data-autofocus]') || this.panel.querySelector(FOCUSABLE);
            (target || this.panel).focus();
        }, 0);
    }
    componentWillUnmount() {
        const i = stack.indexOf(this);
        if (i >= 0)
            stack.splice(i, 1);
        document.removeEventListener('keydown', this.onKey, true);
        if (!stack.length) {
            const root = document.getElementById('root');
            if (root)
                root.removeAttribute('aria-hidden');
            document.body.classList.remove('no-scroll');
        }
        const prev = this.previous;
        if (prev && typeof prev.focus === 'function' && document.contains(prev))
            prev.focus();
    }
    render() {
        const variant = this.props.variant || 'dialog';
        const host = document.getElementById('modal-root');
        return ReactDOM.createPortal(React.createElement("div", { className: cx('overlay', `overlay-${variant}`), onMouseDown: (e) => e.target === e.currentTarget && !this.props.busy && this.props.onClose() },
            React.createElement("section", { className: cx('modal', `modal-${variant}`), role: "dialog", "aria-modal": "true", "aria-labelledby": this.titleId, tabIndex: -1, ref: (el) => (this.panel = el) },
                React.createElement("header", { className: "modal-head" },
                    React.createElement("div", null,
                        React.createElement("h2", { id: this.titleId, className: "modal-title" }, this.props.title),
                        this.props.subtitle ? React.createElement("div", { className: "modal-sub" }, this.props.subtitle) : null),
                    React.createElement("button", { type: "button", className: "icon-btn", onClick: this.props.onClose, disabled: this.props.busy, "aria-label": L('Fermer', 'Close') },
                        React.createElement(Icon, { name: "close" }))),
                React.createElement("div", { className: "modal-body" }, this.props.children),
                this.props.footer ? React.createElement("footer", { className: "modal-foot" }, this.props.footer) : null)), host);
    }
}
export function ConfirmDialog(props) {
    return (React.createElement(Modal, { title: props.title, onClose: props.onCancel, busy: props.busy, footer: [
            React.createElement("button", { key: "c", type: "button", className: "btn btn-quiet", onClick: props.onCancel, disabled: props.busy, "data-autofocus": true }, L('Annuler', 'Cancel')),
            React.createElement("button", { key: "o", type: "button", className: cx('btn', props.danger ? 'btn-danger' : 'btn-primary'), onClick: props.onConfirm, disabled: props.busy }, props.busy ? L('En cours…', 'Working…') : props.confirmLabel),
        ] },
        React.createElement("p", { className: "confirm-text" }, props.message)));
}
export function Toasts(props) {
    return (React.createElement("div", { className: "toasts", "aria-live": "polite", "aria-relevant": "additions" }, props.items.map((t) => (React.createElement("div", { key: t.id, className: cx('toast', `toast-${t.kind}`), role: t.kind === 'error' ? 'alert' : 'status' },
        React.createElement(Icon, { name: t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info' }),
        React.createElement("span", null, t.text),
        React.createElement("button", { type: "button", className: "icon-btn", onClick: () => props.onDismiss(t.id), "aria-label": L('Fermer la notification', 'Dismiss notification') },
            React.createElement(Icon, { name: "close", size: 16 })))))));
}
// ------------------------------------------------------------------ segmented status bar
export function StatusBar(props) {
    const order = ['covered', 'to_verify', 'partial', 'to_confirm', 'missing', 'problem'];
    const total = Math.max(1, order.reduce((n, s) => n + (props.counts[s] || 0), 0));
    return (React.createElement("div", { className: "statusbar", role: "img", "aria-label": order.map((s) => `${props.counts[s] || 0} ${STATUS[s].label.toLowerCase()}`).join(', ') }, order.map((s) => props.counts[s] ? React.createElement("span", { key: s, className: `seg seg-${s}`, style: { width: `${(100 * props.counts[s]) / total}%` } }) : null)));
}
