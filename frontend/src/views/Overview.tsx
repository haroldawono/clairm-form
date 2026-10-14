import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
import { FACT_LABELS, factValue, STATUS } from '../lib/format.js';
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
        <h2 className="section-title">Commencez par l’appel à projets</h2>
        <ol className="steps steps-cards">
          <li className="step-now">
            <strong>Importer le règlement de l’appel</strong>
            <span>PDF texte, Word ou .txt. ClairForm en extrait les pièces demandées, les conditions et les règles chiffrées.</span>
            <button type="button" className="btn btn-primary" onClick={() => go('appel')}>
              <Icon name="upload" /> Importer l’appel
            </button>
          </li>
          <li>
            <strong>Ajouter vos pièces</strong>
            <span>Vous pouvez déjà les importer : elles seront rattachées dès que la checklist existera.</span>
            <button type="button" className="btn btn-secondary" onClick={() => go('pieces')}>
              Ajouter des pièces
            </button>
          </li>
          <li>
            <strong>Pas de règlement numérique ?</strong>
            <span>Saisissez les exigences à la main dans la checklist.</span>
            <button type="button" className="btn btn-secondary" onClick={() => go('checklist')}>
              Ouvrir la checklist
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
            Prochaines actions
          </h2>
          {a.actions.length > 6 ? <span className="muted">{a.actions.length - 6} autre(s) dans la checklist</span> : null}
        </div>
        {actions.length ? (
          <ol className="action-list">
            {actions.map((x) => (
              <ActionRow key={x.id} action={x} ctx={props.ctx} />
            ))}
          </ol>
        ) : (
          <p className="all-clear">
            <Icon name="check" /> Toutes les exigences connues sont couvertes et aucun contrôle ne signale d’erreur. Relisez le règlement une
            dernière fois, puis exportez le dossier.
          </p>
        )}
      </section>

      <aside className="overview-side">
        <section className="panel" aria-labelledby="facts">
          <h2 id="facts" className="section-title small">
            Lu dans l’appel
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
            <p className="muted">Aucune date limite ni règle chiffrée n’a été repérée. Saisissez la date limite via « Modifier ».</p>
          )}
        </section>
        <section className="panel" aria-labelledby="dist">
          <h2 id="dist" className="section-title small">
            Répartition
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
            {pieces.length} pièce(s) importée(s). Le pourcentage pondère les exigences critiques double ; une pièce « à vérifier » compte pour
            moitié.
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
      <span className="action-verb">{x.verb}</span>
      <div className="action-body">
        <button type="button" className="action-title" onClick={target}>
          {x.title}
        </button>
        {x.detail ? <p className="action-detail">{x.detail}</p> : null}
      </div>
    </li>
  );
}
