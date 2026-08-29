import { getPool } from "./_db.js";
/**
 * GET    /api/ad-connections?domain=example.com  — list connections for org (optionally filtered by domain)
 * DELETE /api/ad-connections?platform=google_ads&domain=example.com — remove a connection
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * Required env vars:
 *   POSTGRES_URL — Neon connection string
 */
function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        // Token is base64-encoded wholesale (per Authentication.php JWTDecode):
        // base64_decode(token) → "header.payload.sig", then payload is decoded again.
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
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

// Platforms that authenticate with a static API key instead of OAuth.
// POST /api/ad-connections verifies the key and saves the connection.
const API_KEY_PLATFORMS = new Set(["openai_ads"]);

let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS ad_platform_connections (
            id                SERIAL PRIMARY KEY,
            organisation_id   INTEGER NOT NULL,
            domain            TEXT    NOT NULL,
            platform          TEXT    NOT NULL,
            account_id        TEXT,
            account_label     TEXT,
            login_customer_id TEXT,
            account_currency  TEXT,
            access_token      TEXT,
            refresh_token     TEXT,
            token_expires_at  TIMESTAMPTZ,
            scopes            TEXT,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain, platform)
        )
    `);
    await db.query(`ALTER TABLE ad_platform_connections ADD COLUMN IF NOT EXISTS login_customer_id TEXT`).catch(() => {});
    await db.query(`ALTER TABLE ad_platform_connections ADD COLUMN IF NOT EXISTS account_currency TEXT`).catch(() => {});
    // conversion_action stores the platform-specific conversion identifier needed to push:
    // Google Ads → resource name like "customers/123/conversionActions/456"
    // Microsoft Ads → conversion goal name (string)
    // Meta Ads → not needed (uses account_id as pixel_id + standard event names)
    await db.query(`ALTER TABLE ad_platform_connections ADD COLUMN IF NOT EXISTS conversion_action TEXT`).catch(() => {});
    tableReady = true;
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const authHeader = req.headers.authorization
        || (req.query.token ? `Bearer ${req.query.token}` : "");
    const jwt = validateJwt(authHeader);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(
        req.headers.organisation || req.headers.organization || req.query.org || "0", 10
    );
    if (!orgId) return res.status(400).json({ error: "Organisation header or ?org param required" });

    const db = getPool();
    await ensureTable(db);

    if (req.method === "GET") {
        const { domain } = req.query;

        // Query finalized connections
        const finalizedResult = domain
            ? await db.query(
                `SELECT id, platform, domain, account_id, account_label, login_customer_id, account_currency, scopes,
                        conversion_action, created_at, updated_at,
                        (access_token IS NOT NULL) AS has_token, NULL::uuid AS pending_id
                 FROM ad_platform_connections WHERE organisation_id=$1 AND domain=$2 ORDER BY platform`,
                [orgId, domain]
            )
            : await db.query(
                `SELECT id, platform, domain, account_id, account_label, login_customer_id, account_currency, scopes,
                        conversion_action, created_at, updated_at,
                        (access_token IS NOT NULL) AS has_token, NULL::uuid AS pending_id
                 FROM ad_platform_connections WHERE organisation_id=$1 ORDER BY domain, platform`,
                [orgId]
            );

        // Also check pending_ad_connections for OAuth flows that completed but never had
        // an account selected. Surface these so the user can finish without re-doing OAuth.
        let pendingRows = [];
        try {
            const pendingParams = domain ? [orgId, domain] : [orgId];
            const pendingWhere = domain
                ? `WHERE organisation_id=$1 AND domain=$2`
                : `WHERE organisation_id=$1`;

            const pendingResult = await db.query(
                `SELECT DISTINCT ON (organisation_id, domain, platform)
                        id AS pending_id, platform, domain, scopes, created_at
                 FROM pending_ad_connections
                 ${pendingWhere}
                 ORDER BY organisation_id, domain, platform, created_at DESC`,
                pendingParams
            );

            // Only surface pending entries that don't already have a finalized connection
            const finalizedKey = new Set(
                finalizedResult.rows.map(r => `${r.domain}|${r.platform}`)
            );
            pendingRows = pendingResult.rows
                .filter(r => !finalizedKey.has(`${r.domain}|${r.platform}`))
                .map(r => ({
                    id: null,
                    platform: r.platform,
                    domain: r.domain,
                    account_id: null,
                    account_label: null,
                    login_customer_id: null,
                    account_currency: null,
                    scopes: r.scopes,
                    created_at: r.created_at,
                    updated_at: r.created_at,
                    has_token: true,
                    pending_id: r.pending_id,
                }));
        } catch (_) {
            // pending_ad_connections table doesn't exist yet — ignore
        }

        const connections = [...finalizedResult.rows, ...pendingRows]
            .sort((a, b) => (a.domain || "").localeCompare(b.domain || "") || a.platform.localeCompare(b.platform));

        return res.status(200).json({ connections });
    }

    if (req.method === "POST") {
        let body = {};
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch { return res.status(400).json({ error: "Invalid JSON" }); }

        const { platform, domain, apiKey } = body;
        if (!platform || !domain || !apiKey) {
            return res.status(400).json({ error: "platform, domain, and apiKey are required" });
        }
        if (!API_KEY_PLATFORMS.has(platform)) {
            return res.status(400).json({ error: `${platform} uses OAuth — use the Connect button instead` });
        }

        // Verify the key against the ad account endpoint and fetch account metadata
        let accountId, accountLabel, currency;
        try {
            const verifyResp = await fetch("https://api.ads.openai.com/v1/ad_account", {
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            });
            if (!verifyResp.ok) {
                const raw = await verifyResp.text().catch(() => "");
                return res.status(400).json({ error: `OpenAI Ads rejected the key (${verifyResp.status}): ${raw.slice(0, 120)}` });
            }
            const acct = await verifyResp.json();
            accountId    = acct.id   || null;
            accountLabel = acct.name || acct.url || acct.id || "OpenAI Ads account";
            currency     = acct.currency_code || "USD";
        } catch (err) {
            return res.status(502).json({ error: `Could not reach OpenAI Ads API: ${err.message}` });
        }

        await db.query(`
            INSERT INTO ad_platform_connections
                (organisation_id, domain, platform, account_id, account_label, account_currency, access_token, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (organisation_id, domain, platform) DO UPDATE SET
                account_id       = EXCLUDED.account_id,
                account_label    = EXCLUDED.account_label,
                account_currency = EXCLUDED.account_currency,
                access_token     = EXCLUDED.access_token,
                updated_at       = NOW()`,
            [orgId, domain, platform, accountId, accountLabel, currency, apiKey]
        );

        return res.status(200).json({ ok: true, accountId, accountLabel, currency });
    }

    if (req.method === "PATCH") {
        const { platform, domain } = req.query;
        if (!platform || !domain) return res.status(400).json({ error: "?platform= and ?domain= required" });
        let body = {};
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch { return res.status(400).json({ error: "Invalid JSON" }); }
        const { conversionAction } = body;
        await db.query(
            `UPDATE ad_platform_connections SET conversion_action=$1, updated_at=NOW()
             WHERE organisation_id=$2 AND domain=$3 AND platform=$4`,
            [conversionAction || null, orgId, domain, platform]
        );
        return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
        const { platform, domain } = req.query;
        if (!platform || !domain) return res.status(400).json({ error: "platform and domain are required" });
        // Soft-disconnect: clear tokens but keep conversion_action and other settings so
        // they survive a reconnect. The row without tokens is treated as disconnected by
        // the GET handler (has_token = false) and the OAuth callback upserts tokens back in.
        await db.query(
            `UPDATE ad_platform_connections
             SET access_token=NULL, refresh_token=NULL, token_expires_at=NULL, scopes=NULL, updated_at=NOW()
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3`,
            [orgId, domain, platform]
        );
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
}
