import { Component, cx } from '../lib/react.js';
import { api, upload, ApiError } from '../lib/api.js';
import { dateLong, daysLabel, plural } from '../lib/format.js';
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
export const TABS = [
    { id: 'synthese', label: 'Synthèse' },
    { id: 'appel', label: 'Appel' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'pieces', label: 'Pièces' },
    { id: 'controles', label: 'Contrôles' },
    { id: 'export', label: 'Exporter' },
];
let uploadSeq = 0;
export class Dossier extends Component {
    constructor() {
        super(...arguments);
        this.state = { uploads: [], docView: null, editing: false, deleteDoc: null, deleteDossier: false, busy: false };
        this.queue = Promise.resolve();
        this.alive = true;
        this.run = async (op, success) => {
            try {
                const s = await op();
                this.props.onState(s);
                if (success)
                    this.props.notify('success', success);
                return true;
            }
            catch (err) {
                this.props.notify('error', err instanceof ApiError ? err.message : 'Une erreur inattendue est survenue.');
                return false;
            }
        };
        this.startUploads = (files, role) => {
            const items = files.map((f) => ({ key: ++uploadSeq, name: f.name, size: f.size, role, phase: 'sending', progress: 0, file: f }));
            this.setState((s) => ({ uploads: [...s.uploads.filter((u) => u.phase !== 'done'), ...items] }));
            items.forEach((item) => {
                this.queue = this.queue.then(() => this.sendOne(item.key));
            });
        };
        this.sendOne = async (key) => {
            const item = this.state.uploads.find((u) => u.key === key);
            if (!item || item.phase !== 'sending' || !item.file)
                return;
            const handle = upload(this.props.state.dossier.id, item.role, item.file, (p) => this.patchUpload(key, { progress: p }), () => this.patchUpload(key, { phase: 'reading', progress: 1 }));
            this.patchUpload(key, { handle });
            try {
                const res = await handle.promise;
                if (!this.alive)
                    return;
                this.props.onState(res.state);
                const d = res.document;
                const msg = d.role === 'call'
                    ? `${d.requirement_count || 0} exigence(s) lue(s) dans l’appel.`
                    : d.proof_type && d.proof_type !== 'other' && !d.has_text
                        ? `Classé d’après son nom : ${d.proof_type_label}. Aucun texte lisible : vérifiez ce type.`
                        : d.proof_type && d.proof_type !== 'other'
                            ? `Reconnu comme : ${d.proof_type_label}.`
                            : d.has_text
                                ? 'Type non reconnu : choisissez-le dans la liste.'
                                : 'Pas de texte lisible (scan) : indiquez son type.';
                this.patchUpload(key, { phase: 'done', message: msg, file: undefined, handle: undefined });
            }
            catch (err) {
                const e = err;
                if (e.code === 'ABORTED' || e.code === 'UPLOAD-CANCELLED')
                    return; // cancelUpload() reports the outcome
                else
                    this.patchUpload(key, { phase: 'error', message: e.message || 'Import impossible.', handle: undefined });
            }
        };
        this.cancelUpload = async (key) => {
            const item = this.state.uploads.find((u) => u.key === key);
            if (!item)
                return;
            if (!item.handle) {
                if (item.phase === 'sending')
                    this.patchUpload(key, { phase: 'cancelled', message: 'Import annulé : le fichier n’a pas été ajouté.' });
                return;
            }
            const handle = item.handle;
            handle.abort();
            // The server may already hold the bytes: ask it to discard this upload whatever its stage.
            try {
                const state = await api.cancelUpload(this.props.state.dossier.id, handle.uploadId);
                if (this.alive)
                    this.props.onState(state);
                this.patchUpload(key, { phase: 'cancelled', message: 'Import annulé : le fichier n’a pas été ajouté.', handle: undefined });
            }
            catch (err) {
                this.patchUpload(key, { phase: 'error', message: `Annulation non confirmée par le serveur : ${err.message}`, handle: undefined });
            }
        };
        this.retryUpload = (key) => {
            this.patchUpload(key, { phase: 'sending', progress: 0, message: undefined });
            this.queue = this.queue.then(() => this.sendOne(key));
        };
        this.clearUpload = (key) => this.setState((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) }));
        // ---------------------------------------------------------------- navigation helpers
        this.go = (tab, rid) => this.props.navigate(`#/d/${this.props.state.dossier.id}/${tab}${rid ? '/' + rid : ''}`);
        this.openRequirement = (rid) => this.go(this.props.tab, rid);
        this.closeRequirement = () => this.go(this.props.tab);
    }
    componentWillUnmount() {
        this.alive = false;
        this.state.uploads.forEach((u) => u.handle && u.phase === 'sending' && u.handle.abort());
    }
    // ---------------------------------------------------------------- uploads (sequential, cancellable)
    patchUpload(key, patch) {
        if (!this.alive)
            return;
        this.setState((s) => ({ uploads: s.uploads.map((u) => (u.key === key ? { ...u, ...patch } : u)) }));
    }
    render() {
        const { state, tab } = this.props;
        const d = state.dossier;
        const a = state.assessment;
        const ctx = {
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
        const counters = {
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
        return (React.createElement("main", { className: "dossier", id: "main" },
            React.createElement("header", { className: "dossier-head" },
                React.createElement("div", { className: "dh-title" },
                    React.createElement("a", { className: "back-link", href: "#/" },
                        React.createElement(Icon, { name: "back", size: 16 }),
                        " Mes dossiers"),
                    React.createElement("h1", { className: "dossier-title" }, d.title),
                    React.createElement("div", { className: "dh-meta" },
                        d.is_demo ? React.createElement("span", { className: "tag tag-demo" }, "D\u00E9monstration") : null,
                        d.program ? React.createElement("span", null, d.program) : null,
                        React.createElement("span", { className: cx('deadline', days !== null && days < 0 && 'deadline-late', days !== null && days >= 0 && days <= 7 && 'deadline-soon') }, a.deadline.date
                            ? `Date limite : ${dateLong(a.deadline.date)} — ${daysLabel(days)}${a.deadline.source === 'call' ? ' (lue dans l’appel)' : ''}`
                            : 'Date limite inconnue'),
                        React.createElement("button", { type: "button", className: "link-btn", onClick: () => this.setState({ editing: true }) },
                            React.createElement(Icon, { name: "edit", size: 15 }),
                            " Modifier"))),
                React.createElement("div", { className: cx('dh-score', `score-${a.readiness.code}`) },
                    React.createElement("div", { className: "score-line" },
                        React.createElement("span", { className: "score-num" }, a.readiness.code === 'empty' ? '—' : `${a.score}\u202f%`),
                        React.createElement("span", { className: "score-label" }, a.readiness.label)),
                    React.createElement(StatusBar, { counts: a.counts, total: a.required_total }),
                    React.createElement("p", { className: "score-note" }, a.readiness.code === 'empty'
                        ? 'Importez l’appel pour obtenir la checklist.'
                        : `${plural(a.counts.covered, 'exigence couverte', 'exigences couvertes')} sur ${active} · ${plural(a.checks.filter((c) => c.severity === 'error').length, 'point à corriger', 'points à corriger')}`))),
            React.createElement("nav", { className: "tabs", "aria-label": "Sections du dossier" }, TABS.map((t) => (React.createElement("a", { key: t.id, href: `#/d/${d.id}/${t.id}`, className: cx('tab', t.id === tab && 'tab-active'), "aria-current": t.id === tab ? 'page' : undefined },
                t.label,
                counters[t.id] ? React.createElement("span", { className: cx('tab-count', t.id === 'controles' && issues > 0 && 'tab-count-alert') }, counters[t.id]) : null)))),
            React.createElement("div", { className: "tab-panel" },
                tab === 'synthese' ? React.createElement(Overview, { ctx: ctx }) : null,
                tab === 'appel' ? React.createElement(CallTab, { ctx: ctx }) : null,
                tab === 'checklist' ? React.createElement(Checklist, { ctx: ctx }) : null,
                tab === 'pieces' ? React.createElement(Pieces, { ctx: ctx }) : null,
                tab === 'controles' ? React.createElement(ChecksTab, { ctx: ctx }) : null,
                tab === 'export' ? React.createElement(ExportTab, { ctx: ctx, onDeleteDossier: () => this.setState({ deleteDossier: true }) }) : null),
            selected ? React.createElement(RequirementDrawer, { ctx: ctx, requirement: selected, onClose: this.closeRequirement }) : null,
            this.props.requirementId && !selected ? React.createElement(MissingRequirement, { onClose: this.closeRequirement }) : null,
            this.state.docView ? (React.createElement(DocTextModal, { dossierId: d.id, docId: this.state.docView.id, page: this.state.docView.page, state: state, onOpenRequirement: (rid) => {
                    this.setState({ docView: null });
                    this.openRequirement(rid);
                }, onClose: () => this.setState({ docView: null }) })) : null,
            this.state.editing ? (React.createElement(NewDossierModal, { heading: "Modifier le dossier", submitLabel: "Enregistrer", initial: { title: d.title, program: d.program, deadline: d.deadline_source === 'user' ? d.deadline : null }, onClose: () => this.setState({ editing: false }), onSubmit: async (title, program, deadline) => {
                    const ok = await this.run(() => api.patch(d.id, { title, program, deadline }), 'Dossier mis à jour.');
                    if (ok)
                        this.setState({ editing: false });
                    return ok;
                } })) : null,
            deleteDoc ? (React.createElement(ConfirmDialog, { title: deleteDoc.role === 'call' ? 'Retirer ce document d’appel ?' : 'Supprimer cette pièce ?', danger: true, busy: this.state.busy, confirmLabel: "Supprimer", message: deleteDoc.role === 'call'
                    ? `« ${deleteDoc.name} » sera supprimé, ainsi que les ${deleteDoc.requirement_count || 0} exigence(s) qui en ont été extraites (vos décisions sur ces exigences seront perdues).`
                    : `« ${deleteDoc.name} » sera supprimé du dossier et de cet ordinateur. Les exigences qu’il couvrait redeviendront à traiter.`, onCancel: () => this.setState({ deleteDoc: null }), onConfirm: async () => {
                    this.setState({ busy: true });
                    const ok = await this.run(() => api.deleteDoc(d.id, deleteDoc.id), 'Document supprimé.');
                    this.setState({ busy: false, deleteDoc: ok ? null : this.state.deleteDoc });
                } })) : null,
            this.state.deleteDossier ? (React.createElement(ConfirmDialog, { title: "Supprimer tout le dossier ?", danger: true, busy: this.state.busy, confirmLabel: "Supprimer d\u00E9finitivement", message: `Le dossier « ${d.title} », ses ${state.documents.length} document(s) et votre travail de vérification seront effacés de cet ordinateur.`, onCancel: () => this.setState({ deleteDossier: false }), onConfirm: async () => {
                    this.setState({ busy: true });
                    try {
                        await api.remove(d.id);
                        this.props.notify('success', 'Dossier supprimé.');
                        this.props.onDeleted();
                    }
                    catch (err) {
                        this.props.notify('error', err.message);
                        this.setState({ busy: false });
                    }
                } })) : null));
    }
}
function MissingRequirement(props) {
    return (React.createElement(ConfirmDialog, { title: "Exigence introuvable", message: "Cette exigence n\u2019existe plus dans le dossier (son document d\u2019appel a peut-\u00EAtre \u00E9t\u00E9 retir\u00E9).", confirmLabel: "Fermer", onConfirm: props.onClose, onCancel: props.onClose }));
}
