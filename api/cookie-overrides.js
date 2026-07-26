/**
 * GET  /api/cookie-overrides?domain=example.com  — load overrides for a domain
 * POST /api/cookie-overrides                      — upsert overrides for a domain
 *
 * Authenticated (Bearer JWT + Organisation header required).
 *
 * POST body: { domain: string, overrides: Record<cookieName, { bannerCategory?, vendor?, description? }> }
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

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return null;
        return payload;
    } catch {
        return null;
    }
}

let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS cookie_overrides (
            id              SERIAL PRIMARY KEY,
            domain          VARCHAR(255) NOT NULL,
            cookie_name     VARCHAR(255) NOT NULL,
            banner_category VARCHAR(64),
            vendor          VARCHAR(255),
            description     TEXT,
            updated_at      TIMESTAMP DEFAULT NOW(),
            UNIQUE (domain, cookie_name)
        )
    `);
    tableReady = true;
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();

    try {
        await ensureTable(db);

        if (req.method === "GET") {
            let domain = ((req.query.domain || "")).trim().toLowerCase()
                .replace(/^https?:\/\//, "").split("/")[0];
            if (!domain) return res.status(400).json({ error: "domain query parameter is required" });

            const { rows } = await db.query(
                `SELECT cookie_name, banner_category, vendor, description
                   FROM cookie_overrides
                  WHERE domain = $1`,
                [domain]
            );

            const overrides = {};
            for (const r of rows) {
                overrides[r.cookie_name] = {
                    bannerCategory: r.banner_category || "",
                    vendor:         r.vendor          || "",
                    description:    r.description     || "",
                };
            }
            return res.json({ domain, overrides });
        }

        if (req.method === "POST") {
            const { domain: rawDomain, overrides } = req.body || {};
            let domain = (rawDomain || "").trim().toLowerCase()
                .replace(/^https?:\/\//, "").split("/")[0];
            if (!domain) return res.status(400).json({ error: "domain is required" });
            if (!overrides || typeof overrides !== "object") {
                return res.status(400).json({ error: "overrides must be an object" });
            }

            for (const [cookieName, ov] of Object.entries(overrides)) {
                await db.query(
                    `INSERT INTO cookie_overrides (domain, cookie_name, banner_category, vendor, description, updated_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())
                     ON CONFLICT (domain, cookie_name) DO UPDATE
                       SET banner_category = EXCLUDED.banner_category,
                           vendor          = EXCLUDED.vendor,
                           description     = EXCLUDED.description,
                           updated_at      = NOW()`,
                    [
                        domain,
                        cookieName,
                        ov.bannerCategory || null,
                        ov.vendor         || null,
                        ov.description    || null,
                    ]
                );
            }

            return res.json({ ok: true, domain, saved: Object.keys(overrides).length });
        }

        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });

    } catch (err) {
        console.error("[cookie-overrides] error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
