/**
 * Platform language. The English text is the key: t("Settings") returns the
 * German or Danish text when there is one, else the English. Placeholders:
 * t("Renews {date}", { date }).
 *
 * Changing the language inside the app reloads the page (setLanguage with
 * reload), so every t() call — including in link lists defined outside
 * components — picks it up. The login page switches live via useLanguage().
 */
import { LANGUAGES, pickLanguage, translateWith } from "./languages.js";
import de from "./de.js";
import da from "./da.js";
import sv from "./sv.js";
import nb from "./nb.js";
import nl from "./nl.js";
import fr from "./fr.js";
import es from "./es.js";
import it from "./it.js";
import pl from "./pl.js";

export { LANGUAGES };

const DICTIONARIES = { de, da, sv, nb, nl, fr, es, it, pl };
const STORAGE_KEY = "app_language";
// The login page saved its choice here before the language was app-wide.
const LEGACY_KEY = "login_language";
const CHANGED = "app-language-changed";

let current = null;

export function getLanguage() {
    if (current) return current;
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY); } catch { /* private mode */ }
    current = pickLanguage(saved, typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : []);
    if (typeof document !== "undefined") document.documentElement.lang = current;
    return current;
}

export function setLanguage(code, { reload = false } = {}) {
    current = pickLanguage(code, []);
    try { localStorage.setItem(STORAGE_KEY, current); } catch { /* private mode */ }
    document.documentElement.lang = current;
    if (reload) window.location.reload();
    else window.dispatchEvent(new Event(CHANGED));
}

export function t(text, vars) {
    return translateWith(DICTIONARIES[getLanguage()], text, vars);
}

// For components that switch language without a reload (the login page).
export function useLanguage() {
    const { useState, useEffect } = React;
    const [lang, setLang] = useState(getLanguage);
    useEffect(() => {
        const update = () => setLang(getLanguage());
        window.addEventListener(CHANGED, update);
        return () => window.removeEventListener(CHANGED, update);
    }, []);
    return lang;
}
