/**
 * Feature flags — per browser, so a layout change can be tried and switched
 * back without a deploy.
 *
 * newShell: the Stage 3 app shell (labelled, grouped rail; top bar with
 *   date range and health pill). On by default.
 *   Turn on/off: add ?shell=new or ?shell=classic to any URL (remembered),
 *   or Settings → Preferences.
 */
const KEY = "ff:newShell";
export const FLAGS_CHANGED = "intastellar-flags-changed";

function readUrlOverride() {
    try {
        const v = new URLSearchParams(window.location.search).get("shell");
        if (v === "new") localStorage.setItem(KEY, "1");
        if (v === "classic") localStorage.setItem(KEY, "0");
    } catch { /* storage unavailable */ }
}
readUrlOverride();

export function isNewShell() {
    try {
        return localStorage.getItem(KEY) !== "0";
    } catch {
        return true;
    }
}

export function setNewShell(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ignore */ }
    window.dispatchEvent(new Event(FLAGS_CHANGED));
}
