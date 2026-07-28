/**
 * GET  /api/analytics-site?domain=<domain>   → { id, domain, active, created_at }
 * POST /api/analytics-site  body: { domain }  → { id, domain, active, created_at, created: bool }
 *
 * Manages site keys for the first-party analytics script.
 * A site key is a short random identifier embedded in the <script> tag.
 * The ingest endpoint (/api/a POST) validates the site_id against this table.
 *
 * Requires headers: Authorization: Bearer <token>   Organisation: <org_id>
 */

import pkg from "pg";
const { Pool } = pkg;
import { randomBytes } from "crypto";

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

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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

function generateSiteId() {
    return randomBytes(12).toString("base64url").slice(0, 16);
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();

    // Ensure the sites table exists (no-op after first call)
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_sites (
            id              VARCHAR(32)  PRIMARY KEY,
            organisation_id INTEGER      NOT NULL,
            domain          VARCHAR(255) NOT NULL,
            active          BOOLEAN      NOT NULL DEFAULT true,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain)
        )
    `).catch(() => {});
    await db.query(`
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS heatmaps_enabled          BOOLEAN  NOT NULL DEFAULT true;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_enabled         BOOLEAN  NOT NULL DEFAULT false;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_sample_rate     SMALLINT NOT NULL DEFAULT 20;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_retention_days  SMALLINT NOT NULL DEFAULT 30;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS heatmap_retention_days    SMALLINT NOT NULL DEFAULT 90;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_block_selectors TEXT[]   NOT NULL DEFAULT '{}';
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_mask_selectors  TEXT[]   NOT NULL DEFAULT '{}';
    `).catch(() => {});

    // ── GET (list mode): which of this org's domains have analytics set up ────
    // Used by the property selector to highlight/filter domains with an active
    // site key, without a per-domain round trip for every entry in the list.
    if (req.method === "GET" && (req.query.list === "1" || req.query.list === "true")) {
        const { rows } = await db.query(
            `SELECT domain, active FROM analytics_sites WHERE organisation_id = $1`,
            [orgId]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({
            sites: rows.map(r => ({ domain: r.domain, active: r.active })),
        });
    }

    // ── GET: return existing site key for a domain ────────────────────────────
    if (req.method === "GET") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        const { rows } = await db.query(
            `SELECT id, domain, active, created_at,
                    heatmaps_enabled, recording_enabled, recording_sample_rate,
                    recording_retention_days, heatmap_retention_days,
                    recording_block_selectors, recording_mask_selectors,
                    datalayer_enabled,
                    lead_quality_enabled, lead_require_engaged,
                    lead_qualifying_pages, lead_qualifying_events
             FROM analytics_sites
             WHERE organisation_id = $1 AND domain = $2
             LIMIT 1`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));

        if (!rows.length) return res.status(404).json({ error: "No site key found for this domain." });
        return res.status(200).json(rows[0]);
    }

    // ── PATCH: update per-site behavior-analytics settings ────────────────────
    if (req.method === "PATCH") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const sets = [];
        const params = [orgId, domain];
        let i = 3;

        if (typeof body.heatmapsEnabled === "boolean") { sets.push(`heatmaps_enabled = $${i++}`); params.push(body.heatmapsEnabled); }
        if (typeof body.recordingEnabled === "boolean") { sets.push(`recording_enabled = $${i++}`); params.push(body.recordingEnabled); }
        if (typeof body.sampleRate === "number" && isFinite(body.sampleRate)) {
            sets.push(`recording_sample_rate = $${i++}`);
            params.push(Math.min(100, Math.max(0, Math.round(body.sampleRate))));
        }
        if (typeof body.recordingRetentionDays === "number" && isFinite(body.recordingRetentionDays)) {
            sets.push(`recording_retention_days = $${i++}`);
            params.push(Math.min(365, Math.max(1, Math.round(body.recordingRetentionDays))));
        }
        if (typeof body.heatmapRetentionDays === "number" && isFinite(body.heatmapRetentionDays)) {
            sets.push(`heatmap_retention_days = $${i++}`);
            params.push(Math.min(365, Math.max(1, Math.round(body.heatmapRetentionDays))));
        }
        if (Array.isArray(body.blockSelectors)) {
            sets.push(`recording_block_selectors = $${i++}`);
            params.push(body.blockSelectors.map(s => String(s).slice(0, 200)).slice(0, 50));
        }
        if (Array.isArray(body.maskSelectors)) {
            sets.push(`recording_mask_selectors = $${i++}`);
            params.push(body.maskSelectors.map(s => String(s).slice(0, 200)).slice(0, 50));
        }
        if (typeof body.datalayerEnabled === "boolean") {
            sets.push(`datalayer_enabled = $${i++}`);
            params.push(body.datalayerEnabled);
        }
        if (typeof body.leadQualityEnabled === "boolean") {
            sets.push(`lead_quality_enabled = $${i++}`);
            params.push(body.leadQualityEnabled);
        }
        if (typeof body.leadRequireEngaged === "boolean") {
            sets.push(`lead_require_engaged = $${i++}`);
            params.push(body.leadRequireEngaged);
        }
        if (Array.isArray(body.leadQualifyingPages)) {
            sets.push(`lead_qualifying_pages = $${i++}`);
            params.push(body.leadQualifyingPages.map(s => String(s).slice(0, 200)).slice(0, 50));
        }
        if (Array.isArray(body.leadQualifyingEvents)) {
            sets.push(`lead_qualifying_events = $${i++}`);
            params.push(body.leadQualifyingEvents.map(s => String(s).slice(0, 64)).slice(0, 50));
        }

        if (!sets.length) return res.status(400).json({ error: "No valid fields to update" });

        const { rows } = await db.query(
            `UPDATE analytics_sites SET ${sets.join(", ")}
             WHERE organisation_id = $1 AND domain = $2
             RETURNING id, domain, active, heatmaps_enabled, recording_enabled,
                       recording_sample_rate, recording_retention_days, heatmap_retention_days,
                       recording_block_selectors, recording_mask_selectors,
                       datalayer_enabled, lead_quality_enabled, lead_require_engaged,
                       lead_qualifying_pages, lead_qualifying_events`,
            params
        ).catch(() => ({ rows: [] }));

        if (!rows.length) return res.status(404).json({ error: "No site key found for this domain." });
        return res.status(200).json(rows[0]);
    }

    // ── POST: create or return site key ──────────────────────────────────────
    if (req.method === "POST") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const domain = (body.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        // Normalise domain — strip protocol if accidentally included
        const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

        // Check if one already exists
        const { rows: existing } = await db.query(
            `SELECT id, domain, active, created_at FROM analytics_sites
             WHERE organisation_id = $1 AND domain = $2 LIMIT 1`,
            [orgId, cleanDomain]
        ).catch(() => ({ rows: [] }));

        if (existing.length) {
            return res.status(200).json({ ...existing[0], created: false });
        }

        const siteId = generateSiteId();
        const { rows: inserted } = await db.query(
            `INSERT INTO analytics_sites (id, organisation_id, domain)
             VALUES ($1, $2, $3)
             RETURNING id, domain, active, created_at`,
            [siteId, orgId, cleanDomain]
        );

        return res.status(201).json({ ...inserted[0], created: true });
    }

    // ── DELETE: deactivate a site key ─────────────────────────────────────────
    if (req.method === "DELETE") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        await db.query(
            `UPDATE analytics_sites SET active = false
             WHERE organisation_id = $1 AND domain = $2`,
            [orgId, domain]
        ).catch(() => {});

        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
