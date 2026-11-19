// Session-expired → login → back to where you were.
//
// Before this, ~40 call sites did `window.location.href = "/login"` and login
// always landed on the default dashboard, so an expired session lost the
// page, domain, date range and filters (all of which now live in the URL).
// sessionStorage is per tab and survives the login round trip (including the
// external Intastellar Accounts sign-in, which returns to this origin).

const RETURN_KEY = "ia_return_to";
const LOGIN_PATHS = /^\/(login|auth-login|signup)([/?#]|$)/;

// Only same-site app paths: starts with one "/", no scheme or "//host",
// never a login page (that would loop).
function isSafeReturnPath(path) {
    return typeof path === "string"
        && path.startsWith("/")
        && !path.startsWith("//")
        && !path.includes("\\")
        && !LOGIN_PATHS.test(path);
}

export function rememberReturnTo(path = window.location.pathname + window.location.search + window.location.hash) {
    if (!isSafeReturnPath(path) || path === "/") return;
    try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* storage blocked: just no return */ }
}

export function redirectToLogin() {
    rememberReturnTo();
    window.location.href = "/login";
}

// Read once after a successful login; null when there's nowhere to return to.
export function consumeReturnTo() {
    let path = null;
    try {
        path = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
    } catch { return null; }
    return isSafeReturnPath(path) ? path : null;
}
