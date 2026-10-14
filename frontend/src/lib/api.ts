import type { DossierState, DossierSummary, DocumentInfo } from './types.js';

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
  }
}

const NETWORK_MESSAGE =
  'Impossible de joindre ClairForm. Vérifiez que le serveur local est toujours lancé (python scripts/run.py), puis réessayez.';

function parseBody(text: string, status: number): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(
      status >= 500
        ? 'Le serveur a renvoyé une erreur illisible. Relancez ClairForm puis réessayez.'
        : 'Réponse inattendue du serveur (format invalide).',
      'BAD-RESPONSE',
      status,
    );
  }
}

function toError(status: number, body: any): ApiError {
  const err = body && body.error;
  if (err && typeof err.message === 'string') return new ApiError(err.message, String(err.code || 'ERROR'), status);
  if (status === 413) return new ApiError('Le fichier est trop volumineux.', 'DOC-TOO-LARGE', status);
  if (status >= 500) return new ApiError('Erreur interne du serveur. Réessayez ; si elle persiste, consultez le terminal de ClairForm.', 'INTERNAL', status);
  return new ApiError(`La demande a échoué (code ${status}).`, 'HTTP', status);
}

export async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? { 'X-ClairForm': '1' } : { 'X-ClairForm': '1', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 'NETWORK', 0);
  }
  const text = await response.text();
  const data = parseBody(text, response.status);
  if (!response.ok) throw toError(response.status, data);
  return data as T;
}

function expectState(data: any): DossierState {
  if (!data || !data.state || !data.state.dossier || !data.state.assessment) {
    throw new ApiError('Réponse incomplète du serveur : l’état du dossier est absent.', 'BAD-RESPONSE', 200);
  }
  return data.state as DossierState;
}

const D = (id: string) => `/api/dossiers/${encodeURIComponent(id)}`;

export const api = {
  health: () => request<{ status: string; version: string; mode: string; problems: string[]; retention_days: number | null }>('GET', '/api/health'),
  list: async (): Promise<DossierSummary[]> => {
    const data = await request('GET', '/api/dossiers');
    if (!data || !Array.isArray(data.dossiers)) throw new ApiError('Réponse inattendue du serveur.', 'BAD-RESPONSE', 200);
    return data.dossiers;
  },
  create: async (title: string, program: string, deadline: string | null) =>
    expectState(await request('POST', '/api/dossiers', { title, program, deadline })),
  demo: async () => expectState(await request('POST', '/api/demo')),
  get: async (id: string) => expectState(await request('GET', D(id))),
  patch: async (id: string, fields: Record<string, unknown>) => expectState(await request('PATCH', D(id), fields)),
  remove: (id: string) => request('DELETE', D(id)),
  docText: (id: string, docId: string) =>
    request<{ id: string; name: string; role: string; has_text: boolean; pages: { n: number; text: string }[] }>(
      'GET',
      `${D(id)}/documents/${docId}/text`,
    ),
  setDocType: async (id: string, docId: string, proof_type: string) =>
    expectState(await request('PATCH', `${D(id)}/documents/${docId}`, { proof_type })),
  deleteDoc: async (id: string, docId: string) => expectState(await request('DELETE', `${D(id)}/documents/${docId}`)),
  addRequirement: async (id: string, body: Record<string, unknown>) => expectState(await request('POST', `${D(id)}/requirements`, body)),
  patchRequirement: async (id: string, rid: string, body: Record<string, unknown>) =>
    expectState(await request('PATCH', `${D(id)}/requirements/${rid}`, body)),
  deleteRequirement: async (id: string, rid: string) => expectState(await request('DELETE', `${D(id)}/requirements/${rid}`)),
  setLink: async (id: string, rid: string, docId: string, decision: 'confirmed' | 'rejected' | null) =>
    expectState(await request('PUT', `${D(id)}/requirements/${rid}/links/${docId}`, { decision })),
  cancelUpload: async (id: string, uploadId: string) => expectState(await request('POST', `${D(id)}/uploads/${uploadId}/cancel`)),
  fileUrl: (id: string, docId: string) => `${D(id)}/documents/${docId}/file`,
  exportUrl: (id: string, kind: 'report.pdf' | 'package.zip' | 'data.json') => `${D(id)}/export/${kind}`,
};

export interface UploadHandle {
  promise: Promise<{ document: DocumentInfo; state: DossierState }>;
  uploadId: string;
  abort(): void;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Upload one file as a raw body, reporting byte progress. Cancelling aborts the transfer itself. */
export function upload(
  dossierId: string,
  role: 'call' | 'piece',
  file: File,
  onProgress: (fraction: number) => void,
  onSent: () => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const uploadId = randomId();
  const promise = new Promise<{ document: DocumentInfo; state: DossierState }>((resolve, reject) => {
    xhr.open('POST', `${D(dossierId)}/documents?role=${role}&upload_id=${uploadId}&filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('X-ClairForm', '1');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => onSent();
    xhr.onerror = () => reject(new ApiError(NETWORK_MESSAGE, 'NETWORK', 0));
    xhr.onabort = () => reject(new ApiError('Import annulé.', 'ABORTED', 0));
    xhr.ontimeout = () => reject(new ApiError('Le serveur met trop de temps à répondre.', 'TIMEOUT', 0));
    xhr.onload = () => {
      try {
        const data = parseBody(xhr.responseText, xhr.status);
        if (xhr.status < 200 || xhr.status >= 300) return reject(toError(xhr.status, data));
        const state = expectState(data);
        if (!data.document) return reject(new ApiError('Réponse incomplète du serveur.', 'BAD-RESPONSE', xhr.status));
        resolve({ document: data.document, state });
      } catch (err) {
        reject(err);
      }
    };
    xhr.timeout = 180000;
    xhr.send(file);
  });
  return { promise, uploadId, abort: () => xhr.abort() };
}
