/**
 * GET  /api/ad-connection-pending?id=<uuid>
 *   Returns the accounts list for a pending OAuth connection (no tokens exposed).
 *   Required headers: Authorization, Organisation
 *
 * POST /api/ad-connection-pending?id=<uuid>
 *   Body: { accountId, accountLabel }
 *   Finalises the connection: moves tokens from pending to ad_platform_connections,
 *   then deletes the pending record.
 *   Required headers: Authorization, Organisation
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
        const parts = match[1].split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
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

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id is required" });

    const db = getPool();

    if (req.method === "GET") {
        const { rows } = await db.query(
            `SELECT platform, domain, accounts FROM pending_ad_connections
             WHERE id = $1 AND organisation_id = $2 AND expires_at > NOW()`,
            [id, orgId]
        );
        if (rows.length === 0) return res.status(404).json({ error: "Pending connection not found or expired." });
        const row = rows[0];
        return res.status(200).json({
            platform: row.platform,
            domain: row.domain,
            accounts: row.accounts,
        });
    }

    if (req.method === "POST") {
        const { accountId, accountLabel } = req.body || {};
        if (!accountId) return res.status(400).json({ error: "accountId is required" });

        const { rows } = await db.query(
            `SELECT * FROM pending_ad_connections
             WHERE id = $1 AND organisation_id = $2 AND expires_at > NOW()`,
            [id, orgId]
        );
        if (rows.length === 0) return res.status(404).json({ error: "Pending connection not found or expired. Please reconnect." });

        const pending = rows[0];
        const label = accountLabel
            || pending.accounts?.find?.(a => a.id === accountId)?.name
            || accountId;

        await db.query(`
            CREATE TABLE IF NOT EXISTS ad_platform_connections (
                id               SERIAL      PRIMARY KEY,
                organisation_id  INTEGER     NOT NULL,
                domain           TEXT        NOT NULL,
                platform         TEXT        NOT NULL,
                account_id       TEXT,
                account_label    TEXT,
                access_token     TEXT,
                refresh_token    TEXT,
                token_expires_at TIMESTAMPTZ,
                scopes           TEXT,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (organisation_id, domain, platform)
            )
        `);

        await db.query(
            `INSERT INTO ad_platform_connections
                (organisation_id, domain, platform, account_id, account_label, access_token, refresh_token, token_expires_at, scopes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (organisation_id, domain, platform) DO UPDATE SET
                account_id       = EXCLUDED.account_id,
                account_label    = EXCLUDED.account_label,
                access_token     = EXCLUDED.access_token,
                refresh_token    = COALESCE(EXCLUDED.refresh_token, ad_platform_connections.refresh_token),
                token_expires_at = EXCLUDED.token_expires_at,
                scopes           = EXCLUDED.scopes,
                updated_at       = NOW()`,
            [orgId, pending.domain, pending.platform, accountId, label,
             pending.access_token, pending.refresh_token, pending.token_expires_at, pending.scopes]
        );

        // Clean up pending record
        await db.query(`DELETE FROM pending_ad_connections WHERE id = $1`, [id]);

        return res.status(200).json({ ok: true, platform: pending.platform, domain: pending.domain, accountId, accountLabel: label });
    }

    return res.status(405).json({ error: "Method not allowed" });
}
