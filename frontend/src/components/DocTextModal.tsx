import { Component, cx } from '../lib/react.js';
import { api, ApiError } from '../lib/api.js';
import { Icon, Modal, Spinner } from './ui.js';
import { segment } from './highlight.js';
import { L } from '../lib/i18n.js';
import type { DossierState } from '../lib/types.js';

interface Props {
  dossierId: string;
  docId: string;
  page?: number;
  state: DossierState;
  onClose: () => void;
  onOpenRequirement: (rid: string) => void;
}

interface State {
  pages: { n: number; text: string }[] | null;
  name: string;
  hasText: boolean;
  error: string | null;
}

export class DocTextModal extends Component<Props, State> {
  state: State = { pages: null, name: '', hasText: true, error: null };
  private body: HTMLElement | null = null;

  componentDidMount() {
    this.load();
  }

  load() {
    this.setState({ error: null, pages: null });
    api
      .docText(this.props.dossierId, this.props.docId)
      .then((res) => {
        this.setState({ pages: res.pages, name: res.name, hasText: res.has_text }, () => {
          if (this.props.page && this.body) {
            const el = this.body.querySelector(`[data-page="${this.props.page}"]`);
            if (el) el.scrollIntoView({ block: 'start' });
          }
        });
      })
      .catch((err: ApiError) => this.setState({ error: err.message }));
  }

  render() {
    const doc = this.props.state.documents.find((d) => d.id === this.props.docId);
    const reqs = this.props.state.requirements.filter((r) => r.source_doc_id === this.props.docId);
    return (
      <Modal
        variant="wide"
        title={doc ? doc.name : this.state.name || 'Document'}
        subtitle={doc ? (doc.role === 'call' ? L('Texte extrait de l’appel — les passages surlignés sont des exigences', 'Text extracted from the call — highlighted passages are requirements') : L('Texte extrait de la pièce', 'Text extracted from the document')) : null}
        onClose={this.props.onClose}
        footer={[
          doc ? (
            <a key="dl" className="btn btn-secondary" href={api.fileUrl(this.props.dossierId, this.props.docId)} download>
              <Icon name="download" /> {L('Télécharger l’original', 'Download the original')}
            </a>
          ) : null,
          <span key="sp" className="toolbar-spacer" />,
          <button key="c" type="button" className="btn btn-primary" onClick={this.props.onClose}>
            {L('Terminé', 'Done')}
          </button>,
        ]}
      >
        <div ref={(el: HTMLElement | null) => (this.body = el)} className="doc-text">
          {this.state.error ? (
            <div className="inline-error" role="alert">
              <Icon name="alert" /> <span>{this.state.error}</span>
              <button type="button" className="btn btn-quiet" onClick={() => this.load()}>
                {L('Réessayer', 'Try again')}
              </button>
            </div>
          ) : null}
          {!this.state.pages && !this.state.error ? <Spinner label={L('Chargement du texte…', 'Loading the text…')} /> : null}
          {this.state.pages && !this.state.hasText ? (
            <p className="muted">
              {L(
                'Aucun texte lisible dans ce fichier (scan ou image). Téléchargez l’original pour le consulter ; son type peut être choisi dans l’onglet Pièces.',
                'No readable text in this file (scan or image). Download the original to view it; its type can be chosen in the Documents tab.',
              )}
            </p>
          ) : null}
          {this.state.pages && this.state.hasText
            ? this.state.pages.map((p) => (
                <article key={p.n} data-page={p.n} className={cx('page', this.props.page === p.n && 'page-target')}>
                  <div className="page-num">p. {p.n}</div>
                  <div className="page-text">
                    {segment(
                      p.text,
                      reqs.filter((r) => r.source_page === p.n).reduce((acc: { id: string; excerpt: string }[], r) => acc.concat([r.excerpt].concat(r.statement.split('\n').slice(1)).map((x) => ({ id: r.id, excerpt: x }))), []),
                    ).map((seg, i) =>
                      seg.ids ? (
                        <mark
                          key={i}
                          role="button"
                          tabIndex={0}
                          className="hl"
                          onClick={() => this.props.onOpenRequirement((seg.ids as string[])[0])}
                          onKeyDown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), this.props.onOpenRequirement((seg.ids as string[])[0]))}
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </div>
                </article>
              ))
            : null}
        </div>
      </Modal>
    );
  }
}
