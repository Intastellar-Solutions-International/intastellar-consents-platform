/**
 * fetch() + JSON with a time limit, for dashboard sections that must never
 * sit on a loading skeleton forever (Home used to: a failed or hung
 * getInteractions request left every card a skeleton, with no message).
 *
 * Resolves to the parsed JSON. Rejects with an Error carrying `kind`:
 *   "timeout" — no response within timeoutMs
 *   "http"    — non-2xx status (err.status)
 *   "network" — offline / CORS / DNS
 *   "parse"   — response wasn't JSON
 *   "aborted" — the caller's signal aborted (e.g. date range changed);
 *               callers should ignore this one
 * A 401 or the API's "Err_Login_Expired" sends the user to /login, matching
 * the rest of the dashboard.
 */
export const DEFAULT_TIMEOUT_MS = 30000;

function requestError(kind, message, extra = {}) {
    return Object.assign(new Error(message), { kind }, extra);
}

export async function fetchJsonWithTimeout(url, init = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, onLoginExpired } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const forwardAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", forwardAbort);
    }
    const expired = () => {
        if (onLoginExpired) onLoginExpired();
        return requestError("auth", "Your login has expired.");
    };
    try {
        let res;
        try {
            res = await fetch(url, { ...init, signal: controller.signal });
        } catch (err) {
            if (timedOut) throw requestError("timeout", `No response within ${Math.round(timeoutMs / 1000)} seconds.`);
            if (signal && signal.aborted) throw requestError("aborted", "Request cancelled.");
            throw requestError("network", "Couldn't reach the server. Check your connection.");
        }
        if (res.status === 401) throw expired();
        if (!res.ok) throw requestError("http", `The server returned an error (${res.status}).`, { status: res.status });
        let data;
        try {
            data = await res.json();
        } catch {
            // An abort can also land while the body is being read — that's a
            // cancellation, not a bad response.
            if (timedOut) throw requestError("timeout", `No response within ${Math.round(timeoutMs / 1000)} seconds.`);
            if (signal && signal.aborted) throw requestError("aborted", "Request cancelled.");
            throw requestError("parse", "The server sent an unreadable response.");
        }
        if (signal && signal.aborted) throw requestError("aborted", "Request cancelled.");
        if (data === "Err_Login_Expired") throw expired();
        return data;
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", forwardAbort);
    }
}
