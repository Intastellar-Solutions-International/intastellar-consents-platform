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

export function getUserLocale() {
    const s = readUserSettings();
    if (typeof s.locale === "string" && s.locale.trim() !== "") return s.locale.trim();
    return browserLocale();
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
