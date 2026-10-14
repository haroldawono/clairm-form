export class ApiError extends Error {
    constructor(message, code, status) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
const NETWORK_MESSAGE = 'Impossible de joindre ClairForm. Vérifiez que le serveur local est toujours lancé (python scripts/run.py), puis réessayez.';
function parseBody(text, status) {
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        throw new ApiError(status >= 500
            ? 'Le serveur a renvoyé une erreur illisible. Relancez ClairForm puis réessayez.'
            : 'Réponse inattendue du serveur (format invalide).', 'BAD-RESPONSE', status);
    }
}
function toError(status, body) {
    const err = body && body.error;
    if (err && typeof err.message === 'string')
        return new ApiError(err.message, String(err.code || 'ERROR'), status);
    if (status === 413)
        return new ApiError('Le fichier est trop volumineux.', 'DOC-TOO-LARGE', status);
    if (status >= 500)
        return new ApiError('Erreur interne du serveur. Réessayez ; si elle persiste, consultez le terminal de ClairForm.', 'INTERNAL', status);
    return new ApiError(`La demande a échoué (code ${status}).`, 'HTTP', status);
}
export async function request(method, path, body) {
    let response;
    try {
        response = await fetch(path, {
            method,
            headers: body === undefined ? { 'X-ClairForm': '1' } : { 'X-ClairForm': '1', 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin',
        });
    }
    catch {
        throw new ApiError(NETWORK_MESSAGE, 'NETWORK', 0);
    }
    const text = await response.text();
    const data = parseBody(text, response.status);
    if (!response.ok)
        throw toError(response.status, data);
    return data;
}
function expectState(data) {
    if (!data || !data.state || !data.state.dossier || !data.state.assessment) {
        throw new ApiError('Réponse incomplète du serveur : l’état du dossier est absent.', 'BAD-RESPONSE', 200);
    }
    return data.state;
}
const D = (id) => `/api/dossiers/${encodeURIComponent(id)}`;
export const api = {
    health: () => request('GET', '/api/health'),
    list: async () => {
        const data = await request('GET', '/api/dossiers');
        if (!data || !Array.isArray(data.dossiers))
            throw new ApiError('Réponse inattendue du serveur.', 'BAD-RESPONSE', 200);
        return data.dossiers;
    },
    create: async (title, program, deadline) => expectState(await request('POST', '/api/dossiers', { title, program, deadline })),
    demo: async () => expectState(await request('POST', '/api/demo')),
    get: async (id) => expectState(await request('GET', D(id))),
    patch: async (id, fields) => expectState(await request('PATCH', D(id), fields)),
    remove: (id) => request('DELETE', D(id)),
    docText: (id, docId) => request('GET', `${D(id)}/documents/${docId}/text`),
    setDocType: async (id, docId, proof_type) => expectState(await request('PATCH', `${D(id)}/documents/${docId}`, { proof_type })),
    deleteDoc: async (id, docId) => expectState(await request('DELETE', `${D(id)}/documents/${docId}`)),
    addRequirement: async (id, body) => expectState(await request('POST', `${D(id)}/requirements`, body)),
    patchRequirement: async (id, rid, body) => expectState(await request('PATCH', `${D(id)}/requirements/${rid}`, body)),
    deleteRequirement: async (id, rid) => expectState(await request('DELETE', `${D(id)}/requirements/${rid}`)),
    setLink: async (id, rid, docId, decision) => expectState(await request('PUT', `${D(id)}/requirements/${rid}/links/${docId}`, { decision })),
    cancelUpload: async (id, uploadId) => expectState(await request('POST', `${D(id)}/uploads/${uploadId}/cancel`)),
    fileUrl: (id, docId) => `${D(id)}/documents/${docId}/file`,
    exportUrl: (id, kind) => `${D(id)}/export/${kind}`,
};
function randomId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
/** Upload one file as a raw body, reporting byte progress. Cancelling aborts the transfer itself. */
export function upload(dossierId, role, file, onProgress, onSent) {
    const xhr = new XMLHttpRequest();
    const uploadId = randomId();
    const promise = new Promise((resolve, reject) => {
        xhr.open('POST', `${D(dossierId)}/documents?role=${role}&upload_id=${uploadId}&filename=${encodeURIComponent(file.name)}`);
        xhr.setRequestHeader('X-ClairForm', '1');
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
                onProgress(e.loaded / e.total);
        };
        xhr.upload.onload = () => onSent();
        xhr.onerror = () => reject(new ApiError(NETWORK_MESSAGE, 'NETWORK', 0));
        xhr.onabort = () => reject(new ApiError('Import annulé.', 'ABORTED', 0));
        xhr.ontimeout = () => reject(new ApiError('Le serveur met trop de temps à répondre.', 'TIMEOUT', 0));
        xhr.onload = () => {
            try {
                const data = parseBody(xhr.responseText, xhr.status);
                if (xhr.status < 200 || xhr.status >= 300)
                    return reject(toError(xhr.status, data));
                const state = expectState(data);
                if (!data.document)
                    return reject(new ApiError('Réponse incomplète du serveur.', 'BAD-RESPONSE', xhr.status));
                resolve({ document: data.document, state });
            }
            catch (err) {
                reject(err);
            }
        };
        xhr.timeout = 180000;
        xhr.send(file);
    });
    return { promise, uploadId, abort: () => xhr.abort() };
}
