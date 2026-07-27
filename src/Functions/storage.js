/**
 * Secure storage utility.
 *
 * Sensitive auth keys (globals, organisation, subscription) are stored in
 * cookies with Secure + SameSite=Strict flags so they are only transmitted
 * over HTTPS and protected against CSRF.
 *
 * Note: these cookies are NOT HttpOnly — setting HttpOnly from JavaScript is
 * blocked by browsers. HttpOnly protection for the JWT token requires the
 * server to issue the cookie via a Set-Cookie response header instead of
 * returning it in the response body. That remains a future server-side task.
 *
 * All other keys continue to use localStorage unchanged.
 */

const SECURE_KEYS = new Set(['globals', 'organisation', 'subscription']);

// 7-day session for auth data; subscription can be stale for longer
const EXPIRY_DAYS = {
    globals: 7,
    organisation: 7,
    subscription: 1,
};

const IS_HTTPS = window.location.protocol === 'https:';
const SECURE = IS_HTTPS ? '; Secure' : '';

function cookieExpiry(days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    return d.toUTCString();
}

function writeCookie(name, value, days) {
    document.cookie = [
        `${name}=${encodeURIComponent(value)}`,
        `expires=${cookieExpiry(days)}`,
        'path=/',
        'SameSite=Strict',
        SECURE,
    ].filter(Boolean).join('; ');
}

function readCookie(name) {
    const prefix = name + '=';
    for (const part of document.cookie.split(';')) {
        const c = part.trim();
        if (c.startsWith(prefix)) {
            return decodeURIComponent(c.slice(prefix.length));
        }
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = [
        `${name}=`,
        'expires=Thu, 01 Jan 1970 00:00:00 UTC',
        'path=/',
        'SameSite=Strict',
        SECURE,
    ].filter(Boolean).join('; ');
}

const appStorage = {
    getItem(key) {
        if (SECURE_KEYS.has(key)) {
            // Cookie is the source of truth; fall back to localStorage for
            // sessions that predate this change (migration path).
            const cookieVal = readCookie(key);
            if (cookieVal !== null) return cookieVal;
            return localStorage.getItem(key);
        }
        return localStorage.getItem(key);
    },

    setItem(key, value) {
        if (SECURE_KEYS.has(key)) {
            writeCookie(key, value, EXPIRY_DAYS[key] ?? 7);
            // Remove the plain localStorage copy to avoid the old value
            // being picked up by code not yet migrated.
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, value);
        }
    },

    removeItem(key) {
        if (SECURE_KEYS.has(key)) {
            deleteCookie(key);
        }
        // Always clear localStorage too — handles pre-migration sessions
        // and any code that still writes directly to localStorage.
        localStorage.removeItem(key);
    },
};

export default appStorage;

/** Safely parse the stored organisation object. Returns null if missing or unparseable. */
export function getOrg() {
    try {
        return JSON.parse(appStorage.getItem('organisation') || 'null');
    } catch {
        return null;
    }
}
