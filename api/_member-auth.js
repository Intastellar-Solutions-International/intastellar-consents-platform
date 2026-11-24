import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Stricter sign-in check for endpoints holding personal data. The usual
 * validateJwt reads the token's claims without checking who signed it and
 * trusts the Organisation header. This verifies the signature when JWT_SECRET
 * is set and always confirms membership with the accounts API, failing closed.
 */
const MEMBERSHIP_URL = "https://apis.intastellarsolutions.com/analytics/settings/getOrganisation";
const CACHE_MS = 5 * 60 * 1000;
const PLATFORM_ORGANISATION = 1;
const confirmed = new Map();

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Tokens arrive as a plain JWT or as base64 of the whole JWT. */
export function rawJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    if (match[1].split(".").length === 3) return match[1];
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    return decoded.split(".").length === 3 ? decoded : null;
}

export function jwtClaims(raw, now = Date.now() / 1000) {
    try {
        const payload = JSON.parse(Buffer.from(raw.split(".")[1], "base64").toString("utf8"));
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return null;
        return payload;
    } catch {
        return null;
    }
}

/** Accepts both signature encodings the accounts service produces, as php-backend/shared/auth.php does. */
export function signatureValid(raw, secret) {
    try {
        const [header, payload, signature] = raw.split(".");
        const alg = String(JSON.parse(Buffer.from(header, "base64").toString("utf8")).alg || "hs256").toLowerCase();
        const single = b64url(createHmac(alg === "hs512" ? "sha512" : "sha256", secret).update(`${header}.${payload}`).digest());
        const double = b64url(single);
        const given = Buffer.from(signature);
        return [single, double].some((s) => s.length === signature.length && timingSafeEqual(Buffer.from(s), given));
    } catch {
        return false;
    }
}

/**
 * Signing secrets for Intastellar Accounts tokens: JWT_SECRETS (comma
 * separated, newest first — lets the key rotate without signing everyone
 * out) plus JWT_SECRET. Empty when neither is set.
 */
export function configuredSecrets(env = process.env) {
    return [...String(env.JWT_SECRETS || "").split(","), env.JWT_SECRET || ""]
        .map((s) => s.trim())
        .filter((s, i, all) => s && all.indexOf(s) === i);
}

let warnedNoSecret = false;

/**
 * The one token check for API endpoints (replaces the per-file copies that
 * only read claims). Returns the claims, or null.
 * - Intastellar Accounts tokens: expiry, issuer and — when a secret is
 *   configured — the signature.
 * - "Intastellar Cron" service tokens: only with { allowCron: true }, and
 *   only if identical to DOMAINS_API_KEY (constant-time compare).
 * Without any secret configured it still accepts account tokens by their
 * claims (as before) and logs a warning, so deploying this never locks
 * anyone out; the signature check switches on with JWT_SECRET(S).
 */
export function validateJwt(authHeader, { allowCron = false, env = process.env, now = Date.now() } = {}) {
    const raw = rawJwt(authHeader);
    if (!raw) return null;
    const claims = jwtClaims(raw, now / 1000);
    if (!claims) return null;

    if (claims.iss === "Intastellar Cron") {
        if (!allowCron || claims.sub !== "cron_scan_domains") return null;
        const given = Buffer.from(String(authHeader).replace(/^Bearer\s+/i, ""));
        const expected = Buffer.from(String(env.DOMAINS_API_KEY || ""));
        return expected.length && given.length === expected.length && timingSafeEqual(given, expected) ? claims : null;
    }
    if (claims.iss !== "Intastellar Account") return null;

    const secrets = configuredSecrets(env);
    if (!secrets.length) {
        if (!warnedNoSecret) {
            warnedNoSecret = true;
            console.warn("[auth] JWT_SECRET(S) not set — token signatures are NOT verified");
        }
        return claims;
    }
    return secrets.some((secret) => signatureValid(raw, secret)) ? claims : null;
}

// Intastellar Accounts puts the account's details under PAYLOAD
// (Checkcookies.php → JWTGenerate); without reading it, callers that don't
// send X-User-Email (the mobile app) were refused with 401.
const claimEmail = (c) => [c.email, c.PAYLOAD?.email, c.user?.email, c.data?.email, c.sub].find((v) => typeof v === "string" && v.includes("@")) || null;

export function isMember(response, organisationId, email) {
    if (typeof response === "string") return false;
    const list = Array.isArray(response) ? response : response?.organisations || response?.data || [];
    return list.some((o) => Number(o?.id ?? o?.organisationId) === organisationId
        && (!Array.isArray(o?.users) || o.users.some((u) => String(u?.email).toLowerCase() === email.toLowerCase())));
}

/** { organisationId, email } for a confirmed member, otherwise { status, error }. */
export async function requireMember(req, { fetchImpl = globalThis.fetch, secret, now = Date.now() } = {}) {
    const unauthorized = { status: 401, error: "Unauthorized" };
    const raw = rawJwt(req.headers.authorization);
    const claims = raw && jwtClaims(raw, now / 1000);
    if (!claims) return unauthorized;
    const secrets = secret ? [secret] : configuredSecrets();
    if (secrets.length && !secrets.some((key) => signatureValid(raw, key))) return unauthorized;

    const organisationId = parseInt(req.headers.organisation || "0", 10);
    if (!organisationId) return { status: 400, error: "Missing Organisation header" };

    const fromToken = claimEmail(claims);
    const fromClient = String(req.headers["x-user-email"] || "").trim();
    if (fromToken && fromClient && fromToken.toLowerCase() !== fromClient.toLowerCase()) return unauthorized;
    const email = fromToken || fromClient;
    if (!email) return unauthorized;

    const key = createHash("sha256").update(`${req.headers.authorization}|${organisationId}|${email}`).digest("hex");
    if (confirmed.get(key) > now) return { organisationId, email };
    try {
        const response = await fetchImpl(MEMBERSHIP_URL, {
            method: "POST",
            headers: { Authorization: req.headers.authorization, "Content-Type": "application/json" },
            body: JSON.stringify({ organisationMember: email }),
        });
        if (!response.ok || !isMember(await response.json(), organisationId, email)) return { status: 403, error: "Forbidden" };
    } catch {
        return { status: 503, error: "Membership could not be confirmed" };
    }
    confirmed.set(key, now + CACHE_MS);
    return { organisationId, email };
}

/** requireMember, limited to members of the organisation that runs the platform. */
export async function requirePlatformAdmin(req, options) {
    const member = await requireMember(req, options);
    if (member.error) return member;
    return member.organisationId === PLATFORM_ORGANISATION ? member : { status: 403, error: "Forbidden" };
}
