// Reads the Intastellar Accounts token's own expiry. Tokens arrive as base64
// of the whole JWT (sometimes as the plain JWT) — same as api/_member-auth.js.
const decodeBase64 = (s) => {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return typeof atob === "function" ? atob(b64 + "===".slice((b64.length + 3) % 4)) : null;
};

function claims(token) {
    try {
        const jwt = String(token).split(".").length === 3 ? String(token) : decodeBase64(String(token));
        const payload = jwt?.split(".")[1];
        return payload ? JSON.parse(decodeBase64(payload)) : null;
    } catch {
        return null;
    }
}

/** Expiry as ms since epoch, or null when the token carries none / can't be read. */
export function tokenExpiresAt(token) {
    const exp = claims(token)?.exp;
    return typeof exp === "number" ? exp * 1000 : null;
}

/** True only when the token says it has expired (unknown → false). */
export function tokenExpired(token, now = Date.now()) {
    const at = tokenExpiresAt(token);
    return at != null && at <= now;
}
