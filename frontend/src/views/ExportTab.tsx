import { api } from '../lib/api.js';
import { Icon } from '../components/ui.js';
import type { Ctx } from './Dossier.js';

export function ExportTab(props: { ctx: Ctx; onDeleteDossier: () => void }) {
  const st = props.ctx.state;
  const a = st.assessment;
  const id = st.dossier.id;
  const linkedDocs = new Set<string>();
  Object.keys(a.requirements).forEach((rid) => a.requirements[rid].links.forEach((l) => linkedDocs.add(l.document_id)));
  const pieces = st.documents.filter((d) => d.role === 'piece');
  const unlinked = pieces.filter((d) => !linkedDocs.has(d.id));
  return (
    <div className="export">
      {a.readiness.code !== 'ready' ? (
        <div className="notice" role="note">
          <Icon name="info" />
          <p>
            Le dossier n’est pas encore prêt ({a.readiness.label.toLowerCase()}). Vous pouvez exporter à tout moment : le rapport liste ce qui reste
            à faire et le paquet ne contient que les pièces rattachées.
          </p>
        </div>
      ) : null}
      <div className="export-grid">
        <article className="export-card">
          <h2 className="section-title small">Rapport de préparation (PDF)</h2>
          <p>État du dossier, checklist complète avec statut, pièce et page source de chaque exigence, contrôles et prochaines actions.</p>
          <a className="btn btn-primary" href={api.exportUrl(id, 'report.pdf')} download>
            <Icon name="download" /> Télécharger le rapport
          </a>
        </article>
        <article className="export-card">
          <h2 className="section-title small">Paquet de dépôt (ZIP)</h2>
          <p>
            Vos pièces renommées dans l’ordre de la checklist (« 01_Formulaire_de_candidature.pdf »…), le rapport et un manifeste avec l’empreinte
            SHA-256 de chaque fichier.
          </p>
          <a className="btn btn-secondary" href={api.exportUrl(id, 'package.zip')} download>
            <Icon name="download" /> Télécharger le paquet
          </a>
          {unlinked.length ? (
            <p className="muted small">
              {unlinked.length} pièce(s) non rattachée(s) ne seront pas incluses : {unlinked.map((d) => d.name).join(', ')}.
            </p>
          ) : null}
        </article>
        <article className="export-card">
          <h2 className="section-title small">Données (JSON)</h2>
          <p>Toutes les exigences, décisions, contrôles et l’historique des modifications, pour archivage ou réutilisation.</p>
          <a className="btn btn-secondary" href={api.exportUrl(id, 'data.json')} download>
            <Icon name="download" /> Exporter les données
          </a>
        </article>
      </div>
      <section className="danger-zone">
        <h2 className="section-title small">Effacer le dossier</h2>
        <p className="muted">Supprime le dossier, ses fichiers et son historique de cet ordinateur.</p>
        <button type="button" className="btn btn-danger-outline" onClick={props.onDeleteDossier}>
          <Icon name="trash" /> Supprimer ce dossier
        </button>
      </section>
    </div>
  );
}
