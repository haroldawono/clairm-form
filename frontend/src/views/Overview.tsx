import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
import { FACT_LABELS, factValue, STATUS } from '../lib/format.js';
import { L } from '../lib/i18n.js';
import type { Ctx } from './Dossier.js';
import type { Action, Status } from '../lib/types.js';

export function Overview(props: { ctx: Ctx }) {
  const { state, go } = props.ctx;
  const a = state.assessment;
  const calls = state.documents.filter((d) => d.role === 'call');
  const pieces = state.documents.filter((d) => d.role === 'piece');
  const facts = state.dossier.call_facts;

  if (!calls.length && !state.requirements.length) {
    return (
      <section className="onboard">
        <h2 className="section-title">{L('Commencez par l’appel à projets', 'Start with the call for proposals')}</h2>
        <ol className="steps steps-cards">
          <li className="step-now">
            <strong>{L('Importer le règlement de l’appel', 'Import the call for proposals')}</strong>
            <span>{L('PDF texte, Word ou .txt. ClairForm en extrait les pièces demandées, les conditions et les règles chiffrées.', 'Text PDF, Word or .txt. ClairForm extracts the required documents, conditions and numeric rules.')}</span>
            <button type="button" className="btn btn-primary" onClick={() => go('appel')}>
              <Icon name="upload" /> {L('Importer l’appel', 'Import the call')}
            </button>
          </li>
          <li>
            <strong>{L('Ajouter vos pièces', 'Add your documents')}</strong>
            <span>{L('Vous pouvez déjà les importer : elles seront rattachées dès que la checklist existera.', 'You can already import them: they will be linked as soon as the checklist exists.')}</span>
            <button type="button" className="btn btn-secondary" onClick={() => go('pieces')}>
              {L('Ajouter des pièces', 'Add documents')}
            </button>
          </li>
          <li>
            <strong>{L('Pas de règlement numérique ?', 'No digital copy of the rules?')}</strong>
            <span>{L('Saisissez les exigences à la main dans la checklist.', 'Type the requirements by hand in the checklist.')}</span>
            <button type="button" className="btn btn-secondary" onClick={() => go('checklist')}>
              {L('Ouvrir la checklist', 'Open the checklist')}
            </button>
          </li>
        </ol>
      </section>
    );
  }

  const actions = a.actions.slice(0, 6);
  return (
    <div className="overview">
      <section className="panel actions-panel" aria-labelledby="next">
        <div className="section-head">
          <h2 id="next" className="section-title">
            {L('Prochaines actions', 'Next actions')}
          </h2>
          {a.actions.length > 6 ? <span className="muted">{L(`${a.actions.length - 6} autre(s) dans la checklist`, `${a.actions.length - 6} more in the checklist`)}</span> : null}
        </div>
        {actions.length ? (
          <ol className="action-list">
            {actions.map((x) => (
              <ActionRow key={x.id} action={x} ctx={props.ctx} />
            ))}
          </ol>
        ) : (
          <p className="all-clear">
            <Icon name="check" />{' '}
            {L(
              'Toutes les exigences connues sont couvertes et aucun contrôle ne signale d’erreur. Relisez le règlement une dernière fois, puis exportez le dossier.',
              'All known requirements are covered and no check reports an error. Read the rules one last time, then export the application.',
            )}
          </p>
        )}
      </section>

      <aside className="overview-side">
        <section className="panel" aria-labelledby="facts">
          <h2 id="facts" className="section-title small">
            {L('Lu dans l’appel', 'Read from the call')}
          </h2>
          {facts.length ? (
            <dl className="facts">
              {facts.map((f) => (
                <div key={f.key} className="fact">
                  <dt>{FACT_LABELS[f.key] || f.key}</dt>
                  <dd>
                    <span className="fact-value">{factValue(f.key, f.value, f.currency)}</span>
                    <button type="button" className="source-link" onClick={() => props.ctx.openDocument(f.document_id, f.page)}>
                      p. {f.page}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">{L('Aucune date limite ni règle chiffrée n’a été repérée. Saisissez la date limite via « Modifier ».', 'No deadline or numeric rule was found. Enter the deadline with “Edit”.')}</p>
          )}
        </section>
        <section className="panel" aria-labelledby="dist">
          <h2 id="dist" className="section-title small">
            {L('Répartition', 'Breakdown')}
          </h2>
          <ul className="dist">
            {(['problem', 'missing', 'partial', 'to_verify', 'to_confirm', 'covered'] as Exclude<Status, 'ignored'>[]).map((s) => (
              <li key={s}>
                <button type="button" className="dist-row" onClick={() => go('checklist')} disabled={!a.counts[s]}>
                  <span className={`dot dot-${s}`} aria-hidden="true" />
                  <span>{STATUS[s].label}</span>
                  <strong>{a.counts[s] || 0}</strong>
                </button>
              </li>
            ))}
          </ul>
          <p className="fine">
            {L(
              `${pieces.length} pièce(s) importée(s). Le pourcentage pondère les exigences critiques double ; une pièce « à vérifier » compte pour moitié.`,
              `${pieces.length} document(s) imported. Critical requirements count double in the percentage; a document “to check” counts for half.`,
            )}
          </p>
        </section>
      </aside>
    </div>
  );
}

function ActionRow(props: { action: Action; ctx: Ctx }) {
  const x = props.action;
  const target = () => {
    if (x.requirement_id) props.ctx.openRequirement(x.requirement_id);
    else if (x.check_id) props.ctx.go('controles');
    else if (x.document_id) props.ctx.go('pieces');
  };
  return (
    <li className={cx('action', `verb-${x.verb.toLowerCase()}`)}>
      <span className="action-verb">{x.verb_label || x.verb}</span>
      <div className="action-body">
        <button type="button" className="action-title" onClick={target}>
          {x.title}
        </button>
        {x.detail ? <p className="action-detail">{x.detail}</p> : null}
      </div>
    </li>
  );
}
