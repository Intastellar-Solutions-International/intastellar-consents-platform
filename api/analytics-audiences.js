/**
 * GET    /api/analytics-audiences?domain=<domain>
 * POST   /api/analytics-audiences?domain=<domain>   { name, lookbackDays, conditions }
 * DELETE /api/analytics-audiences?domain=<domain>&id=<id>
 *
 * Rule-based saved segments ("Audiences") — v1. IMPORTANT: this system has
 * no persistent cross-session visitor ID (confirmed — "users" everywhere
 * else in this codebase already means COUNT(DISTINCT session_id)), so an
 * Audience's membership is NOT a durable, GA4-style "has been a member for
 * 30 days" list. It's a rolling-window reconstruction: which session_ids
 * matched every condition within the last `lookbackDays` days, recomputed
 * fresh on every GET — never cached/precomputed, so there's no staleness
 * state to reason about (see conditionsToQuery() below). Keep every bit of
 * UI copy consuming this endpoint's `matchedSessions` honest about that
 * ("N sessions matched in the last N days", never "N members"/"N users").
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import { getPool } from "./_db.js";
import { selfReferralClause, noiseReferralClause, getApprovedDomains } from "./_self-referral.js";

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

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_audiences (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            name            VARCHAR(120) NOT NULL,
            lookback_days   SMALLINT     NOT NULL DEFAULT 30,
            conditions      JSONB        NOT NULL DEFAULT '[]',
            enabled         BOOLEAN      NOT NULL DEFAULT true,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_aa_site ON analytics_audiences (site_id)`);
}

// ── Condition-type registry — the one place v1's supported condition types,
// their validation rules, and their SQL fragment are defined. Mirrored (as
// a plain, SQL-free constant) in the frontend for the builder's dropdown. ──
const VALID_DEVICES  = new Set(["desktop", "tablet", "mobile", "other"]);
const VALID_CHANNELS = new Set(["organic", "paid", "paid_social", "direct", "referral"]);
const VALID_CONSENTS = new Set(["full", "minimal"]);
const VALID_TYPES    = new Set(["event_fired", "path_visited", "device", "country", "channel", "consent"]);
const MAX_CONDITIONS = 10;
const MAX_AUDIENCES_PER_SITE = 30;

function validateCondition(c, audienceLookbackDays) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return "Each condition must be an object";
    if (!VALID_TYPES.has(c.type)) return `Unknown condition type: ${c.type}`;
    const value = typeof c.value === "string" ? c.value.trim() : "";

    if (c.type === "event_fired" || c.type === "path_visited") {
        if (!value) return `${c.type} requires a non-empty value`;
        if (value.length > 255) return `${c.type} value must be 255 characters or fewer`;
    } else if (c.type === "device") {
        if (!VALID_DEVICES.has(value)) return `device must be one of: ${[...VALID_DEVICES].join(", ")}`;
    } else if (c.type === "channel") {
        if (!VALID_CHANNELS.has(value)) return `channel must be one of: ${[...VALID_CHANNELS].join(", ")}`;
    } else if (c.type === "consent") {
        if (!VALID_CONSENTS.has(value)) return `consent must be one of: ${[...VALID_CONSENTS].join(", ")}`;
    } else if (c.type === "country") {
        if (!/^[A-Za-z]{2}$/.test(value)) return "country must be a 2-letter code";
    }

    if (c.lookbackDays != null) {
        const n = Number(c.lookbackDays);
        if (!Number.isInteger(n) || n < 1 || n > audienceLookbackDays) {
            return `a condition's lookbackDays must be an integer between 1 and the audience's own lookbackDays (${audienceLookbackDays})`;
        }
    }
    return null;
}

// Builds a parameterized CTE-intersection query computing how many distinct
// session_ids matched EVERY condition (AND-only, v1) within each
// condition's own rolling window. Every condition value — including the
// enum-like ones (device/channel/consent/country) where string
// interpolation would also be "safe" today, same as the existing
// api/analytics-report.js segment filter — binds via $n placeholders here,
// never interpolated. That existing filter is only safe because its values
// are first checked against a fixed Set/regex with no free-text path;
// Audience conditions include free text (event names, path substrings), so
// this file applies one consistent rule instead of mixing the two.
// `channel` is the one exception: its SQL comes from a fixed template
// keyed by a Set-validated enum (same CHANNEL_SQL approach
// api/analytics-report.js already uses) — never from user-supplied text.
function buildMembershipQuery(siteId, domain, approvedDomains, audienceLookbackDays, conditions) {
    if (!conditions.length) return null;

    const SELF_REFERRAL  = selfReferralClause(domain, approvedDomains);
    const NOISE_REFERRAL = noiseReferralClause();
    const CHANNEL_SQL = {
        organic:     `(utm_medium = 'organic' OR (COALESCE(utm_medium,'')='' AND COALESCE(utm_source,'')='' AND referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\\.'))`,
        paid:        `(utm_medium ~* '^(cpc|ppc|paid|cpm|display)' OR (COALESCE(utm_source,'')!='' AND COALESCE(utm_medium,'') NOT IN ('organic','') AND utm_source !~* '^(fb|facebook|ig|instagram|msg|messenger|an)$'))`,
        paid_social: `(utm_source ~* '^(fb|facebook|ig|instagram|msg|messenger|an)$')`,
        referral:    `(COALESCE(referrer_host,'')!='' AND COALESCE(utm_source,'')='' AND COALESCE(utm_medium,'')='' AND NOT ${SELF_REFERRAL} AND NOT ${NOISE_REFERRAL})`,
        direct:      `((COALESCE(referrer_host,'')='' OR ${SELF_REFERRAL} OR ${NOISE_REFERRAL}) AND COALESCE(utm_source,'')='' AND COALESCE(utm_medium,'')='')`,
    };

    const values = [];
    const cteParts = [];
    const names = [];

    conditions.forEach((c, i) => {
        const condDays = c.lookbackDays ? Math.min(Number(c.lookbackDays), audienceLookbackDays) : audienceLookbackDays;
        const name = `cond${i}`;
        names.push(name);

        values.push(siteId);
        const siteParam = `$${values.length}`;
        values.push(condDays);
        const daysParam = `$${values.length}`;

        let table, extraWhere;
        if (c.type === "event_fired") {
            table = "analytics_custom_events";
            values.push(c.value.trim());
            extraWhere = `AND name = $${values.length}`;
        } else if (c.type === "path_visited") {
            table = "analytics_events";
            values.push(`%${c.value.trim()}%`);
            extraWhere = `AND pathname ILIKE $${values.length}`;
        } else if (c.type === "device") {
            table = "analytics_events";
            values.push(c.value.trim());
            extraWhere = `AND device_type = $${values.length}`;
        } else if (c.type === "country") {
            table = "analytics_events";
            values.push(c.value.trim().toUpperCase());
            extraWhere = `AND country_code = $${values.length}`;
        } else if (c.type === "consent") {
            table = "analytics_events";
            values.push(c.value.trim());
            extraWhere = `AND consent_level = $${values.length}`;
        } else { // channel — fixed template, no bound value
            table = "analytics_events";
            extraWhere = `AND ${CHANNEL_SQL[c.value.trim()]}`;
        }

        cteParts.push(`${name} AS (
            SELECT DISTINCT session_id FROM ${table}
            WHERE site_id = ${siteParam}
              AND received_at >= NOW() - (${daysParam}::int * INTERVAL '1 day')
              AND received_at < NOW()
              AND session_id IS NOT NULL
              ${extraWhere}
        )`);
    });

    const intersect = names.map(n => `SELECT session_id FROM ${n}`).join("\n            INTERSECT\n            ");
    const text = `WITH ${cteParts.join(",\n        ")}
        SELECT COUNT(*) AS matched FROM (
            ${intersect}
        ) m`;

    return { text, values };
}

export default async function handler(req, res) {
    try {
        return await _handler(req, res);
    } catch (err) {
        console.error("[analytics-audiences] unhandled error:", err?.message, err?.stack);
        return res.status(500).json({ error: "Internal server error", message: err?.message });
    }
}

async function _handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers["organisation"] || req.headers["organization"] || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Missing Organisation header" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "Missing domain parameter" });

    const db = getPool();
    await ensureTable(db);

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    );
    if (!siteRows.length) return res.status(404).json({ error: "Site not found" });
    const siteId = siteRows[0].id;

    if (req.method === "GET") {
        const { rows } = await db.query(
            `SELECT id, name, lookback_days AS "lookbackDays", conditions, enabled
             FROM analytics_audiences WHERE site_id = $1 ORDER BY created_at DESC`,
            [siteId]
        );

        const approvedDomains = await getApprovedDomains(db, siteId).catch(() => []);

        const audiences = await Promise.all(rows.map(async (a) => {
            const conditions = Array.isArray(a.conditions) ? a.conditions : [];
            const query = buildMembershipQuery(siteId, domain, approvedDomains, a.lookbackDays, conditions);
            let matchedSessions = 0;
            if (query) {
                const { rows: matchRows } = await db.query(query.text, query.values).catch(() => ({ rows: [{ matched: 0 }] }));
                matchedSessions = Number(matchRows[0]?.matched || 0);
            }
            return { ...a, matchedSessions };
        }));

        return res.status(200).json({ audiences });
    }

    if (req.method === "POST") {
        const { name, lookbackDays, conditions } = req.body || {};

        if (!name?.trim()) return res.status(400).json({ error: "name is required" });
        if (name.trim().length > 120) return res.status(400).json({ error: "name must be 120 characters or fewer" });

        const days = Number(lookbackDays);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            return res.status(400).json({ error: "lookbackDays must be an integer between 1 and 365" });
        }

        if (!Array.isArray(conditions) || conditions.length === 0) {
            return res.status(400).json({ error: "At least one condition is required" });
        }
        if (conditions.length > MAX_CONDITIONS) {
            return res.status(400).json({ error: `Maximum of ${MAX_CONDITIONS} conditions per audience` });
        }
        for (const c of conditions) {
            const err = validateCondition(c, days);
            if (err) return res.status(400).json({ error: err });
        }

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*) AS c FROM analytics_audiences WHERE site_id = $1`, [siteId]
        );
        if (Number(countRows[0]?.c) >= MAX_AUDIENCES_PER_SITE) {
            return res.status(400).json({ error: `Maximum of ${MAX_AUDIENCES_PER_SITE} audiences per site` });
        }

        // Normalize each condition to only the fields the registry recognizes,
        // trimmed — never store whatever extra keys a client happened to send.
        const cleanConditions = conditions.map(c => {
            const out = { type: c.type, value: typeof c.value === "string" ? c.value.trim() : "" };
            if (c.lookbackDays != null) out.lookbackDays = Number(c.lookbackDays);
            return out;
        });

        const { rows } = await db.query(
            `INSERT INTO analytics_audiences (site_id, organisation_id, name, lookback_days, conditions)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, lookback_days AS "lookbackDays", conditions, enabled`,
            [siteId, orgId, name.trim(), days, JSON.stringify(cleanConditions)]
        );
        return res.status(201).json({ audience: { ...rows[0], matchedSessions: 0 } });
    }

    if (req.method === "DELETE") {
        const id = parseInt(req.query.id || "0", 10);
        if (!id) return res.status(400).json({ error: "Missing id parameter" });
        await db.query(
            `DELETE FROM analytics_audiences WHERE id = $1 AND site_id = $2 AND organisation_id = $3`,
            [id, siteId, orgId]
        );
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
