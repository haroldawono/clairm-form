import { L, LANG } from './i18n.js';
export const STATUS = {
    covered: { label: L('Couvert', 'Covered'), hint: L('Une pièce ou une confirmation répond à cette exigence.', 'A document or a confirmation meets this requirement.') },
    to_verify: { label: L('À vérifier', 'To check'), hint: L('Une pièce a été rattachée automatiquement : confirmez-la.', 'A document was linked automatically: please confirm it.') },
    partial: { label: L('Incomplet', 'Incomplete'), hint: L('Il manque des pièces distinctes.', 'Some separate documents are still missing.') },
    missing: { label: L('Manquant', 'Missing'), hint: L('Aucune pièce ne répond encore à cette exigence.', 'No document meets this requirement yet.') },
    problem: { label: L('Problème', 'Problem'), hint: L('Un contrôle a détecté un point à corriger.', 'A check found something to fix.') },
    to_confirm: { label: L('À confirmer', 'To confirm'), hint: L('Condition ou règle à confirmer par vous.', 'Condition or rule for you to confirm.') },
    ignored: { label: L('Écartée', 'Dismissed'), hint: L('Non prise en compte.', 'Not taken into account.') },
};
export const KIND = {
    document: L('Pièce à fournir', 'Required document'),
    condition: L("Condition d'éligibilité", 'Eligibility condition'),
    rule: L('Règle à respecter', 'Rule to follow'),
};
export const STATUS_ORDER = ['problem', 'missing', 'partial', 'to_verify', 'to_confirm', 'covered', 'ignored'];
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function parseIso(iso) {
    if (!iso)
        return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function dateShort(iso) {
    const d = parseIso(iso);
    if (!d)
        return '—';
    return LANG === 'fr' ? `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}` : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export function dateLong(iso) {
    const d = parseIso(iso);
    if (!d)
        return '—';
    return LANG === 'fr'
        ? `${d.getDate()}${d.getDate() === 1 ? 'er' : ''} ${MONTHS_LONG_FR[d.getMonth()]} ${d.getFullYear()}`
        : `${MONTHS_LONG_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export function daysLabel(days) {
    if (days === null)
        return '';
    if (days < 0)
        return L(`dépassée de ${-days} j`, `passed ${-days} day${-days > 1 ? 's' : ''} ago`);
    if (days === 0)
        return L("aujourd'hui", 'today');
    if (days === 1)
        return L('demain', 'tomorrow');
    return L(`dans ${days} jours`, `in ${days} days`);
}
export function size(bytes) {
    if (bytes < 1024)
        return L(`${bytes} o`, `${bytes} B`);
    if (bytes < 1024 * 1024)
        return L(`${Math.round(bytes / 1024)} Ko`, `${Math.round(bytes / 1024)} KB`);
    const mb = (bytes / 1024 / 1024).toFixed(1);
    return L(`${mb.replace('.', ',')} Mo`, `${mb} MB`);
}
export function amount(value, currency) {
    const n = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, LANG === 'fr' ? ' ' : ',');
    const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency || '';
    return `${n}${sym ? ' ' + sym : ''}`;
}
export function plural(n, one, many, none) {
    if (n === 0)
        return none || L(`aucun${one.startsWith('exigence') ? 'e' : ''} ${one}`, `no ${many}`);
    return `${n} ${n > 1 ? many : one}`;
}
export const FACT_LABELS = {
    deadline: L('Date limite', 'Deadline'),
    max_amount: L('Montant maximal', 'Maximum amount'),
    min_cofinancing_pct: L('Cofinancement minimal', 'Minimum co-funding'),
    max_duration_months: L('Durée maximale', 'Maximum duration'),
};
export function factValue(key, value, currency) {
    if (key === 'deadline')
        return dateLong(value);
    if (key === 'max_amount')
        return amount(Number(value), currency);
    if (key === 'min_cofinancing_pct')
        return L(`${String(value).replace('.', ',')} %`, `${value}%`);
    if (key === 'max_duration_months')
        return L(`${value} mois`, `${value} months`);
    return String(value);
}
export function constraintChips(c) {
    const out = [];
    if (c.max_pages)
        out.push(L(`${c.max_pages} pages max.`, `${c.max_pages} pages max`));
    if (c.max_age_months)
        out.push(L(`moins de ${c.max_age_months} mois`, `less than ${c.max_age_months} months old`));
    if (c.must_be_valid)
        out.push(L('en cours de validité', 'currently valid'));
    if (c.format)
        out.push(L(`format ${String(c.format).toUpperCase()}`, `${String(c.format).toUpperCase()} format`));
    if (c.signed)
        out.push(L('signé', 'signed'));
    return out;
}
export const ACCEPT_PIECES = '.pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg';
export const ACCEPT_CALL = '.pdf,.docx,.txt,.md';
