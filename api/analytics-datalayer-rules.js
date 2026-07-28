/**
 * GET    /api/analytics-datalayer-rules?domain=<domain>                    → list rules
 * POST   /api/analytics-datalayer-rules   body: { domain, datalayerEvent,
 *           mapsToName, kind, valuePath, currencyPath, transactionIdPath }  → create/update a rule
 * DELETE /api/analytics-datalayer-rules?domain=<domain>&datalayerEvent=<x>  → remove a rule
 *
 * Maps a window.dataLayer push (matched by its "event" key) to an
 * intaAnalytics.track() call. Deliberately only exposes three fixed, typed
 * extraction slots (value/currency/transactionId) rather than an arbitrary
 * field mapper — see api/a.js's analytics_datalayer_rules table comment for why.
 *
 * Requires headers: Authorization: Bearer <token>   Organisation: <org_id>
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
    "https://analytics.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

const ALLOWED_KINDS = new Set(["purchase", "click", "custom"]);
const NAME_RE = /^[a-z0-9_-]{1,64}$/i;
// Dot-path into the pushed object — letters/numbers/underscore per segment,
// at most 4 segments deep (also re-enforced client-side at extraction time).
const PATH_RE = /^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$/i;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
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

function validPath(p) {
    if (p == null || p === "") return true; // optional field
    return typeof p === "string" && p.length <= 120 && PATH_RE.test(p);
}

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_datalayer_rules (
            id                  BIGSERIAL    PRIMARY KEY,
            site_id             VARCHAR(32)  NOT NULL,
            organisation_id     INTEGER      NOT NULL,
            datalayer_event     VARCHAR(64)  NOT NULL,
            maps_to_name        VARCHAR(64)  NOT NULL,
            kind                VARCHAR(16)  NOT NULL DEFAULT 'custom',
            value_path          VARCHAR(120),
            currency_path       VARCHAR(120),
            transaction_id_path VARCHAR(120),
            enabled             BOOLEAN      NOT NULL DEFAULT true,
            created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (site_id, datalayer_event)
        );
        CREATE INDEX IF NOT EXISTS idx_adr_site ON analytics_datalayer_rules (site_id);
    `).catch(() => {});
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTable(db);

    async function resolveSiteId(domain) {
        const { rows } = await db.query(
            `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND domain = $2 AND active = true LIMIT 1`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));
        return rows[0]?.id || null;
    }

    // ── GET: list rules for a domain ───────────────────────────────────────────
    if (req.method === "GET") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(200).json({ rules: [] });

        const { rows } = await db.query(
            `SELECT datalayer_event, maps_to_name, kind, value_path, currency_path,
                    transaction_id_path, enabled, created_at
             FROM analytics_datalayer_rules
             WHERE site_id = $1 ORDER BY created_at ASC`,
            [siteId]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({
            rules: rows.map(r => ({
                datalayerEvent:   r.datalayer_event,
                mapsToName:       r.maps_to_name,
                kind:             r.kind,
                valuePath:        r.value_path,
                currencyPath:     r.currency_path,
                transactionIdPath: r.transaction_id_path,
                enabled:          r.enabled,
            })),
        });
    }

    // ── POST: create or update a rule ──────────────────────────────────────────
    if (req.method === "POST") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const domain          = (body.domain || "").trim().toLowerCase();
        const datalayerEvent  = (body.datalayerEvent || "").trim().toLowerCase();
        const mapsToName      = (body.mapsToName || datalayerEvent || "").trim().toLowerCase();
        const kind             = ALLOWED_KINDS.has(body.kind) ? body.kind : "custom";
        const valuePath        = (body.valuePath || "").trim() || null;
        const currencyPath     = (body.currencyPath || "").trim() || null;
        const transactionIdPath = (body.transactionIdPath || "").trim() || null;
        const enabled          = body.enabled !== false;

        if (!domain) return res.status(400).json({ error: "domain is required" });
        if (!NAME_RE.test(datalayerEvent)) {
            return res.status(400).json({ error: "datalayerEvent must be 1-64 letters, numbers, - or _" });
        }
        if (!NAME_RE.test(mapsToName)) {
            return res.status(400).json({ error: "mapsToName must be 1-64 letters, numbers, - or _" });
        }
        if (!validPath(valuePath) || !validPath(currencyPath) || !validPath(transactionIdPath)) {
            return res.status(400).json({ error: "Paths must be dot-separated (max 4 levels), letters/numbers/underscore only" });
        }

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(404).json({ error: "No site key found for this domain. Generate one first." });

        const { rows } = await db.query(
            `INSERT INTO analytics_datalayer_rules
             (site_id, organisation_id, datalayer_event, maps_to_name, kind, value_path, currency_path, transaction_id_path, enabled)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (site_id, datalayer_event) DO UPDATE SET
               maps_to_name        = EXCLUDED.maps_to_name,
               kind                = EXCLUDED.kind,
               value_path          = EXCLUDED.value_path,
               currency_path       = EXCLUDED.currency_path,
               transaction_id_path = EXCLUDED.transaction_id_path,
               enabled             = EXCLUDED.enabled
             RETURNING datalayer_event, maps_to_name, kind, value_path, currency_path, transaction_id_path, enabled`,
            [siteId, orgId, datalayerEvent, mapsToName, kind, valuePath, currencyPath, transactionIdPath, enabled]
        );

        const r = rows[0];
        return res.status(201).json({
            datalayerEvent: r.datalayer_event, mapsToName: r.maps_to_name, kind: r.kind,
            valuePath: r.value_path, currencyPath: r.currency_path,
            transactionIdPath: r.transaction_id_path, enabled: r.enabled,
        });
    }

    // ── DELETE: remove a rule ──────────────────────────────────────────────────
    if (req.method === "DELETE") {
        const domain         = (req.query.domain || "").trim().toLowerCase();
        const datalayerEvent = (req.query.datalayerEvent || "").trim().toLowerCase();
        if (!domain || !datalayerEvent) return res.status(400).json({ error: "domain and datalayerEvent are required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(200).json({ ok: true });

        await db.query(
            `DELETE FROM analytics_datalayer_rules WHERE site_id = $1 AND datalayer_event = $2`,
            [siteId, datalayerEvent]
        ).catch(() => {});

        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
