const SETTINGS_KEY = "settings";
export const USER_SETTINGS_CHANGED = "intastellar-user-settings-changed";

const DEFAULT_LOCALE = "de-DE";

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
    return DEFAULT_LOCALE;
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
