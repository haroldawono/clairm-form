import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { constraintChips, KIND, STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
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
            {r.critical ? <span className="flag flag-critical">{L('critique', 'critical')}</span> : null}
            {!r.required ? <span className="flag">{L('facultatif', 'optional')}</span> : null}
          </span>
        }
        footer={[
          <button
            key="ignore"
            type="button"
            className="btn btn-quiet"
            disabled={!!busy}
            onClick={() => this.patch('status', { status: ignored ? 'active' : 'ignored' }, ignored ? L('Exigence réintégrée.', 'Requirement restored.') : L('Exigence écartée.', 'Requirement dismissed.'))}
          >
            <Icon name={ignored ? 'undo' : 'close'} size={16} /> {ignored ? L('Réintégrer', 'Restore') : L('Écarter (ne me concerne pas)', 'Dismiss (does not apply to me)')}
          </button>,
          r.origin === 'manual' ? (
            <button
              key="del"
              type="button"
              className="btn btn-quiet danger-text"
              disabled={!!busy}
              onClick={async () => {
                this.setState({ busy: 'delete' });
                const ok = await ctx.run(() => api.deleteRequirement(st.dossier.id, r.id), L('Exigence supprimée.', 'Requirement deleted.'));
                if (ok) this.props.onClose();
                else this.setState({ busy: null });
              }}
            >
              <Icon name="trash" size={16} /> {L('Supprimer', 'Delete')}
            </button>
          ) : null,
          <span key="sp" className="toolbar-spacer" />,
          <button key="close" type="button" className="btn btn-secondary" onClick={this.props.onClose}>
            {L('Terminé', 'Done')}
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
              {L('Pièces rattachées', 'Linked documents')} {r.min_count > 1 ? <span className="muted">{L(`(${r.min_count} distinctes demandées)`, `(${r.min_count} separate documents required)`)}</span> : null}
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
                          {l.origin === 'user' ? L('Confirmé par vous', 'Confirmed by you') : L(`Proposé automatiquement — ${l.reason}`, `Suggested automatically — ${l.reason}`)}
                          {l.origin === 'auto' && l.confidence !== 'high' ? L(' (confiance moyenne)', ' (medium confidence)') : ''}
                        </span>
                      </div>
                      <div className="link-actions">
                        {l.origin === 'auto' ? (
                          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => this.link(d.id, 'confirmed', L('Rattachement confirmé.', 'Link confirmed.'))}>
                            <Icon name="check" size={15} /> {L('Confirmer', 'Confirm')}
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => this.link(d.id, 'rejected', L('Pièce détachée de cette exigence.', 'Document unlinked from this requirement.'))}>
                          {l.origin === 'auto' ? L('Pas la bonne pièce', 'Wrong document') : L('Détacher', 'Unlink')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">{L('Aucune pièce rattachée.', 'No linked document.')}</p>
            )}
            {linkable.length ? (
              <label className="field">
                <span className="field-label">{L('Rattacher une pièce existante', 'Link an existing document')}</span>
                <select
                  value=""
                  disabled={!!busy}
                  onChange={(e: any) => e.target.value && this.link(e.target.value, 'confirmed', L('Pièce rattachée.', 'Document linked.'))}
                >
                  <option value="">{L('Choisir…', 'Choose…')}</option>
                  {linkable.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.proof_type_label || L('type inconnu', 'unknown type')})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {rejected.length ? (
              <p className="muted small">
                {L('Écartée(s) pour cette exigence :', 'Rejected for this requirement:')}{' '}
                {rejected.map((d, i) => (
                  <span key={d.id}>
                    {i ? ', ' : ''}
                    {d.name}{' '}
                    <button type="button" className="link-btn" disabled={!!busy} onClick={() => this.link(d.id, null, L('Décision annulée.', 'Decision undone.'))}>
                      {L('rétablir', 'restore')}
                    </button>
                  </span>
                ))}
              </p>
            ) : null}
            <button type="button" className="link-btn" onClick={() => ctx.go('pieces')}>
              <Icon name="upload" size={15} /> {L('Importer une nouvelle pièce', 'Import a new document')}
            </button>
          </section>
        ) : (
          <section className="drawer-section">
            <h3 className="drawer-h">{r.kind === 'condition' ? L('Votre situation', 'Your situation') : L('Respect de la règle', 'Compliance with the rule')}</h3>
            {r.constraints.rule && res.status !== 'to_confirm' && !r.declared ? (
              <p className="muted">{L('Résultat issu des contrôles automatiques sur vos pièces.', 'Result based on the automatic checks of your documents.')}</p>
            ) : null}
            <button
              type="button"
              className={cx('btn', r.declared ? 'btn-quiet' : 'btn-primary')}
              disabled={!!busy}
              onClick={() =>
                this.patch('declared', { declared: !r.declared }, r.declared ? L('Confirmation retirée.', 'Confirmation withdrawn.') : L('Confirmation enregistrée.', 'Confirmation saved.'))
              }
            >
              <Icon name={r.declared ? 'undo' : 'check'} size={16} />{' '}
              {r.declared ? L('Retirer ma confirmation', 'Withdraw my confirmation') : r.kind === 'condition' ? L('Je confirme remplir cette condition', 'I confirm I meet this condition') : L('Je confirme respecter cette règle', 'I confirm I follow this rule')}
            </button>
            {r.constraints.rule && r.declared && res.status === 'problem' ? (
              <p className="field-error">{L('Votre confirmation ne lève pas l’erreur détectée dans vos pièces : corrigez la pièce concernée.', 'Your confirmation does not clear the error found in your documents: fix the document concerned.')}</p>
            ) : null}
          </section>
        )}

        <section className="drawer-section" aria-labelledby="src-h">
          <h3 id="src-h" className="drawer-h">
            {L('Source', 'Source')}
          </h3>
          {r.origin === 'manual' ? (
            <p className="muted">{L('Exigence ajoutée par vous.', 'Requirement added by you.')}</p>
          ) : (
            <div>
              <blockquote className="excerpt">{r.statement}</blockquote>
              <p className="muted small">
                {source ? `${source.name}, page ${r.source_page}` : L('Document d’appel retiré', 'Call document removed')}
                {r.section ? L(` — section « ${r.section} »`, ` — section “${r.section}”`) : ''}. {L('Retenue car :', 'Kept because:')} {r.reason || L('formulation obligatoire', 'mandatory wording')}.
              </p>
              {source ? (
                <button type="button" className="link-btn" onClick={() => ctx.openDocument(source.id, r.source_page || undefined)}>
                  <Icon name="eye" size={15} /> {L('Voir dans l’appel', 'See in the call')}
                </button>
              ) : null}
            </div>
          )}
          {chips.length ? (
            <p className="chips-line">
              {L('Contraintes repérées :', 'Constraints found:')}{' '}
              {chips.map((c) => (
                <span key={c} className="flag">
                  {c}
                </span>
              ))}
            </p>
          ) : null}
        </section>

        <details className="drawer-section settings">
          <summary className="drawer-h">{L('Corriger l’exigence', 'Correct the requirement')}</summary>
          <div className="form">
            <label className="field">
              <span className="field-label">{L('Intitulé', 'Title')}</span>
              <div className="field-row">
                <input type="text" value={this.state.label} maxLength={300} onChange={(e: any) => this.setState({ label: e.target.value })} />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!!busy || this.state.label.trim() === r.label || this.state.label.trim().length < 3}
                  onClick={() => this.patch('label', { label: this.state.label.trim(), reviewed: true }, L('Intitulé enregistré.', 'Title saved.'))}
                >
                  {L('Enregistrer', 'Save')}
                </button>
              </div>
            </label>
            <label className="field">
              <span className="field-label">{L('Nature', 'Kind')}</span>
              <select value={r.kind} disabled={!!busy} onChange={(e: any) => this.patch('kind', { kind: e.target.value }, L('Nature modifiée.', 'Kind changed.'))}>
                <option value="document">{KIND.document}</option>
                <option value="condition">{KIND.condition}</option>
                <option value="rule">{KIND.rule}</option>
              </select>
            </label>
            {r.kind === 'document' ? (
              <label className="field">
                <span className="field-label">{L('Type de pièce attendu', 'Expected document type')}</span>
                <select
                  value={r.proof_type || ''}
                  disabled={!!busy}
                  onChange={(e: any) => this.patch('proof', { proof_type: e.target.value || null }, L('Type de pièce modifié.', 'Document type changed.'))}
                >
                  <option value="">{L('Non précisé', 'Not specified')}</option>
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
                <span className="field-label">{L('Nombre de pièces distinctes demandées', 'Number of separate documents required')}</span>
                <select value={String(r.min_count)} disabled={!!busy} onChange={(e: any) => this.patch('count', { min_count: Number(e.target.value) }, L('Nombre mis à jour.', 'Number updated.'))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={r.critical} disabled={!!busy} onChange={(e: any) => this.patch('critical', { critical: e.target.checked }, L('Priorité mise à jour.', 'Priority updated.'))} />
              {L('Critique (dossier irrecevable sans elle)', 'Critical (application rejected without it)')}
            </label>
            <label className="check">
              <input type="checkbox" checked={!r.required} disabled={!!busy} onChange={(e: any) => this.patch('required', { required: !e.target.checked }, L('Exigence mise à jour.', 'Requirement updated.'))} />
              {L('Facultative (ne compte pas dans le pourcentage)', 'Optional (not counted in the percentage)')}
            </label>
            <label className="field">
              <span className="field-label">{L('Note personnelle', 'Personal note')}</span>
              <textarea rows={2} maxLength={2000} value={this.state.note} onChange={(e: any) => this.setState({ note: e.target.value })} />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!!busy || this.state.note === (r.note || '')}
              onClick={() => this.patch('note', { note: this.state.note }, L('Note enregistrée.', 'Note saved.'))}
            >
              {L('Enregistrer la note', 'Save the note')}
            </button>
          </div>
        </details>
      </Modal>
    );
  }
}
