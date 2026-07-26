/**
 * GET    /api/ad-snapshots?domain=example.com          — list snapshots for org+domain, newest first
 * POST   /api/ad-snapshots                             — body: { domain, snapshot }
 * DELETE /api/ad-snapshots?id=<uuid>                   — delete one snapshot
 * DELETE /api/ad-snapshots?domain=<domain>&all=1       — clear all for domain
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 */

import pkg from "pg";
const { Pool } = pkg;

import { checkAndFireAlerts } from "./_alert-check.js";

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

let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
            id                       TEXT PRIMARY KEY,
            organisation_id          INTEGER NOT NULL,
            domain                   TEXT NOT NULL,
            scope_key                TEXT NOT NULL DEFAULT 'overview',
            scope_label              TEXT,
            platform                 TEXT,
            platform_label           TEXT,
            metric                   TEXT,
            ad_clicks                INTEGER,
            spend                    NUMERIC(12,2),
            currency                 TEXT,
            consents                 INTEGER,
            visible_consents         INTEGER,
            invisible_consents       INTEGER,
            banner_reach_pct         NUMERIC(8,2),
            visible_share_pct        NUMERIC(8,2),
            invisible_share_pct      NUMERIC(8,2),
            visibility_of_consents_pct NUMERIC(8,2),
            cost_per_visible         NUMERIC(12,4),
            source_filter_active     BOOLEAN,
            source_pattern           TEXT,
            matched_sources          TEXT,
            scope_consents           INTEGER,
            coverage_of_scope_pct    NUMERIC(8,2),
            from_date                DATE,
            to_date                  DATE,
            saved_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`
        CREATE INDEX IF NOT EXISTS reconciliation_snapshots_org_domain_idx
            ON reconciliation_snapshots(organisation_id, domain)
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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
        return payload;
    } catch {
        return null;
    }
}

function cleanDomain(raw) {
    if (!raw) return null;
    return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
}

function nullIfEmpty(v) {
    if (v === "" || v === undefined) return null;
    return v;
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || req.headers["organization"] || "0", 10);
    if (!organisationId) return res.status(400).json({ error: "Missing Organisation header" });

    const db = getPool();

    try {
        await ensureTable(db);

        // ── GET ───────────────────────────────────────────────────────────────
        if (req.method === "GET") {
            const domain = cleanDomain(req.query.domain);
            if (!domain) return res.status(400).json({ error: "domain query param is required" });

            const { rows } = await db.query(
                `SELECT * FROM reconciliation_snapshots
                  WHERE organisation_id = $1 AND domain = $2
                  ORDER BY saved_at DESC`,
                [organisationId, domain]
            );
            return res.json({ snapshots: rows });
        }

        // ── POST ──────────────────────────────────────────────────────────────
        if (req.method === "POST") {
            const body = req.body || {};
            const domain = cleanDomain(body.domain);
            if (!domain) return res.status(400).json({ error: "domain is required" });
            const s = body.snapshot;
            if (!s || typeof s !== "object") return res.status(400).json({ error: "snapshot is required" });

            const id = s.id || `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

            await db.query(
                `INSERT INTO reconciliation_snapshots (
                    id, organisation_id, domain, scope_key, scope_label,
                    platform, platform_label, metric,
                    ad_clicks, spend, currency,
                    consents, visible_consents, invisible_consents,
                    banner_reach_pct, visible_share_pct, invisible_share_pct,
                    visibility_of_consents_pct, cost_per_visible,
                    source_filter_active, source_pattern, matched_sources,
                    scope_consents, coverage_of_scope_pct,
                    from_date, to_date, saved_at
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                    $18,$19,$20,$21,$22,$23,$24,$25,$26,$27
                ) ON CONFLICT (id) DO NOTHING`,
                [
                    id,
                    organisationId,
                    domain,
                    s.scopeKey     || "overview",
                    nullIfEmpty(s.scopeLabel),
                    nullIfEmpty(s.platform),
                    nullIfEmpty(s.platformLabel),
                    nullIfEmpty(s.metric),
                    s.adClicks != null && s.adClicks !== "" ? Number(s.adClicks) : null,
                    s.spend    != null && s.spend    !== "" ? Number(s.spend)    : null,
                    nullIfEmpty(s.currency),
                    s.consents        != null ? Number(s.consents)        : null,
                    s.visibleConsents != null ? Number(s.visibleConsents) : null,
                    s.invisibleConsents != null ? Number(s.invisibleConsents) : null,
                    s.bannerReachPct           != null && s.bannerReachPct           !== "" ? Number(s.bannerReachPct)           : null,
                    s.visibleSharePct          != null && s.visibleSharePct          !== "" ? Number(s.visibleSharePct)          : null,
                    s.invisibleSharePct        != null && s.invisibleSharePct        !== "" ? Number(s.invisibleSharePct)        : null,
                    s.visibilityOfConsentsPct  != null && s.visibilityOfConsentsPct  !== "" ? Number(s.visibilityOfConsentsPct)  : null,
                    s.costPerVisible           != null && s.costPerVisible           !== "" ? Number(s.costPerVisible)           : null,
                    s.sourceFilterActive === true || s.sourceFilterActive === "yes",
                    nullIfEmpty(s.sourcePattern),
                    nullIfEmpty(s.matchedSources),
                    s.scopeConsents        != null && s.scopeConsents        !== "" ? Number(s.scopeConsents)        : null,
                    s.coverageOfScopePct   != null && s.coverageOfScopePct   !== "" ? Number(s.coverageOfScopePct)   : null,
                    nullIfEmpty(s.fromDate),
                    nullIfEmpty(s.toDate),
                    s.savedAt ? new Date(s.savedAt) : new Date(),
                ]
            );

            // Fire alert check non-blocking
            checkAndFireAlerts(db, { orgId: organisationId, domain, snapshot: { ...s, id } })
                .catch(err => console.error("[ad-snapshots] alert check:", err.message));

            return res.status(201).json({ ok: true, id });
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (req.method === "DELETE") {
            const id = req.query.id;
            const domain = cleanDomain(req.query.domain);
            const all = req.query.all === "1";

            if (id) {
                await db.query(
                    `DELETE FROM reconciliation_snapshots WHERE id = $1 AND organisation_id = $2`,
                    [id, organisationId]
                );
                return res.json({ ok: true });
            }

            if (domain && all) {
                await db.query(
                    `DELETE FROM reconciliation_snapshots WHERE organisation_id = $1 AND domain = $2`,
                    [organisationId, domain]
                );
                return res.json({ ok: true });
            }

            return res.status(400).json({ error: "Provide ?id=<uuid> or ?domain=<domain>&all=1" });
        }

        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("[ad-snapshots] Error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
