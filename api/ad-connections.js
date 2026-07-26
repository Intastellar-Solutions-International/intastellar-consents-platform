/**
 * GET    /api/ad-connections?domain=example.com  — list connections for org (optionally filtered by domain)
 * DELETE /api/ad-connections?platform=google_ads&domain=example.com — remove a connection
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * Required env vars:
 *   POSTGRES_URL — Neon connection string
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
    res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

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
    tableReady = true;
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTable(db);

    if (req.method === "GET") {
        const { domain } = req.query;
        const result = domain
            ? await db.query(
                `SELECT id, platform, domain, account_id, account_label, login_customer_id, account_currency, scopes, created_at, updated_at
                 FROM ad_platform_connections WHERE organisation_id=$1 AND domain=$2 ORDER BY platform`,
                [orgId, domain]
            )
            : await db.query(
                `SELECT id, platform, domain, account_id, account_label, login_customer_id, account_currency, scopes, created_at, updated_at
                 FROM ad_platform_connections WHERE organisation_id=$1 ORDER BY domain, platform`,
                [orgId]
            );
        return res.status(200).json({ connections: result.rows });
    }

    if (req.method === "DELETE") {
        const { platform, domain } = req.query;
        if (!platform || !domain) return res.status(400).json({ error: "platform and domain are required" });
        await db.query(
            `DELETE FROM ad_platform_connections WHERE organisation_id=$1 AND domain=$2 AND platform=$3`,
            [orgId, domain, platform]
        );
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
}
