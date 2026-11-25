import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { LEVELS } from "./_locations.js";

/**
 * /api/analytics-pins — reports pinned to a site's Analytics Overview. A pin
 * stores which report and how it was set up (not its numbers): the Overview
 * re-runs it for whatever period is selected there.
 *
 *   GET    ?domain=            → { pins: [{ id, kind, title, config, createdBy, createdAt }] }
 *   POST   ?domain=  { kind, title, config } → the new pin
 *   DELETE ?domain=&id=
 *
 * Kinds: "locations" (api/analytics-locations.js) —
 *   config { level, country?, region?, metric, product? }
 *
 * Signed in: Authorization + Organisation (requireMember).
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
export const MAX_PINS = 12;
const METRICS = ["sessions", "pageviews", "conversions", "revenue", "units"];

/** Body → { kind, title, config } with only known fields, or { error }. */
export function cleanPin(body) {
    const { kind, title, config } = body || {};
    if (kind !== "locations") return { error: "unknown kind" };
    const c = config && typeof config === "object" ? config : {};
    const level = LEVELS.includes(c.level) ? c.level : "country";
    const country = /^[A-Za-z]{2}$/.test(String(c.country || "")) ? String(c.country).toUpperCase() : null;
    if (level !== "country" && !country) return { error: "country is required for the region and city levels" };
    const clean = {
        level,
        country: level === "country" ? null : country,
        region: level === "city" && c.region ? String(c.region).slice(0, 64) : null,
        metric: METRICS.includes(c.metric) ? c.metric : "sessions",
        product: c.product ? String(c.product).slice(0, 100) : null,
    };
    const name = String(title || "").trim().slice(0, 120);
    if (!name) return { error: "title is required" };
    return { kind, title: name, config: clean };
}

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_pinned_reports (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            kind            VARCHAR(32)  NOT NULL,
            title           VARCHAR(120) NOT NULL,
            config          JSONB        NOT NULL DEFAULT '{}',
            created_by      VARCHAR(255),
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_apr_site ON analytics_pinned_reports (site_id, organisation_id);
    `);
}

const shape = (r) => ({ id: Number(r.id), kind: r.kind, title: r.title, config: r.config, createdBy: r.created_by, createdAt: r.created_at });

export async function handlePins(db, member, method, query, body) {
    await ensureTable(db);
    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, String(query.domain || "").trim()],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };
    const siteId = sites[0].id;

    if (method === "GET") {
        const { rows } = await db.query(
            "SELECT * FROM analytics_pinned_reports WHERE site_id = $1 AND organisation_id = $2 ORDER BY created_at, id",
            [siteId, member.organisationId],
        );
        return { status: 200, body: { pins: rows.map(shape) } };
    }
    if (method === "POST") {
        const pin = cleanPin(body);
        if (pin.error) return { status: 400, body: { error: pin.error } };
        const { rows: [{ n }] } = await db.query(
            "SELECT COUNT(*)::int AS n FROM analytics_pinned_reports WHERE site_id = $1 AND organisation_id = $2",
            [siteId, member.organisationId],
        );
        if (n >= MAX_PINS) return { status: 409, body: { error: `Up to ${MAX_PINS} reports can be pinned. Unpin one first.` } };
        const { rows } = await db.query(
            `INSERT INTO analytics_pinned_reports (site_id, organisation_id, kind, title, config, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [siteId, member.organisationId, pin.kind, pin.title, JSON.stringify(pin.config), member.email || null],
        );
        return { status: 201, body: shape(rows[0]) };
    }
    if (method === "DELETE") {
        const id = parseInt(query.id, 10);
        if (!id) return { status: 400, body: { error: "id is required" } };
        const { rowCount } = await db.query(
            "DELETE FROM analytics_pinned_reports WHERE id = $1 AND site_id = $2 AND organisation_id = $3",
            [id, siteId, member.organisationId],
        );
        return rowCount ? { status: 204, body: null } : { status: 404, body: { error: "Not found" } };
    }
    return { status: 405, body: { error: "Method not allowed" } };
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, X-User-Email, Content-Type");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    try {
        const out = await handlePins(getPool(), member, req.method, req.query || {}, req.body);
        if (out.status === 204) return res.status(204).end();
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-pins]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
