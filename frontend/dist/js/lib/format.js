export const STATUS = {
    covered: { label: 'Couvert', hint: 'Une pièce ou une confirmation répond à cette exigence.' },
    to_verify: { label: 'À vérifier', hint: 'Une pièce a été rattachée automatiquement : confirmez-la.' },
    partial: { label: 'Incomplet', hint: 'Il manque des pièces distinctes.' },
    missing: { label: 'Manquant', hint: 'Aucune pièce ne répond encore à cette exigence.' },
    problem: { label: 'Problème', hint: 'Un contrôle a détecté un point à corriger.' },
    to_confirm: { label: 'À confirmer', hint: 'Condition ou règle à confirmer par vous.' },
    ignored: { label: 'Écartée', hint: 'Non prise en compte.' },
};
export const KIND = { document: 'Pièce à fournir', condition: "Condition d'éligibilité", rule: 'Règle à respecter' };
export const STATUS_ORDER = ['problem', 'missing', 'partial', 'to_verify', 'to_confirm', 'covered', 'ignored'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function parseIso(iso) {
    if (!iso)
        return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function dateShort(iso) {
    const d = parseIso(iso);
    return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—';
}
export function dateLong(iso) {
    const d = parseIso(iso);
    return d ? `${d.getDate()}${d.getDate() === 1 ? 'er' : ''} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : '—';
}
export function daysLabel(days) {
    if (days === null)
        return '';
    if (days < 0)
        return `dépassée de ${-days} j`;
    if (days === 0)
        return "aujourd'hui";
    if (days === 1)
        return 'demain';
    return `dans ${days} jours`;
}
export function size(bytes) {
    if (bytes < 1024)
        return `${bytes} o`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
export function amount(value, currency) {
    const n = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency || '';
    return `${n}${sym ? ' ' + sym : ''}`;
}
export function plural(n, one, many) {
    if (n === 0)
        return `aucun${one.startsWith('exigence') ? 'e' : ''} ${one}`;
    return `${n} ${n > 1 ? many : one}`;
}
export const FACT_LABELS = {
    deadline: 'Date limite',
    max_amount: 'Montant maximal',
    min_cofinancing_pct: 'Cofinancement minimal',
    max_duration_months: 'Durée maximale',
};
export function factValue(key, value, currency) {
    if (key === 'deadline')
        return dateLong(value);
    if (key === 'max_amount')
        return amount(Number(value), currency);
    if (key === 'min_cofinancing_pct')
        return `${String(value).replace('.', ',')} %`;
    if (key === 'max_duration_months')
        return `${value} mois`;
    return String(value);
}
export function constraintChips(c) {
    const out = [];
    if (c.max_pages)
        out.push(`${c.max_pages} pages max.`);
    if (c.max_age_months)
        out.push(`moins de ${c.max_age_months} mois`);
    if (c.must_be_valid)
        out.push('en cours de validité');
    if (c.format)
        out.push(`format ${String(c.format).toUpperCase()}`);
    if (c.signed)
        out.push('signé');
    return out;
}
export const ACCEPT_PIECES = '.pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg';
export const ACCEPT_CALL = '.pdf,.docx,.txt,.md';
