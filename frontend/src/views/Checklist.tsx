import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS, STATUS_ORDER } from '../lib/format.js';
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
            <span className="sr-only">Rechercher une exigence</span>
            <Icon name="search" size={16} />
            <input type="search" placeholder="Rechercher…" value={this.state.q} onChange={(e: any) => this.setState({ q: e.target.value })} />
          </label>
          <label className="field field-inline">
            <span className="field-label-inline">Statut</span>
            <select value={this.state.status} onChange={(e: any) => this.setState({ status: e.target.value })}>
              <option value="">Tous ({state.requirements.length})</option>
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
              <option value="">Tous</option>
              <option value="document">Pièces</option>
              <option value="condition">Conditions</option>
              <option value="rule">Règles</option>
            </select>
          </label>
          {filtered ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => this.setState({ status: '', kind: '', q: '' })}>
              Effacer les filtres
            </button>
          ) : null}
          <span className="toolbar-spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ adding: true })}>
            <Icon name="plus" /> Ajouter une exigence
          </button>
        </div>

        {!state.requirements.length ? (
          <div className="empty">
            <p>La checklist est vide.</p>
            <p className="muted">
              Importez le règlement dans l’onglet <a href={`#/d/${state.dossier.id}/appel`}>Appel</a>, ou ajoutez les exigences à la main.
            </p>
          </div>
        ) : null}
        {state.requirements.length && !rows.length ? <p className="empty muted">Aucune exigence ne correspond à ces filtres.</p> : null}

        {groups.map((g) => {
          const list = rows.filter((r) => r.kind === g);
          if (!list.length) return null;
          return (
            <section key={g} className="req-group" aria-label={KIND[g]}>
              <h2 className="group-title">
                {g === 'document' ? 'Pièces à fournir' : g === 'condition' ? 'Conditions d’éligibilité' : 'Règles à respecter'}
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
                            {r.critical ? <span className="flag flag-critical">critique</span> : null}
                            {!r.required ? <span className="flag">facultatif</span> : null}
                            {r.min_count > 1 ? <span className="flag">{r.min_count} pièces</span> : null}
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
                        <span className="req-src">{r.origin === 'manual' ? 'ajoutée' : r.source_page ? `p. ${r.source_page}` : ''}</span>
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
      this.setState({ error: 'Décrivez l’exigence en quelques mots (3 caractères minimum).' });
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
      'Exigence ajoutée à la checklist.',
    );
    if (ok) this.props.onClose();
    else this.setState({ busy: false });
  };

  render() {
    const types = this.props.ctx.state.proof_types.filter((t) => t.code !== 'other');
    return (
      <Modal
        title="Ajouter une exigence"
        onClose={this.props.onClose}
        busy={this.state.busy}
        footer={[
          <button key="c" type="button" className="btn btn-quiet" onClick={this.props.onClose} disabled={this.state.busy}>
            Annuler
          </button>,
          <button key="s" type="submit" form="add-req" className="btn btn-primary" disabled={this.state.busy}>
            {this.state.busy ? 'Ajout…' : 'Ajouter'}
          </button>,
        ]}
      >
        <form id="add-req" className="form" onSubmit={this.submit} noValidate>
          <label className="field">
            <span className="field-label">Exigence</span>
            <textarea
              rows={3}
              maxLength={300}
              data-autofocus
              value={this.state.label}
              placeholder="Ex. Attestation de domiciliation bancaire"
              onChange={(e: any) => this.setState({ label: e.target.value, error: '' })}
            />
          </label>
          <fieldset className="field">
            <legend className="field-label">Nature</legend>
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
                Type de pièce <span className="optional">pour le rattachement automatique</span>
              </span>
              <select value={this.state.proof} onChange={(e: any) => this.setState({ proof: e.target.value })}>
                <option value="">Non précisé</option>
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
            Critique (le dossier est irrecevable sans elle)
          </label>
          <label className="check">
            <input type="checkbox" checked={!this.state.required} onChange={(e: any) => this.setState({ required: !e.target.checked })} />
            Facultative
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
