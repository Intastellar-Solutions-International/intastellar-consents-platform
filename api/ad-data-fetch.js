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

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
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

async function tryRefreshToken(db, conn) {
    if (!conn.token_expires_at) return conn;
    const expiresAt = new Date(conn.token_expires_at).getTime();
    if (Date.now() < expiresAt - 60_000) return conn; // still valid (> 1 min headroom)
    if (!conn.refresh_token) return conn;              // no refresh token — try with current

    let refreshUrl, clientId, clientSecret, bodyExtra = {};
    switch (conn.platform) {
        case "google_ads":
            refreshUrl = "https://oauth2.googleapis.com/token";
            clientId = process.env.GOOGLE_ADS_CLIENT_ID;
            clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
            bodyExtra = { grant_type: "refresh_token", refresh_token: conn.refresh_token };
            break;
        case "linkedin_ads":
            refreshUrl = "https://www.linkedin.com/oauth/v2/accessToken";
            clientId = process.env.LINKEDIN_ADS_CLIENT_ID;
            clientSecret = process.env.LINKEDIN_ADS_CLIENT_SECRET;
            bodyExtra = { grant_type: "refresh_token", refresh_token: conn.refresh_token };
            break;
        case "microsoft_ads":
            refreshUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
            clientId = process.env.MICROSOFT_ADS_CLIENT_ID;
            clientSecret = process.env.MICROSOFT_ADS_CLIENT_SECRET;
            bodyExtra = { grant_type: "refresh_token", refresh_token: conn.refresh_token };
            break;
        case "meta_ads": {
            // Meta uses long-lived token extension instead of standard refresh
            const resp = await fetch(
                `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_ADS_CLIENT_ID}&client_secret=${process.env.META_ADS_CLIENT_SECRET}&fb_exchange_token=${conn.access_token}`
            ).catch(() => null);
            if (!resp?.ok) return conn;
            const data = await resp.json().catch(() => null);
            if (!data?.access_token) return conn;
            const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
            await db.query(
                `UPDATE ad_platform_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW()
                 WHERE organisation_id=$3 AND domain=$4 AND platform=$5`,
                [data.access_token, newExpiry, conn.organisation_id, conn.domain, conn.platform]
            );
            return { ...conn, access_token: data.access_token, token_expires_at: newExpiry };
        }
        default:
            return conn;
    }

    if (!clientId || !clientSecret) return conn;

    try {
        const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...bodyExtra });
        const resp = await fetch(refreshUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
        if (!resp.ok) return conn;
        const data = await resp.json();
        if (!data.access_token) return conn;

        const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
        await db.query(
            `UPDATE ad_platform_connections SET access_token=$1, refresh_token=COALESCE($2, refresh_token), token_expires_at=$3, updated_at=NOW()
             WHERE organisation_id=$4 AND domain=$5 AND platform=$6`,
            [data.access_token, data.refresh_token || null, newExpiry, conn.organisation_id, conn.domain, conn.platform]
        );
        return { ...conn, access_token: data.access_token, token_expires_at: newExpiry };
    } catch { return conn; }
}

async function fetchGoogleAds(conn, fromDate, toDate) {
    if (!conn.account_id) {
        throw new Error("No Google Ads customer ID linked — reconnect to let us detect your account.");
    }
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
    const customerId = conn.account_id.replace(/\D/g, ""); // strip dashes if present

    const baseHeaders = {
        Authorization: `Bearer ${conn.access_token}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
    };
    if (conn.login_customer_id) {
        baseHeaders["login-customer-id"] = String(conn.login_customer_id).replace(/\D/g, "");
    }

    const gadsPost = (query) => fetch(
        `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
        { method: "POST", headers: baseHeaders, body: JSON.stringify({ query }) }
    );

    // Fetch currency from the account if not already stored
    let currency = conn.account_currency || null;
    if (!currency) {
        const currResp = await gadsPost(
            "SELECT customer.currency_code FROM customer LIMIT 1"
        ).catch(() => null);
        if (currResp?.ok) {
            const currData = await currResp.json().catch(() => ({}));
            currency = currData?.results?.[0]?.customer?.currencyCode || null;
        }
    }

    // Fetch clicks, spend, impressions aggregated across all campaigns in the date range
    const query = `
        SELECT metrics.clicks, metrics.cost_micros, metrics.impressions
        FROM campaign
        WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
          AND campaign.status != 'REMOVED'
    `;

    const resp = await gadsPost(query);

    if (!resp.ok) {
        const rawText = await resp.text().catch(() => "");
        let errBody = {};
        try { errBody = JSON.parse(rawText); } catch {}
        console.error(`[ad-data-fetch] Google Ads ${resp.status} for customer ${customerId}:`, rawText.slice(0, 500));
        const msg = errBody?.error?.message
            || errBody?.error?.details?.[0]?.errors?.[0]?.message
            || errBody?.errors?.[0]?.message
            || `Google Ads API error (${resp.status}): ${rawText.slice(0, 200)}`;
        throw new Error(msg);
    }

    const data = await resp.json();
    let clicks = 0, spendMicros = 0, impressions = 0;
    for (const row of (data.results || [])) {
        clicks      += Number(row.metrics?.clicks || 0);
        spendMicros += Number(row.metrics?.costMicros ?? row.metrics?.cost_micros ?? 0);
        impressions += Number(row.metrics?.impressions || 0);
    }

    return {
        clicks,
        spend: +(spendMicros / 1_000_000).toFixed(2),
        currency: currency || "EUR",
        impressions,
    };
}

async function fetchMetaAds(conn, fromDate, toDate) {
    const accountId = String(conn.account_id || "").replace(/^act_/, "");
    if (!accountId) throw new Error("No Meta Ad Account linked — reconnect to select your account.");

    const params = new URLSearchParams({
        fields: "clicks,spend,impressions,account_currency",
        time_range: JSON.stringify({ since: fromDate, until: toDate }),
        level: "account",
        access_token: conn.access_token,
    });

    const resp = await fetch(`https://graph.facebook.com/v18.0/act_${accountId}/insights?${params}`);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Meta API error (${resp.status})`);
    }
    const data = await resp.json();
    const row = data.data?.[0];
    if (!row) return { clicks: 0, spend: 0, currency: "USD", impressions: 0 };
    return {
        clicks: Number(row.clicks || 0),
        spend: Number(row.spend || 0),
        currency: row.account_currency || "USD",
        impressions: Number(row.impressions || 0),
    };
}

async function fetchLinkedInAds(conn, fromDate, toDate) {
    const [fy, fm, fd] = fromDate.split("-").map(Number);
    const [ty, tm, td] = toDate.split("-").map(Number);

    const params = new URLSearchParams({
        q: "analytics",
        "dateRange.start.year": fy,
        "dateRange.start.month": fm,
        "dateRange.start.day": fd,
        "dateRange.end.year": ty,
        "dateRange.end.month": tm,
        "dateRange.end.day": td,
        pivot: "ACCOUNT",
        fields: "clicks,costInUsd,impressions",
        timeGranularity: "ALL",
    });

    const resp = await fetch(`https://api.linkedin.com/rest/adAnalytics?${params}`, {
        headers: { Authorization: `Bearer ${conn.access_token}`, "LinkedIn-Version": "202312" },
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.message || `LinkedIn API error (${resp.status})`);
    }
    const data = await resp.json();
    const row = data.elements?.[0];
    if (!row) return { clicks: 0, spend: 0, currency: "USD", impressions: 0 };
    return {
        clicks: Number(row.clicks || 0),
        spend: Number(row.costInUsd || 0),
        currency: "USD",
        impressions: Number(row.impressions || 0),
    };
}

async function fetchPlatformData(conn, fromDate, toDate) {
    switch (conn.platform) {
        case "google_ads":   return fetchGoogleAds(conn, fromDate, toDate);
        case "meta_ads":     return fetchMetaAds(conn, fromDate, toDate);
        case "linkedin_ads": return fetchLinkedInAds(conn, fromDate, toDate);
        case "microsoft_ads":
            throw new Error("Microsoft Ads automatic import is not yet available. Please enter the data manually.");
        default:
            throw new Error(`Unsupported platform: ${conn.platform}`);
    }
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

    try {
        const data = await fetchPlatformData(conn, fromDate, toDate);
        return res.status(200).json(data);
    } catch (err) {
        console.error(`[ad-data-fetch] ${platform}:`, err.message);
        return res.status(502).json({ error: err.message });
    }
}
