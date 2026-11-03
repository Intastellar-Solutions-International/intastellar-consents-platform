/**
 * "Exclude suspected bots" — one preference shared by every consent
 * dashboard (Home, domain dashboard, Compliance, audit log). Sent to the
 * consent API as the ExcludeBots header (see the getters in src/API/api.js);
 * the API leaves out records collect.php flagged is_suspected_bot unless it
 * receives "0". On by default — also when storage is unavailable.
 */
const STORAGE_KEY = "excludeSuspectedBots";
export const BOT_FILTER_CHANGED = "intastellar-bot-filter-changed";

export function getExcludeBots() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== "0";
    } catch {
        return true;
    }
}

export function setExcludeBots(exclude) {
    try {
        localStorage.setItem(STORAGE_KEY, exclude ? "1" : "0");
    } catch { /* private mode — the change still applies to this page view */ }
    window.dispatchEvent(new Event(BOT_FILTER_CHANGED));
}

export function excludeBotsHeader() {
    return getExcludeBots() ? "1" : "0";
}

/** [excludeBots, setExcludeBots] — re-renders every subscriber when any toggle changes. */
export function useExcludeBots() {
    const { useState, useEffect } = window.React;
    const [value, setValue] = useState(getExcludeBots);
    useEffect(() => {
        const sync = () => setValue(getExcludeBots());
        window.addEventListener(BOT_FILTER_CHANGED, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(BOT_FILTER_CHANGED, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);
    return [value, setExcludeBots];
}
