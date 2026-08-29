/**
 * GET  /api/ad-conversion-push?domain=  — list recent push records for the org
 * POST /api/ad-conversion-push          — process pending conversions and push to ad platforms
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * POST body (all optional):
 *   { domain, limit, ids }
 *   domain  — restrict to a specific domain (otherwise all pending for the org)
 *   limit   — max rows to process in one call (default 50)
 *   ids     — array of specific push record IDs to retry
 *
 * Required env vars (platform-specific):
 *   GOOGLE_ADS_DEVELOPER_TOKEN   — per-API-user token from Google Ads API Centre
 *   GOOGLE_CLIENT_ID             — OAuth2 client_id for token refresh
 *   GOOGLE_CLIENT_SECRET         — OAuth2 client_secret for token refresh
 */

import pkg from "pg";
const { Pool } = pkg;

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
        if (payload.iss !== "Intastellar Account") return null;
        if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
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
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshGoogleToken(db, connection) {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret || !connection.refresh_token) return null;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type:    "refresh_token",
            client_id:     clientId,
            client_secret: clientSecret,
            refresh_token: connection.refresh_token,
        }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.access_token) return null;

    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await db.query(
        `UPDATE ad_platform_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW()
         WHERE id=$3`,
        [data.access_token, expiresAt, connection.id]
    ).catch(() => {});

    return data.access_token;
}

async function refreshMicrosoftToken(db, connection) {
    const clientId     = process.env.MICROSOFT_ADS_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_ADS_CLIENT_SECRET;
    if (!clientId || !clientSecret || !connection.refresh_token) return null;

    const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type:    "refresh_token",
            client_id:     clientId,
            client_secret: clientSecret,
            refresh_token: connection.refresh_token,
            scope:         "https://ads.microsoft.com/msads.manage offline_access",
        }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.access_token) return null;

    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await db.query(
        `UPDATE ad_platform_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW()
         WHERE id=$3`,
        [data.access_token, expiresAt, connection.id]
    ).catch(() => {});

    return data.access_token;
}

async function getValidToken(db, connection) {
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const isExpired = !expiresAt || expiresAt.getTime() - Date.now() < 120_000; // refresh if < 2 min left

    if (!isExpired && connection.access_token) return connection.access_token;

    switch (connection.platform) {
        case "google_ads":    return await refreshGoogleToken(db, connection);
        case "microsoft_ads": return await refreshMicrosoftToken(db, connection);
        default:              return connection.access_token || null;
    }
}

// ── Platform push functions ───────────────────────────────────────────────────

async function pushGoogleAds(connection, token, push) {
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN not configured");
    if (!connection.conversion_action) throw new Error("No conversion_action configured for this Google Ads connection");

    const customerId  = (connection.account_id || "").replace(/-/g, "");
    if (!customerId) throw new Error("No account_id (customer ID) on connection");

    // Format: "2024-01-15 14:30:00+00:00"
    const dt = new Date(push.conversion_time);
    const conversionDateTime = dt.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");

    const body = {
        conversions: [{
            gclid:              push.click_id,
            conversionAction:   connection.conversion_action,
            conversionDateTime,
            ...(push.value_usd != null && {
                conversionValue: Number(push.value_usd),
                currencyCode:    push.currency || "EUR",
            }),
        }],
        partialFailure: true,
    };

    const headers = {
        "Content-Type":       "application/json",
        "Authorization":      `Bearer ${token}`,
        "developer-token":    devToken,
    };
    if (connection.login_customer_id) {
        headers["login-customer-id"] = connection.login_customer_id.replace(/-/g, "");
    }

    const resp = await fetch(
        `https://googleads.googleapis.com/v25/customers/${customerId}:uploadClickConversions`,
        { method: "POST", headers, body: JSON.stringify(body) }
    );
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) throw new Error(json?.error?.message || `HTTP ${resp.status}`);
    if (json.partialFailureError) throw new Error(json.partialFailureError.message || "Partial failure");

    return json;
}

async function pushMetaAds(connection, token, push) {
    const pixelId = connection.account_id;
    if (!pixelId) throw new Error("No account_id (pixel ID) on connection");

    // Map internal event names to Meta standard events
    const META_EVENT_MAP = {
        purchase:  "Purchase",
        lead:      "Lead",
        signup:    "CompleteRegistration",
        subscribe: "Subscribe",
        checkout:  "InitiateCheckout",
        addtocart: "AddToCart",
    };
    const eventName = META_EVENT_MAP[(push.event_name || "").toLowerCase()] || "Purchase";

    const userData = { fbclid: push.click_id, fbc: `fb.1.${Date.now()}.${push.click_id}` };
    const customData = {};
    if (push.value_usd != null) {
        customData.value    = Number(push.value_usd);
        customData.currency = push.currency || "EUR";
    }

    const eventData = {
        data: [{
            event_name:    eventName,
            event_time:    Math.floor(new Date(push.conversion_time).getTime() / 1000),
            action_source: "website",
            user_data:     userData,
            ...(Object.keys(customData).length ? { custom_data: customData } : {}),
        }],
        access_token: token,
    };

    const resp = await fetch(
        `https://graph.facebook.com/v19.0/${pixelId}/events`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(eventData),
        }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error?.message || `HTTP ${resp.status}`);
    if (json.error) throw new Error(json.error.message || "Meta API error");

    return json;
}

async function pushMicrosoftAds(connection, token, push) {
    // Microsoft Ads offline conversions require a SOAP call to the BulkService
    // or a REST call to the Campaign Management API — both are significantly
    // more complex than Google/Meta. This stub queues the record for manual
    // review until the Microsoft Ads REST path is implemented.
    const accountId  = connection.account_id;
    const goalName   = connection.conversion_action || "Purchase";
    if (!accountId) throw new Error("No account_id on Microsoft Ads connection");

    // Microsoft Ads Offline Conversions API (REST preview)
    const body = {
        ConversionGoalName: goalName,
        MicrosoftClickId:   push.click_id,
        ConversionTime:     new Date(push.conversion_time).toISOString(),
        ConversionValue:    push.value_usd != null ? Number(push.value_usd) : undefined,
        ConversionCurrencyCode: push.currency || "EUR",
    };

    const resp = await fetch(
        "https://campaign.api.bingads.microsoft.com/api/advertiser/campaign/v1/ApplyOfflineConversions",
        {
            method: "POST",
            headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${token}`,
                "CustomerAccountId": accountId,
            },
            body: JSON.stringify([body]),
        }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.message || `HTTP ${resp.status}`);
    return json;
}

async function dispatchPush(db, connection, push) {
    const token = await getValidToken(db, connection);
    if (!token) throw new Error("Could not obtain a valid access token");

    switch (connection.platform) {
        case "google_ads":    return await pushGoogleAds(connection, token, push);
        case "meta_ads":      return await pushMetaAds(connection, token, push);
        case "microsoft_ads": return await pushMicrosoftAds(connection, token, push);
        default: throw new Error(`Unsupported platform: ${connection.platform}`);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();

    // ── GET: return recent push records ──────────────────────────────────────
    if (req.method === "GET") {
        const domain = req.query.domain || null;
        const limit  = Math.min(parseInt(req.query.limit || "200", 10), 500);

        const rows = domain
            ? await db.query(
                `SELECT p.id, p.platform, p.click_id, p.event_name, p.value_usd, p.currency,
                        p.status, p.error_message, p.pushed_at, p.created_at, p.site_id,
                        s.domain
                 FROM analytics_conversion_pushes p
                 JOIN analytics_sites s ON s.id = p.site_id
                 WHERE p.organisation_id=$1 AND s.domain=$2
                 ORDER BY p.created_at DESC LIMIT $3`,
                [orgId, domain, limit]
              ).then(r => r.rows)
            : await db.query(
                `SELECT p.id, p.platform, p.click_id, p.event_name, p.value_usd, p.currency,
                        p.status, p.error_message, p.pushed_at, p.created_at, p.site_id,
                        s.domain
                 FROM analytics_conversion_pushes p
                 JOIN analytics_sites s ON s.id = p.site_id
                 WHERE p.organisation_id=$1
                 ORDER BY p.created_at DESC LIMIT $2`,
                [orgId, limit]
              ).then(r => r.rows);

        const stats = { pending: 0, sent: 0, failed: 0 };
        for (const r of rows) stats[r.status] = (stats[r.status] || 0) + 1;

        return res.status(200).json({ pushes: rows, stats });
    }

    // ── POST: process pending conversions ────────────────────────────────────
    if (req.method !== "POST") return res.status(405).end();

    let body = {};
    try {
        body = typeof req.body === "object" && req.body !== null
            ? req.body
            : JSON.parse(req.body || "{}");
    } catch { return res.status(400).json({ error: "Invalid JSON" }); }

    const domain = body.domain || null;
    const limit  = Math.min(parseInt(body.limit || "50", 10), 100);
    const ids    = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : null;

    // Fetch pending push records
    let pushes;
    if (ids?.length) {
        pushes = await db.query(
            `SELECT p.*, s.domain AS site_domain
             FROM analytics_conversion_pushes p
             JOIN analytics_sites s ON s.id = p.site_id
             WHERE p.organisation_id=$1 AND p.id = ANY($2)`,
            [orgId, ids]
        ).then(r => r.rows);
    } else if (domain) {
        pushes = await db.query(
            `SELECT p.*, s.domain AS site_domain
             FROM analytics_conversion_pushes p
             JOIN analytics_sites s ON s.id = p.site_id
             WHERE p.organisation_id=$1 AND s.domain=$2 AND p.status='pending'
             ORDER BY p.created_at LIMIT $3`,
            [orgId, domain, limit]
        ).then(r => r.rows);
    } else {
        pushes = await db.query(
            `SELECT p.*, s.domain AS site_domain
             FROM analytics_conversion_pushes p
             JOIN analytics_sites s ON s.id = p.site_id
             WHERE p.organisation_id=$1 AND p.status='pending'
             ORDER BY p.created_at LIMIT $2`,
            [orgId, limit]
        ).then(r => r.rows);
    }

    if (!pushes.length) return res.status(200).json({ processed: 0, results: [] });

    // Load ad platform connections for this org (one query, reuse across pushes)
    const platforms = [...new Set(pushes.map(p => p.platform))];
    const { rows: connections } = await db.query(
        `SELECT * FROM ad_platform_connections
         WHERE organisation_id=$1 AND platform = ANY($2)`,
        [orgId, platforms]
    ).catch(() => ({ rows: [] }));

    // Index connections by platform + domain for fast lookup
    const connByPlatformDomain = {};
    for (const c of connections) {
        connByPlatformDomain[`${c.platform}:${c.domain}`] = c;
        // Also index without domain as fallback
        if (!connByPlatformDomain[`${c.platform}:`]) {
            connByPlatformDomain[`${c.platform}:`] = c;
        }
    }

    const results = [];

    for (const push of pushes) {
        const conn = connByPlatformDomain[`${push.platform}:${push.site_domain}`]
                  || connByPlatformDomain[`${push.platform}:`];

        if (!conn) {
            await db.query(
                `UPDATE analytics_conversion_pushes
                 SET status='failed', error_message=$1, pushed_at=NOW() WHERE id=$2`,
                ["No ad platform connection found for this domain", push.id]
            ).catch(() => {});
            results.push({ id: push.id, platform: push.platform, status: "failed", error: "No connection found" });
            continue;
        }

        try {
            const platformResp = await dispatchPush(db, conn, push);
            await db.query(
                `UPDATE analytics_conversion_pushes
                 SET status='sent', pushed_at=NOW(), platform_response=$1, error_message=NULL
                 WHERE id=$2`,
                [JSON.stringify(platformResp), push.id]
            ).catch(() => {});
            results.push({ id: push.id, platform: push.platform, status: "sent" });
        } catch (err) {
            const msg = (err.message || "Unknown error").slice(0, 500);
            await db.query(
                `UPDATE analytics_conversion_pushes
                 SET status='failed', error_message=$1, pushed_at=NOW() WHERE id=$2`,
                [msg, push.id]
            ).catch(() => {});
            results.push({ id: push.id, platform: push.platform, status: "failed", error: msg });
        }
    }

    const sent   = results.filter(r => r.status === "sent").length;
    const failed = results.filter(r => r.status === "failed").length;

    return res.status(200).json({ processed: results.length, sent, failed, results });
}
