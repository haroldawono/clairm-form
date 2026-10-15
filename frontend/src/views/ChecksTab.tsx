import { cx } from '../lib/react.js';
import { Icon } from '../components/ui.js';
import { L } from '../lib/i18n.js';
import type { Ctx } from './Dossier.js';
import type { Check } from '../lib/types.js';

const GROUPS: { sev: Check['severity']; title: string; empty: string }[] = [
  { sev: 'error', title: L('À corriger', 'To fix'), empty: L('Aucune erreur détectée.', 'No errors found.') },
  { sev: 'warning', title: L('À vérifier', 'To check'), empty: L('Aucun point d’attention.', 'Nothing to check.') },
  { sev: 'info', title: L('Pour information', 'For information'), empty: '' },
];

export function ChecksTab(props: { ctx: Ctx }) {
  const { ctx } = props;
  const st = ctx.state;
  const docs: Record<string, string> = {};
  st.documents.forEach((d) => (docs[d.id] = d.name));
  const reqs: Record<string, string> = {};
  st.requirements.forEach((r) => (reqs[r.id] = r.label));
  const checks = st.assessment.checks;
  return (
    <div className="checks">
      <p className="intro-note">
        {L(
          'ClairForm recalcule ces contrôles à chaque changement : totaux et lignes du budget, plafond et cofinancement exigés par l’appel, durée du calendrier, validité et ancienneté des pièces, nombre de pages, signatures, doublons. Chaque résultat cite la pièce et, si possible, la phrase du règlement concernée.',
          'ClairForm recalculates these checks after every change: budget totals and lines, cap and co-funding required by the call, timeline length, validity and age of documents, page counts, signatures, duplicates. Each result cites the document and, when possible, the sentence of the rules concerned.',
        )}
      </p>
      {!checks.length ? (
        <div className="empty">
          <p>{L('Aucun contrôle à signaler pour le moment.', 'Nothing to report for now.')}</p>
          <p className="muted">{L('Les contrôles portent sur les pièces importées : ajoutez budget, calendrier et justificatifs pour qu’ils s’appliquent.', 'Checks apply to imported documents: add the budget, timeline and supporting documents for them to run.')}</p>
        </div>
      ) : null}
      {checks.length
        ? GROUPS.map((g) => {
            const list = checks.filter((c) => c.severity === g.sev);
            if (!list.length) return null;
            return (
              <section key={g.sev} className="check-group" aria-label={g.title}>
                <h2 className="group-title">
                  {g.title} <span className="muted">{list.length}</span>
                </h2>
                <ul className="check-list">
                  {list.map((c) => (
                    <li key={c.id} className={cx('check-item', `sev-${c.severity}`)}>
                      <Icon name={c.severity === 'info' ? 'info' : 'alert'} />
                      <div className="check-body">
                        <strong>{c.title}</strong>
                        <p>{c.detail}</p>
                        {c.source && c.source.excerpt ? (
                          <blockquote className="excerpt small">
                            {L('«\u00a0', '“')}{c.source.excerpt}{L('\u00a0»', '”')}{' '}
                            <button type="button" className="source-link" onClick={() => ctx.openDocument(c.source!.document_id, c.source!.page)}>
                              {L('appel', 'call')}, p. {c.source.page}
                            </button>
                          </blockquote>
                        ) : null}
                        <div className="check-links">
                          {c.requirement_id && reqs[c.requirement_id] ? (
                            <button type="button" className="link-btn" onClick={() => ctx.openRequirement(c.requirement_id as string)}>
                              {L('Exigence :', 'Requirement:')} {reqs[c.requirement_id]}
                            </button>
                          ) : null}
                          {c.document_id && docs[c.document_id] ? (
                            <button type="button" className="link-btn" onClick={() => ctx.openDocument(c.document_id as string)}>
                              {L('Pièce :', 'Document:')} {docs[c.document_id]}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        : null}
    </div>
  );
}
