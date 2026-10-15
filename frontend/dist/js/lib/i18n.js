function detect() {
    try {
        const saved = window.localStorage.getItem('cf_lang');
        if (saved === 'en' || saved === 'fr')
            return saved;
    }
    catch {
        /* storage unavailable: fall back to English */
    }
    return 'en';
}
export const LANG = detect();
try {
    document.documentElement.lang = LANG;
    // The cookie lets plain links (downloads, exports) carry the language to the server.
    document.cookie = `cf_lang=${LANG}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
catch {
    /* not in a browser */
}
/** Pick the string for the current language: L(french, english). */
export function L(fr, en) {
    return LANG === 'fr' ? fr : en;
}
export function setLang(lang) {
    try {
        window.localStorage.setItem('cf_lang', lang);
    }
    catch {
        /* ignore */
    }
    document.cookie = `cf_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.reload();
}
