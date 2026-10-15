import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS, STATUS_ORDER } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import { Icon, Modal, StatusChip } from '../components/ui.js';
import type { Ctx } from './Dossier.js';
import type { Kind, Status } from '../lib/types.js';

interface State {
  status: Status | '';
  kind: Kind | '';
  q: string;
  adding: boolean;
}

export class Checklist extends Component<{ ctx: Ctx }, State> {
  state: State = { status: '', kind: '', q: '', adding: false };

  render() {
    const { ctx } = this.props;
    const { state } = ctx;
    const results = state.assessment.requirements;
    const docs: Record<string, string> = {};
    state.documents.forEach((d) => (docs[d.id] = d.name));
    const q = this.state.q.trim().toLowerCase();
    const rows = state.requirements.filter((r) => {
      const res = results[r.id];
      if (this.state.status && res.status !== this.state.status) return false;
      if (this.state.kind && r.kind !== this.state.kind) return false;
      if (q && !(r.label + ' ' + r.statement).toLowerCase().includes(q)) return false;
      return true;
    });
    const groups: Kind[] = ['document', 'condition', 'rule'];
    const counts: Record<string, number> = {};
    state.requirements.forEach((r) => (counts[results[r.id].status] = (counts[results[r.id].status] || 0) + 1));
    const filtered = this.state.status || this.state.kind || q;

    return (
      <div className="checklist">
        <div className="toolbar" role="search">
          <label className="field field-inline">
            <span className="sr-only">{L('Rechercher une exigence', 'Search requirements')}</span>
            <Icon name="search" size={16} />
            <input type="search" placeholder={L('Rechercher…', 'Search…')} value={this.state.q} onChange={(e: any) => this.setState({ q: e.target.value })} />
          </label>
          <label className="field field-inline">
            <span className="field-label-inline">{L('Statut', 'Status')}</span>
            <select value={this.state.status} onChange={(e: any) => this.setState({ status: e.target.value })}>
              <option value="">{L('Tous', 'All')} ({state.requirements.length})</option>
              {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label} ({counts[s]})
                </option>
              ))}
            </select>
          </label>
          <label className="field field-inline">
            <span className="field-label-inline">Type</span>
            <select value={this.state.kind} onChange={(e: any) => this.setState({ kind: e.target.value })}>
              <option value="">{L('Tous', 'All')}</option>
              <option value="document">{L('Pièces', 'Documents')}</option>
              <option value="condition">Conditions</option>
              <option value="rule">{L('Règles', 'Rules')}</option>
            </select>
          </label>
          {filtered ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => this.setState({ status: '', kind: '', q: '' })}>
              {L('Effacer les filtres', 'Clear filters')}
            </button>
          ) : null}
          <span className="toolbar-spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ adding: true })}>
            <Icon name="plus" /> {L('Ajouter une exigence', 'Add a requirement')}
          </button>
        </div>

        {!state.requirements.length ? (
          <div className="empty">
            <p>{L('La checklist est vide.', 'The checklist is empty.')}</p>
            <p className="muted">
              {L('Importez le règlement dans l’onglet', 'Import the rules in the')} <a href={`#/d/${state.dossier.id}/appel`}>{L('Appel', 'Call')}</a>
              {L(', ou ajoutez les exigences à la main.', ' tab, or add the requirements by hand.')}
            </p>
          </div>
        ) : null}
        {state.requirements.length && !rows.length ? <p className="empty muted">{L('Aucune exigence ne correspond à ces filtres.', 'No requirement matches these filters.')}</p> : null}

        {groups.map((g) => {
          const list = rows.filter((r) => r.kind === g);
          if (!list.length) return null;
          return (
            <section key={g} className="req-group" aria-label={KIND[g]}>
              <h2 className="group-title">
                {g === 'document' ? L('Pièces à fournir', 'Required documents') : g === 'condition' ? L('Conditions d’éligibilité', 'Eligibility conditions') : L('Règles à respecter', 'Rules to follow')}
                <span className="muted"> {list.length}</span>
              </h2>
              <ul className="req-list">
                {list.map((r) => {
                  const res = results[r.id];
                  const chips = constraintChips(r.constraints);
                  return (
                    <li key={r.id}>
                      <button type="button" className={cx('req-row', `rs-${res.status}`)} onClick={() => ctx.openRequirement(r.id)}>
                        <StatusChip status={res.status} />
                        <span className="req-main">
                          <span className="req-label">{r.label}</span>
                          <span className="req-sub">
                            {r.critical ? <span className="flag flag-critical">{L('critique', 'critical')}</span> : null}
                            {!r.required ? <span className="flag">{L('facultatif', 'optional')}</span> : null}
                            {r.min_count > 1 ? <span className="flag">{L(`${r.min_count} pièces`, `${r.min_count} documents`)}</span> : null}
                            {chips.map((c) => (
                              <span key={c} className="flag">
                                {c}
                              </span>
                            ))}
                            {res.links.length ? (
                              <span className="req-docs truncate">{res.links.map((l) => docs[l.document_id]).join(', ')}</span>
                            ) : (
                              <span className="req-expl">{res.explanation}</span>
                            )}
                          </span>
                        </span>
                        <span className="req-src">{r.origin === 'manual' ? L('ajoutée', 'added') : r.source_page ? `p. ${r.source_page}` : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {this.state.adding ? <AddRequirement ctx={ctx} onClose={() => this.setState({ adding: false })} /> : null}
      </div>
    );
  }
}

class AddRequirement extends Component<{ ctx: Ctx; onClose: () => void }, { label: string; kind: Kind; proof: string; critical: boolean; required: boolean; busy: boolean; error: string }> {
  state = { label: '', kind: 'document' as Kind, proof: '', critical: false, required: true, busy: false, error: '' };

  submit = async (e: any) => {
    e.preventDefault();
    if (this.state.label.trim().length < 3) {
      this.setState({ error: L('Décrivez l’exigence en quelques mots (3 caractères minimum).', 'Describe the requirement in a few words (at least 3 characters).') });
      return;
    }
    this.setState({ busy: true });
    const ok = await this.props.ctx.run(
      () =>
        api.addRequirement(this.props.ctx.state.dossier.id, {
          label: this.state.label.trim(),
          kind: this.state.kind,
          proof_type: this.state.kind === 'document' && this.state.proof ? this.state.proof : null,
          critical: this.state.critical,
          required: this.state.required,
        }),
      L('Exigence ajoutée à la checklist.', 'Requirement added to the checklist.'),
    );
    if (ok) this.props.onClose();
    else this.setState({ busy: false });
  };

  render() {
    const types = this.props.ctx.state.proof_types.filter((t) => t.code !== 'other');
    return (
      <Modal
        title={L('Ajouter une exigence', 'Add a requirement')}
        onClose={this.props.onClose}
        busy={this.state.busy}
        footer={[
          <button key="c" type="button" className="btn btn-quiet" onClick={this.props.onClose} disabled={this.state.busy}>
            {L('Annuler', 'Cancel')}
          </button>,
          <button key="s" type="submit" form="add-req" className="btn btn-primary" disabled={this.state.busy}>
            {this.state.busy ? L('Ajout…', 'Adding…') : L('Ajouter', 'Add')}
          </button>,
        ]}
      >
        <form id="add-req" className="form" onSubmit={this.submit} noValidate>
          <label className="field">
            <span className="field-label">{L('Exigence', 'Requirement')}</span>
            <textarea
              rows={3}
              maxLength={300}
              data-autofocus
              value={this.state.label}
              placeholder={L('Ex. Attestation de domiciliation bancaire', 'e.g. Bank account certificate')}
              onChange={(e: any) => this.setState({ label: e.target.value, error: '' })}
            />
          </label>
          <fieldset className="field">
            <legend className="field-label">{L('Nature', 'Kind')}</legend>
            <div className="segmented">
              {(['document', 'condition', 'rule'] as Kind[]).map((k) => (
                <label key={k} className={cx('seg-opt', this.state.kind === k && 'seg-on')}>
                  <input type="radio" name="kind" value={k} checked={this.state.kind === k} onChange={() => this.setState({ kind: k })} />
                  {KIND[k]}
                </label>
              ))}
            </div>
          </fieldset>
          {this.state.kind === 'document' ? (
            <label className="field">
              <span className="field-label">
                {L('Type de pièce', 'Document type')} <span className="optional">{L('pour le rattachement automatique', 'for automatic linking')}</span>
              </span>
              <select value={this.state.proof} onChange={(e: any) => this.setState({ proof: e.target.value })}>
                <option value="">{L('Non précisé', 'Not specified')}</option>
                {types.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={this.state.critical} onChange={(e: any) => this.setState({ critical: e.target.checked })} />
            {L('Critique (le dossier est irrecevable sans elle)', 'Critical (the application is rejected without it)')}
          </label>
          <label className="check">
            <input type="checkbox" checked={!this.state.required} onChange={(e: any) => this.setState({ required: !e.target.checked })} />
            {L('Facultative', 'Optional')}
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
