// Requests to the same endpoints the web dashboard uses, with the same
// headers (src/Pages/Analytics/_shared.js → authHeaders). Tokens come from
// tokenStore.js, refreshed before they expire; a refused expired token is
// refreshed once and the request retried. Only when that fails does the
// session end ("Welcome back").
import { PRIMARY_HOST, SCANNER_HOST } from "./config.js";
import { tokenExpired } from "./token.js";
import { freshToken, hasRefreshToken, refreshNow } from "./tokenStore.js";

export class SessionExpiredError extends Error {}
/** An endpoint refused a token that hasn't expired — that card fails, the session stays. */
export class NotAuthorisedError extends Error {}

let onExpired = () => {};
export function setOnSessionExpired(fn) { onExpired = fn; }

function headers(token, session, extra) {
    return {
        Authorization: `Bearer ${token}`,
        Organisation: String(session.organisationId ?? ""),
        ...(session.email ? { "X-User-Email": session.email } : {}),
        "Content-Type": "application/json",
        ExcludeBots: "1", // same default as the web: suspected bots excluded
        ...extra,
    };
}

// "Unauthorised" ends the session only when the token really has expired.
// Some endpoints (e.g. the PHP API's "Err_Login_Expired") also say so for
// other refusals; signing out on those dropped people back to the login
// screen right after signing in.
function refused(url, token, status) {
    if (tokenExpired(token)) { onExpired(); return new SessionExpiredError(); }
    console.warn(`[api] ${url.split("?")[0]} refused a valid sign-in (${status}) — staying signed in`);
    return new NotAuthorisedError("Not authorised for this data");
}

async function getJson(url, session, extra, retried = false) {
    const token = (await freshToken()) || session.token;
    const res = await fetch(url, { headers: headers(token, session, extra) });
    const body = res.status === 401 ? null : await res.json().catch(() => null);
    if (res.status === 401 || body === "Err_Login_Expired") {
        // Expired despite the early refresh (clock skew, app was asleep): refresh once, retry.
        if (!retried && hasRefreshToken() && tokenExpired(token) && await refreshNow()) return getJson(url, session, extra, true);
        throw refused(url, token, res.status === 401 ? 401 : "Err_Login_Expired");
    }
    if (!res.ok) {
        const error = new Error((body && body.error) || `Request failed (${res.status})`);
        error.status = res.status;
        throw error;
    }
    return body;
}

const qs = (params) => new URLSearchParams(params).toString();

/**
 * The account behind a sign-in token — the same check the Intastellar SDK
 * does after its redirect. Used when the redirect *launched* the app: the
 * SDK only listens for links while running, so a cold-start link never
 * reaches it.
 */
export async function verifyAccountToken(token) {
    const res = await fetch("https://apis.intastellaraccounts.com/verify", {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (body?.statusCode !== 200 || !body.account?.user) throw new Error(body?.error || "Sign-in token was rejected.");
    const { user } = body.account;
    const first = Array.isArray(user) ? user[0] : user?.[0];
    return { token, user: { ...user, ...(first ? { phone: first.phone, birthday: first.birthday } : {}) } };
}

/** The organisations an account belongs to (same lookup as the web login). */
export async function fetchOrganisations(email) {
    const res = await fetch(`${PRIMARY_HOST}/getOrganisation.php`, {
        method: "POST",
        headers: { LoginType: "oauth", "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ organisationMember: email }),
    });
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error("Organisation lookup was rejected.");
    return body.filter(Boolean).map((o) => ({ id: o.id, name: o.name }));
}

/** The organisation's domains, ASCII (punycode) as the API returns them. */
export async function fetchDomains(session) {
    const body = await getJson(`${PRIMARY_HOST}/analytics/gdpr/getDomains`, session);
    if (!Array.isArray(body)) return [];
    return body
        .map((d) => String(d?.domain || "").trim())
        .filter((d) => d && d !== "combined view" && d !== "undefined.");
}

/** Domains with Analytics set up and active (same list as the web's domain picker). */
export async function fetchAnalyticsDomains(session) {
    const body = await getJson(`${SCANNER_HOST}/api/analytics-site?list=1`, session);
    return new Set((body?.sites || []).filter((s) => s.active).map((s) => String(s.domain).toLowerCase()));
}

/** Recent analytics and ad alerts of the organisation (api/mobile-push.js). */
export const fetchAlerts = (session) =>
    getJson(`${SCANNER_HOST}/api/mobile-push`, session).then((body) => body?.alerts || []);

// Reports are reused for a minute: Home and a metric's detail screen ask for
// the same period, and switching back shouldn't reload everything.
const REPORT_TTL_MS = 60 * 1000;
const reportCache = new Map();
export function fetchReport(session, domain, from, to, { fresh = false } = {}) {
    const key = `${session.organisationId}|${domain}|${from}|${to}`;
    const hit = reportCache.get(key);
    if (!fresh && hit && Date.now() - hit.at < REPORT_TTL_MS) return hit.promise;
    const promise = getJson(`${SCANNER_HOST}/api/analytics-report?${qs({ domain, from, to })}`, session);
    reportCache.set(key, { at: Date.now(), promise });
    promise.catch(() => reportCache.delete(key));
    return promise;
}

/** Campaign rows (consent decisions per UTM source/medium/campaign) for one domain. */
export const fetchCampaignConsent = (session, domain, from, to) =>
    getJson(`${PRIMARY_HOST}/analytics/gdpr/marketingAttribution`, session, { Domains: domain, FromDate: from, ToDate: to });

/** A one-time code that opens the web dashboard signed in (api/app-handoff.js). */
export async function createHandoff(session, user) {
    const token = (await freshToken()) || session.token;
    const res = await fetch(`${SCANNER_HOST}/api/app-handoff`, {
        method: "POST",
        headers: headers(token, session, { "X-User-Email": user?.email || "" }),
        body: JSON.stringify({ action: "create", user: { name: user?.name, image: user?.image } }),
    });
    if (res.status === 401) throw refused(`${SCANNER_HOST}/api/app-handoff`, token, 401);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.code) throw new Error(body?.error || "Hand-over failed");
    return body.code;
}

export const fetchLive = (session, domain) =>
    getJson(`${SCANNER_HOST}/api/analytics-live?${qs({ domain })}`, session);

export const fetchAdSpend = (session, domain, from, to, displayCurrency) =>
    getJson(`${SCANNER_HOST}/api/ad-spend-report?${qs({ from, to, displayCurrency })}`, session, { Domains: domain });
