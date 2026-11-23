// Requests to the same endpoints the web dashboard uses, with the same
// headers (src/Pages/Analytics/_shared.js → authHeaders). An expired token
// signs the user out instead of showing empty screens.
import { PRIMARY_HOST, SCANNER_HOST } from "./config.js";

export class SessionExpiredError extends Error {}

let onExpired = () => {};
export function setOnSessionExpired(fn) { onExpired = fn; }

function headers(session, extra) {
    return {
        Authorization: `Bearer ${session.token}`,
        Organisation: String(session.organisationId ?? ""),
        "Content-Type": "application/json",
        ExcludeBots: "1", // same default as the web: suspected bots excluded
        ...extra,
    };
}

async function getJson(url, session, extra) {
    const res = await fetch(url, { headers: headers(session, extra) });
    if (res.status === 401) { onExpired(); throw new SessionExpiredError(); }
    const body = await res.json().catch(() => null);
    if (body === "Err_Login_Expired") { onExpired(); throw new SessionExpiredError(); }
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

export const fetchReport = (session, domain, from, to) =>
    getJson(`${SCANNER_HOST}/api/analytics-report?${qs({ domain, from, to })}`, session);

export const fetchLive = (session, domain) =>
    getJson(`${SCANNER_HOST}/api/analytics-live?${qs({ domain })}`, session);

export const fetchAdSpend = (session, domain, from, to, displayCurrency) =>
    getJson(`${SCANNER_HOST}/api/ad-spend-report?${qs({ from, to, displayCurrency })}`, session, { Domains: domain });
