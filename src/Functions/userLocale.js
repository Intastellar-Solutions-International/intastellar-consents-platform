import { pickLanguage } from "../i18n/languages.js";
const SETTINGS_KEY = "settings";
export const USER_SETTINGS_CHANGED = "intastellar-user-settings-changed";

// No saved preference → the browser's language. Previously "de-DE", which
// made an English UI show "9.959" and "92,1%" for every user.
function browserLocale() {
    try {
        const l = (navigator.languages && navigator.languages[0]) || navigator.language;
        if (l) return l;
    } catch { /* non-browser */ }
    return "en-GB";
}

export function readUserSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return {};
        const o = JSON.parse(raw);
        return o && typeof o === "object" ? o : {};
    } catch {
        return {};
    }
}

// The app's language → its usual number/date format. Used when no number
// format is saved, so a Danish UI shows "36,10 €" even in an English browser.
const LANGUAGE_LOCALES = {
    en: "en-GB", de: "de-DE", da: "da-DK", sv: "sv-SE", nb: "nb-NO",
    nl: "nl-NL", fr: "fr-FR", es: "es-ES", it: "it-IT", pl: "pl-PL",
};

function languageLocale() {
    const browser = browserLocale();
    let lang = null;
    try { lang = pickLanguage(localStorage.getItem("app_language") || localStorage.getItem("login_language"), navigator.languages || [navigator.language]); } catch { /* private mode */ }
    if (!lang) return browser;
    // Same language as the browser → keep the browser's region (en-US vs en-GB).
    if (browser.slice(0, 2).toLowerCase() === lang) return browser;
    return LANGUAGE_LOCALES[lang] || browser;
}

export function getUserLocale() {
    const s = readUserSettings();
    if (typeof s.locale === "string" && s.locale.trim() !== "") return s.locale.trim();
    return languageLocale();
}

export function dispatchUserSettingsChanged() {
    window.dispatchEvent(new Event(USER_SETTINGS_CHANGED));
}

const { useState, useEffect } = window.React;

export function useUserLocale() {
    const [locale, setLocale] = useState(getUserLocale);
    useEffect(() => {
        const sync = () => setLocale(getUserLocale());
        window.addEventListener(USER_SETTINGS_CHANGED, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(USER_SETTINGS_CHANGED, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);
    return locale;
}
