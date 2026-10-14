import { Component, cx } from '../lib/react.js';
import { api } from '../lib/api.js';
import { ACCEPT_PIECES, amount, dateShort, size } from '../lib/format.js';
import { Icon } from '../components/ui.js';
import { Uploader } from '../components/Uploader.js';
import type { Ctx } from './Dossier.js';
import type { DocumentInfo } from '../lib/types.js';

export class Pieces extends Component<{ ctx: Ctx }, { busy: string | null }> {
  state = { busy: null as string | null };

  setType = async (doc: DocumentInfo, code: string) => {
    this.setState({ busy: doc.id });
    const label = this.props.ctx.state.proof_types.find((t) => t.code === code);
    await this.props.ctx.run(() => api.setDocType(this.props.ctx.state.dossier.id, doc.id, code), `« ${doc.name} » classé comme ${label ? label.label : code}.`);
    this.setState({ busy: null });
  };

  render() {
    const { ctx } = this.props;
    const st = ctx.state;
    const pieces = st.documents.filter((d) => d.role === 'piece');
    const reqLabel: Record<string, string> = {};
    st.requirements.forEach((r) => (reqLabel[r.id] = r.label));
    const usage: Record<string, string[]> = {};
    Object.keys(st.assessment.requirements).forEach((rid) =>
      st.assessment.requirements[rid].links.forEach((l) => (usage[l.document_id] = (usage[l.document_id] || []).concat(rid))),
    );
    const checksByDoc: Record<string, typeof st.assessment.checks> = {};
    st.assessment.checks.forEach((c) => c.document_id && (checksByDoc[c.document_id] = (checksByDoc[c.document_id] || []).concat(c)));

    return (
      <div className="pieces">
        <Uploader
          ctx={ctx}
          role="piece"
          accept={ACCEPT_PIECES}
          multiple
          title="Ajouter vos pièces"
          hint="Glissez-déposez plusieurs fichiers : PDF, Word, Excel, CSV, texte, ou photos (JPG, PNG) — 20 Mo max. par fichier."
        />
        {!pieces.length ? (
          <div className="empty">
            <p>Aucune pièce pour l’instant.</p>
            <p className="muted">Chaque fichier est lu localement, son type est reconnu, puis il est rattaché à l’exigence correspondante.</p>
          </div>
        ) : (
          <ul className="piece-list">
            {pieces.map((d) => {
              const used = usage[d.id] || [];
              const issues = (checksByDoc[d.id] || []).filter((c) => c.severity !== 'info');
              const f = d.facts || {};
              const facts: string[] = [];
              if (d.page_count) facts.push(`${d.page_count} page${d.page_count > 1 ? 's' : ''}`);
              if (f.issue_date) facts.push(`daté du ${dateShort(f.issue_date)}`);
              if (f.expiry_date) facts.push(`expire le ${dateShort(f.expiry_date)}`);
              if (f.budget && f.budget.expense_total) facts.push(`total ${amount(f.budget.expense_total, f.budget.currency)}`);
              if (f.budget && f.budget.requested) facts.push(`demandé ${amount(f.budget.requested.amount, f.budget.currency)}`);
              else if (f.requested_amount) facts.push(`demandé ${amount(f.requested_amount.amount, f.requested_amount.currency)}`);
              if (f.timeline) facts.push(`${dateShort(f.timeline.start)} → ${dateShort(f.timeline.end)}`);
              if (!d.has_text) facts.push('aucun texte lisible');
              const typeId = `type-${d.id}`;
              return (
                <li key={d.id} className={cx('piece', issues.some((c) => c.severity === 'error') && 'piece-error')}>
                  <div className="piece-head">
                    <button type="button" className="piece-name" onClick={() => ctx.openDocument(d.id)}>
                      <Icon name="doc" /> <span className="truncate">{d.name}</span>
                    </button>
                    <span className="muted small nowrap">
                      {d.ext.toUpperCase()} · {size(d.size)}
                    </span>
                    <span className="toolbar-spacer" />
                    <a className="icon-btn" href={api.fileUrl(st.dossier.id, d.id)} download aria-label={`Télécharger ${d.name}`}>
                      <Icon name="download" />
                    </a>
                    <button type="button" className="icon-btn danger-hover" aria-label={`Supprimer ${d.name}`} onClick={() => ctx.askDeleteDocument(d.id)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                  <div className="piece-body">
                    <div className="piece-type">
                      <label htmlFor={typeId} className="field-label-inline">
                        Type
                      </label>
                      <select id={typeId} value={d.proof_type || 'other'} disabled={this.state.busy === d.id} onChange={(e: any) => this.setType(d, e.target.value)}>
                        {st.proof_types.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <span className={cx('confidence', `conf-${d.proof_type_source === 'user' ? 'user' : d.proof_confidence}`)}>
                        {d.proof_type_source === 'user'
                          ? 'choisi par vous'
                          : d.proof_type === 'other'
                          ? 'non reconnu'
                          : d.proof_confidence === 'high'
                          ? 'reconnu'
                          : 'à vérifier'}
                      </span>
                    </div>
                    {d.proof_type_source !== 'user' && d.proof_confidence !== 'high' && d.proof_reasons.length ? <p className="muted small">Indices : {d.proof_reasons.join(' ; ')}</p> : null}
                    {facts.length ? <p className="piece-facts">{facts.join(' · ')}</p> : null}
                    <p className="piece-usage">
                      {used.length ? (
                        <span>
                          Couvre :{' '}
                          {used.map((rid, i) => (
                            <span key={rid}>
                              {i ? ', ' : ''}
                              <button type="button" className="link-btn" onClick={() => ctx.openRequirement(rid)}>
                                {reqLabel[rid]}
                              </button>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">Rattachée à aucune exigence.</span>
                      )}
                    </p>
                    {issues.length ? (
                      <ul className="check-list compact">
                        {issues.map((c) => (
                          <li key={c.id} className={cx('check-item', `sev-${c.severity}`)}>
                            <Icon name="alert" size={16} />
                            <div>
                              <strong>{c.title}</strong>
                              <p>{c.detail}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
}
