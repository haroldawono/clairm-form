import { Component, cx } from '../lib/react.js';
import { Icon, Spinner } from './ui.js';
import { size } from '../lib/format.js';
import { L } from '../lib/i18n.js';
export class Uploader extends Component {
    constructor() {
        super(...arguments);
        this.state = { over: false };
        this.input = null;
    }
    take(list) {
        if (!list || !list.length)
            return;
        const files = Array.from(list);
        this.props.ctx.startUploads(this.props.multiple ? files : files.slice(0, 1), this.props.role);
        if (this.input)
            this.input.value = ''; // allows re-selecting the same file after a failure
    }
    render() {
        const items = this.props.ctx.uploads.filter((u) => u.role === this.props.role);
        return (React.createElement("div", { className: "uploader" },
            React.createElement("div", { className: cx('dropzone', this.state.over && 'dropzone-over', this.props.compact && 'dropzone-compact'), onDragOver: (e) => {
                    e.preventDefault();
                    if (!this.state.over)
                        this.setState({ over: true });
                }, onDragLeave: () => this.setState({ over: false }), onDrop: (e) => {
                    e.preventDefault();
                    this.setState({ over: false });
                    this.take(e.dataTransfer && e.dataTransfer.files);
                } },
                React.createElement(Icon, { name: "upload", size: 22 }),
                React.createElement("div", { className: "dz-text" },
                    React.createElement("strong", null, this.props.title),
                    React.createElement("span", null, this.props.hint)),
                React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => this.input && this.input.click() }, this.props.multiple ? L('Choisir des fichiers', 'Choose files') : L('Choisir un fichier', 'Choose a file')),
                React.createElement("input", { ref: (el) => (this.input = el), className: "sr-only", type: "file", tabIndex: -1, "aria-label": this.props.title, accept: this.props.accept, multiple: this.props.multiple, onChange: (e) => this.take(e.target.files) })),
            items.length ? (React.createElement("ul", { className: "upload-queue", "aria-live": "polite" }, items.map((u) => (React.createElement(UploadRow, { key: u.key, item: u, ctx: this.props.ctx }))))) : null));
    }
}
function UploadRow(props) {
    const u = props.item;
    const pct = Math.round(u.progress * 100);
    return (React.createElement("li", { className: cx('upload-row', `up-${u.phase}`) },
        React.createElement(Icon, { name: u.phase === 'error' ? 'alert' : u.phase === 'done' ? 'check' : 'doc' }),
        React.createElement("div", { className: "up-main" },
            React.createElement("div", { className: "up-name" },
                React.createElement("span", { className: "truncate" }, u.name),
                React.createElement("span", { className: "muted" }, size(u.size))),
            u.phase === 'sending' && !u.handle ? React.createElement("span", { className: "muted small" }, L('En attente…', 'Waiting…')) : null,
            u.phase === 'sending' && u.handle ? (React.createElement("div", { className: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct, "aria-label": L(`Envoi de ${u.name}`, `Uploading ${u.name}`) },
                React.createElement("span", { style: { width: `${pct}%` } }))) : null,
            u.phase === 'reading' ? React.createElement(Spinner, { label: L('Lecture et analyse du document…', 'Reading and analysing the document…') }) : null,
            u.message ? React.createElement("p", { className: "up-msg" }, u.message) : null),
        React.createElement("div", { className: "up-actions" },
            u.phase === 'sending' || u.phase === 'reading' ? (React.createElement("button", { type: "button", className: "btn btn-quiet btn-sm", onClick: () => props.ctx.cancelUpload(u.key) }, L('Annuler', 'Cancel'))) : null,
            u.phase === 'error' && u.file ? (React.createElement("button", { type: "button", className: "btn btn-quiet btn-sm", onClick: () => props.ctx.retryUpload(u.key) }, L('Réessayer', 'Try again'))) : null,
            u.phase === 'error' || u.phase === 'done' || u.phase === 'cancelled' ? (React.createElement("button", { type: "button", className: "icon-btn", "aria-label": L(`Retirer ${u.name} de la liste`, `Remove ${u.name} from the list`), onClick: () => props.ctx.clearUpload(u.key) },
                React.createElement(Icon, { name: "close", size: 16 }))) : null)));
}
