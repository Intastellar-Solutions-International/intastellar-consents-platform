/**
 * GET /api/ad-data-fetch?platform=google_ads&domain=example.com&fromDate=2024-01-01&toDate=2024-01-31
 *
 * Fetches clicks, spend, and impressions from the connected ad platform.
 * Returns: { clicks, spend, currency, impressions }
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * Required env vars (same as ad-oauth-start.js plus):
 *   GOOGLE_ADS_DEVELOPER_TOKEN — required for Google Ads API calls
 */

import pkg from "pg";
const { Pool } = pkg;
import { tryRefreshToken as _tryRefreshToken, fetchPlatformData } from "./_ad-platform-fetch.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
        });
    }
    return pool;
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        const iss = payload.iss ?? "";
        if (iss === "Intastellar Account") {
            if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        } else if (iss === "Intastellar Cron") {
            if (payload.sub !== "cron_scan_domains" || (payload.exp && payload.exp < now)) return null;
        } else {
            return null;
        }
        return payload;
    } catch { return null; }
}

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

const tryRefreshToken = _tryRefreshToken;

// Fetches the real currency from the Google Ads Customer API, persists it to the connection
// row, and bulk-updates any stale ad_daily_data rows that were written with the wrong currency.
async function resolveGoogleAdsCurrency(conn, db, orgId, domain) {
    try {
        const customerId = conn.account_id.replace(/\D/g, "");
        const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
        const headers = {
            Authorization: `Bearer ${conn.access_token}`,
            "developer-token": devToken,
            "Content-Type": "application/json",
        };
        if (conn.login_customer_id) {
            headers["login-customer-id"] = String(conn.login_customer_id).replace(/\D/g, "");
        }
        const r = await fetch(
            `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
            { method: "POST", headers, body: JSON.stringify({ query: "SELECT customer.currency_code FROM customer LIMIT 1" }) }
        );
        if (!r.ok) return null;
        const d = await r.json().catch(() => ({}));
        const currency = d?.results?.[0]?.customer?.currencyCode || null;
        if (!currency) return null;

        // Persist so future calls (and cache hits) use the correct value.
        await db.query(
            `UPDATE ad_platform_connections SET account_currency=$1, updated_at=NOW() WHERE id=$2`,
            [currency, conn.id]
        ).catch(() => {});
        // Backfill stale cache rows: correct currency and null out spend_eur.
        // spend_eur was computed as fx(spend, wrongCurrency, "EUR") so it's wrong too.
        // Nulling it forces the query-time fallback: fx(native_spend, correctCurrency, "EUR").
        await db.query(
            `UPDATE ad_daily_data SET currency=$1, spend_eur=NULL
             WHERE organisation_id=$2 AND domain=$3 AND platform='google_ads' AND currency IS DISTINCT FROM $1`,
            [currency, orgId, domain]
        ).catch(() => {});

        return currency;
    } catch {
        return null;
    }
}

// Check ad_daily_data cache; returns aggregate if all days are present, null otherwise.
async function fromCache(db, orgId, domain, platform, fromDate, toDate) {
    try {
        const from = new Date(fromDate + "T00:00:00Z");
        const to   = new Date(toDate   + "T00:00:00Z");
        const totalDays = Math.round((to - from) / 86_400_000) + 1;

        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS n, SUM(clicks)::bigint AS clicks,
                    SUM(impressions)::bigint AS impressions,
                    SUM(spend)::numeric AS spend, MAX(currency) AS currency
             FROM ad_daily_data
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3
               AND date >= $4::date AND date <= $5::date`,
            [orgId, domain, platform, fromDate, toDate]
        );
        const row = rows[0];
        if (!row || Number(row.n) < totalDays) return null;
        const sessions = platform === "google_analytics" ? Number(row.clicks || 0) : undefined;
        return {
            clicks:      Number(row.clicks      || 0),
            impressions: Number(row.impressions  || 0),
            spend:       Number(row.spend        || 0),
            currency:    row.currency            || null,
            ...(sessions != null ? { sessions } : {}),
            fromCache: true,
        };
    } catch { return null; }
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const { platform, domain, fromDate, toDate } = req.query;
    if (!platform || !domain || !fromDate || !toDate) {
        return res.status(400).json({ error: "platform, domain, fromDate, and toDate are all required" });
    }

    const db = getPool();
    const result = await db.query(
        `SELECT * FROM ad_platform_connections WHERE organisation_id=$1 AND domain=$2 AND platform=$3`,
        [orgId, domain, platform]
    );
    if (result.rows.length === 0) {
        return res.status(404).json({ error: "No connection found for this platform and domain. Connect first." });
    }

    let conn = result.rows[0];

    conn = await tryRefreshToken(db, conn);

    // Serve from cache if all days in range are pre-synced by the cron
    const cached = await fromCache(db, orgId, domain, platform, fromDate, toDate);
    if (cached) {
        // Use the authoritative stored currency if available; otherwise resolve it from the API
        // so stale "EUR" cache rows don't leak through for non-EUR accounts.
        let currency = conn.account_currency || null;
        if (!currency && platform === "google_ads" && conn.account_id) {
            currency = await resolveGoogleAdsCurrency(conn, db, orgId, domain);
        }
        return res.status(200).json({ ...cached, currency: currency || cached.currency });
    }

    try {
        const data = await fetchPlatformData(conn, fromDate, toDate, db);
        return res.status(200).json(data);
    } catch (err) {
        console.error(`[ad-data-fetch] ${platform}:`, err.message);
        return res.status(502).json({ error: err.message });
    }
}
