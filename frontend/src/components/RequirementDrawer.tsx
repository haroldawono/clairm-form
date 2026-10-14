import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS } from '../lib/format.js';
import { Icon, Modal, StatusChip } from './ui.js';
import type { Ctx } from '../views/Dossier.js';
import type { DossierState, Requirement } from '../lib/types.js';

interface Props {
  ctx: Ctx;
  requirement: Requirement;
  onClose: () => void;
}

interface State {
  busy: string | null;
  label: string;
  note: string;
  editingLabel: boolean;
}

export class RequirementDrawer extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { busy: null, label: props.requirement.label, note: props.requirement.note || '', editingLabel: false };
  }

  componentDidUpdate(prev: Props) {
    if (prev.requirement.id !== this.props.requirement.id) {
      this.setState({ label: this.props.requirement.label, note: this.props.requirement.note || '', editingLabel: false, busy: null });
    }
  }

  async act(key: string, op: () => Promise<DossierState>, success: string) {
    this.setState({ busy: key });
    await this.props.ctx.run(op, success);
    this.setState({ busy: null });
  }

  patch(key: string, fields: Record<string, unknown>, success: string) {
    const { ctx, requirement } = this.props;
    return this.act(key, () => api.patchRequirement(ctx.state.dossier.id, requirement.id, fields), success);
  }

  link(docId: string, decision: 'confirmed' | 'rejected' | null, success: string) {
    const { ctx, requirement } = this.props;
    return this.act(`link-${docId}`, () => api.setLink(ctx.state.dossier.id, requirement.id, docId, decision), success);
  }

  render() {
    const { ctx, requirement: r } = this.props;
    const st = ctx.state;
    const res = st.assessment.requirements[r.id];
    const busy = this.state.busy;
    const docs = st.documents.filter((d) => d.role === 'piece');
    const byId: Record<string, (typeof docs)[0]> = {};
    docs.forEach((d) => (byId[d.id] = d));
    const linkedIds = new Set(res.links.map((l) => l.document_id));
    const checks = st.assessment.checks.filter((c) => res.checks.includes(c.id));
    const chips = constraintChips(r.constraints);
    const source = r.source_doc_id ? st.documents.find((d) => d.id === r.source_doc_id) : null;
    const rejected = docs.filter((d) => !linkedIds.has(d.id) && r.kind === 'document' && (res.rejected || []).includes(d.id));
    const linkable = docs.filter((d) => !linkedIds.has(d.id) && !rejected.some((x) => x.id === d.id));
    const ignored = r.status === 'ignored';

    return (
      <Modal
        variant="drawer"
        title={r.label}
        busy={false}
        onClose={this.props.onClose}
        subtitle={
          <span className="drawer-sub">
            <StatusChip status={res.status} /> <span className="muted">{KIND[r.kind]}</span>
            {r.critical ? <span className="flag flag-critical">critique</span> : null}
            {!r.required ? <span className="flag">facultatif</span> : null}
          </span>
        }
        footer={[
          <button
            key="ignore"
            type="button"
            className="btn btn-quiet"
            disabled={!!busy}
            onClick={() => this.patch('status', { status: ignored ? 'active' : 'ignored' }, ignored ? 'Exigence réintégrée.' : 'Exigence écartée.')}
          >
            <Icon name={ignored ? 'undo' : 'close'} size={16} /> {ignored ? 'Réintégrer' : 'Écarter (ne me concerne pas)'}
          </button>,
          r.origin === 'manual' ? (
            <button
              key="del"
              type="button"
              className="btn btn-quiet danger-text"
              disabled={!!busy}
              onClick={async () => {
                this.setState({ busy: 'delete' });
                const ok = await ctx.run(() => api.deleteRequirement(st.dossier.id, r.id), 'Exigence supprimée.');
                if (ok) this.props.onClose();
                else this.setState({ busy: null });
              }}
            >
              <Icon name="trash" size={16} /> Supprimer
            </button>
          ) : null,
          <span key="sp" className="toolbar-spacer" />,
          <button key="close" type="button" className="btn btn-secondary" onClick={this.props.onClose}>
            Terminé
          </button>,
        ]}
      >
        <p className={cx('explain', `explain-${res.status}`)}>{res.explanation || STATUS[res.status].hint}</p>

        {checks.length ? (
          <ul className="check-list compact">
            {checks.map((c) => (
              <li key={c.id} className={cx('check-item', `sev-${c.severity}`)}>
                <Icon name={c.severity === 'info' ? 'info' : 'alert'} size={16} />
                <div>
                  <strong>{c.title}</strong>
                  <p>{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {r.kind === 'document' ? (
          <section className="drawer-section" aria-labelledby="pieces-h">
            <h3 id="pieces-h" className="drawer-h">
              Pièces rattachées {r.min_count > 1 ? <span className="muted">({r.min_count} distinctes demandées)</span> : null}
            </h3>
            {res.links.length ? (
              <ul className="link-list">
                {res.links.map((l) => {
                  const d = byId[l.document_id];
                  if (!d) return null;
                  return (
                    <li key={l.document_id} className="link-item">
                      <div className="link-main">
                        <button type="button" className="link-doc" onClick={() => ctx.openDocument(d.id)}>
                          <Icon name="doc" size={16} /> <span className="truncate">{d.name}</span>
                        </button>
                        <span className="muted small">
                          {l.origin === 'user' ? 'Confirmé par vous' : `Proposé automatiquement — ${l.reason}`}
                          {l.origin === 'auto' && l.confidence !== 'high' ? ' (confiance moyenne)' : ''}
                        </span>
                      </div>
                      <div className="link-actions">
                        {l.origin === 'auto' ? (
                          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => this.link(d.id, 'confirmed', 'Rattachement confirmé.')}>
                            <Icon name="check" size={15} /> Confirmer
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => this.link(d.id, 'rejected', 'Pièce détachée de cette exigence.')}>
                          {l.origin === 'auto' ? 'Pas la bonne pièce' : 'Détacher'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">Aucune pièce rattachée.</p>
            )}
            {linkable.length ? (
              <label className="field">
                <span className="field-label">Rattacher une pièce existante</span>
                <select
                  value=""
                  disabled={!!busy}
                  onChange={(e: any) => e.target.value && this.link(e.target.value, 'confirmed', 'Pièce rattachée.')}
                >
                  <option value="">Choisir…</option>
                  {linkable.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.proof_type_label || 'type inconnu'})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {rejected.length ? (
              <p className="muted small">
                Écartée(s) pour cette exigence :{' '}
                {rejected.map((d, i) => (
                  <span key={d.id}>
                    {i ? ', ' : ''}
                    {d.name}{' '}
                    <button type="button" className="link-btn" disabled={!!busy} onClick={() => this.link(d.id, null, 'Décision annulée.')}>
                      rétablir
                    </button>
                  </span>
                ))}
              </p>
            ) : null}
            <button type="button" className="link-btn" onClick={() => ctx.go('pieces')}>
              <Icon name="upload" size={15} /> Importer une nouvelle pièce
            </button>
          </section>
        ) : (
          <section className="drawer-section">
            <h3 className="drawer-h">{r.kind === 'condition' ? 'Votre situation' : 'Respect de la règle'}</h3>
            {r.constraints.rule && res.status !== 'to_confirm' && !r.declared ? (
              <p className="muted">Résultat issu des contrôles automatiques sur vos pièces.</p>
            ) : null}
            <button
              type="button"
              className={cx('btn', r.declared ? 'btn-quiet' : 'btn-primary')}
              disabled={!!busy}
              onClick={() =>
                this.patch('declared', { declared: !r.declared }, r.declared ? 'Confirmation retirée.' : 'Confirmation enregistrée.')
              }
            >
              <Icon name={r.declared ? 'undo' : 'check'} size={16} />{' '}
              {r.declared ? 'Retirer ma confirmation' : r.kind === 'condition' ? 'Je confirme remplir cette condition' : 'Je confirme respecter cette règle'}
            </button>
            {r.constraints.rule && r.declared && res.status === 'problem' ? (
              <p className="field-error">Votre confirmation ne lève pas l’erreur détectée dans vos pièces : corrigez la pièce concernée.</p>
            ) : null}
          </section>
        )}

        <section className="drawer-section" aria-labelledby="src-h">
          <h3 id="src-h" className="drawer-h">
            Source
          </h3>
          {r.origin === 'manual' ? (
            <p className="muted">Exigence ajoutée par vous.</p>
          ) : (
            <div>
              <blockquote className="excerpt">{r.statement}</blockquote>
              <p className="muted small">
                {source ? `${source.name}, page ${r.source_page}` : 'Document d’appel retiré'}
                {r.section ? ` — section « ${r.section} »` : ''}. Retenue car : {r.reason || 'formulation obligatoire'}.
              </p>
              {source ? (
                <button type="button" className="link-btn" onClick={() => ctx.openDocument(source.id, r.source_page || undefined)}>
                  <Icon name="eye" size={15} /> Voir dans l’appel
                </button>
              ) : null}
            </div>
          )}
          {chips.length ? (
            <p className="chips-line">
              Contraintes repérées :{' '}
              {chips.map((c) => (
                <span key={c} className="flag">
                  {c}
                </span>
              ))}
            </p>
          ) : null}
        </section>

        <details className="drawer-section settings">
          <summary className="drawer-h">Corriger l’exigence</summary>
          <div className="form">
            <label className="field">
              <span className="field-label">Intitulé</span>
              <div className="field-row">
                <input type="text" value={this.state.label} maxLength={300} onChange={(e: any) => this.setState({ label: e.target.value })} />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!!busy || this.state.label.trim() === r.label || this.state.label.trim().length < 3}
                  onClick={() => this.patch('label', { label: this.state.label.trim(), reviewed: true }, 'Intitulé enregistré.')}
                >
                  Enregistrer
                </button>
              </div>
            </label>
            <label className="field">
              <span className="field-label">Nature</span>
              <select value={r.kind} disabled={!!busy} onChange={(e: any) => this.patch('kind', { kind: e.target.value }, 'Nature modifiée.')}>
                <option value="document">{KIND.document}</option>
                <option value="condition">{KIND.condition}</option>
                <option value="rule">{KIND.rule}</option>
              </select>
            </label>
            {r.kind === 'document' ? (
              <label className="field">
                <span className="field-label">Type de pièce attendu</span>
                <select
                  value={r.proof_type || ''}
                  disabled={!!busy}
                  onChange={(e: any) => this.patch('proof', { proof_type: e.target.value || null }, 'Type de pièce modifié.')}
                >
                  <option value="">Non précisé</option>
                  {st.proof_types
                    .filter((t) => t.code !== 'other')
                    .map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {r.kind === 'document' ? (
              <label className="field">
                <span className="field-label">Nombre de pièces distinctes demandées</span>
                <select value={String(r.min_count)} disabled={!!busy} onChange={(e: any) => this.patch('count', { min_count: Number(e.target.value) }, 'Nombre mis à jour.')}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={r.critical} disabled={!!busy} onChange={(e: any) => this.patch('critical', { critical: e.target.checked }, 'Priorité mise à jour.')} />
              Critique (dossier irrecevable sans elle)
            </label>
            <label className="check">
              <input type="checkbox" checked={!r.required} disabled={!!busy} onChange={(e: any) => this.patch('required', { required: !e.target.checked }, 'Exigence mise à jour.')} />
              Facultative (ne compte pas dans le pourcentage)
            </label>
            <label className="field">
              <span className="field-label">Note personnelle</span>
              <textarea rows={2} maxLength={2000} value={this.state.note} onChange={(e: any) => this.setState({ note: e.target.value })} />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!!busy || this.state.note === (r.note || '')}
              onClick={() => this.patch('note', { note: this.state.note }, 'Note enregistrée.')}
            >
              Enregistrer la note
            </button>
          </div>
        </details>
      </Modal>
    );
  }
}
