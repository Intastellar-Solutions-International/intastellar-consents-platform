import { getPool } from "./_db.js";
/**
 * GET  /api/jurisdiction-config  — fetch org's saved jurisdiction config
 * POST /api/jurisdiction-config  — save org's jurisdiction config
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 *
 * Table DDL (auto-created on first request):
 *   CREATE TABLE IF NOT EXISTS jurisdiction_config (
 *     organisation_id INTEGER PRIMARY KEY,
 *     managed         BOOLEAN NOT NULL DEFAULT false,
 *     config          JSONB NOT NULL DEFAULT '{}',
 *     updated_at      TIMESTAMPTZ DEFAULT NOW()
 *   );
 */
let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS jurisdiction_config (
            organisation_id INTEGER PRIMARY KEY,
            managed         BOOLEAN NOT NULL DEFAULT false,
            config          JSONB NOT NULL DEFAULT '{}',
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    tableReady = true;
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

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || "0", 10);
    if (!organisationId) return res.status(400).json({ error: "Missing Organisation header" });

    const db = getPool();

    try {
        await ensureTable(db);

        if (req.method === "GET") {
            const { rows } = await db.query(
                `SELECT managed, config FROM jurisdiction_config WHERE organisation_id = $1`,
                [organisationId]
            );
            if (!rows.length) return res.json({ managed: false, config: {} });
            return res.json({ managed: rows[0].managed, config: rows[0].config });
        }

        if (req.method === "POST") {
            const { managed = false, config = {} } = req.body || {};
            await db.query(
                `INSERT INTO jurisdiction_config (organisation_id, managed, config, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (organisation_id) DO UPDATE
                   SET managed = EXCLUDED.managed,
                       config  = EXCLUDED.config,
                       updated_at = NOW()`,
                [organisationId, Boolean(managed), JSON.stringify(config)]
            );
            return res.json({ ok: true });
        }

        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("[jurisdiction-config] Error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
