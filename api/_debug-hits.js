import crypto from "node:crypto";
import { getPool } from "./_db.js";

/**
 * Event debugger storage — backs the Analytics → Event Debugger page.
 *
 * A debug session is a random token created server-side for a signed-in
 * organisation (createDebugSession). The user opens their own site with
 * ?ia_debug=<token>; the embed script keeps that token in sessionStorage and
 * adds it as `dbg` to every payload it sends. /api/a then records what it
 * received plus its verdict (stored / dropped and why) here — but only for a
 * token that belongs to a live session, so arbitrary `dbg` values posted to
 * the public ingest endpoint never write anything. Reading hits back
 * requires being signed in to the organisation that owns the session (see
 * api/analytics-debug.js). Sessions and hits expire after DEBUG_TTL_HOURS.
 */
export const DEBUG_TOKEN_RE = /^[a-z0-9]{16,40}$/i;
export const DEBUG_TTL_HOURS = 24;

const MAX_PAYLOAD_CHARS = 8000;

let tableReady = null;

export function ensureDebugTable(db = getPool()) {
    if (!tableReady) {
        tableReady = db.query(`
            CREATE TABLE IF NOT EXISTS analytics_debug_sessions (
                token           VARCHAR(40)  PRIMARY KEY,
                organisation_id INTEGER      NOT NULL,
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS analytics_debug_hits (
                id          BIGSERIAL    PRIMARY KEY,
                token       VARCHAR(40)  NOT NULL,
                received_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                site_id     VARCHAR(64),
                hit_type    VARCHAR(16)  NOT NULL,
                event_name  VARCHAR(64),
                status      SMALLINT     NOT NULL,
                verdict     VARCHAR(32)  NOT NULL,
                reason      TEXT,
                payload     JSONB
            );
            CREATE INDEX IF NOT EXISTS analytics_debug_hits_token_idx ON analytics_debug_hits (token, id);
            CREATE INDEX IF NOT EXISTS analytics_debug_hits_received_idx ON analytics_debug_hits (received_at);
        `).catch((err) => { tableReady = null; throw err; });
    }
    return tableReady;
}

export async function createDebugSession(orgId, db = getPool()) {
    await ensureDebugTable(db);
    const token = crypto.randomBytes(15).toString("hex");
    await db.query(
        `INSERT INTO analytics_debug_sessions (token, organisation_id) VALUES ($1, $2)`,
        [token, orgId]
    );
    return token;
}

// Organisation that owns a live (unexpired) session, or null.
export async function debugSessionOrg(token, db = getPool()) {
    if (!DEBUG_TOKEN_RE.test(token || "")) return null;
    await ensureDebugTable(db);
    const { rows } = await db.query(
        `SELECT organisation_id FROM analytics_debug_sessions
         WHERE token = $1 AND created_at > NOW() - make_interval(hours => $2)`,
        [token, DEBUG_TTL_HOURS]
    );
    return rows[0]?.organisation_id ?? null;
}

// Retention: drop expired sessions and their hits.
export async function purgeExpiredDebugData(db = getPool()) {
    await db.query(
        `DELETE FROM analytics_debug_hits WHERE received_at < NOW() - make_interval(hours => $1)`,
        [DEBUG_TTL_HOURS]
    );
    await db.query(
        `DELETE FROM analytics_debug_sessions WHERE created_at < NOW() - make_interval(hours => $1)`,
        [DEBUG_TTL_HOURS]
    );
}

// Maps the wire-format `t` field (plus `cl` for pageviews) to a readable hit type.
export function hitTypeOf(body) {
    switch (body?.t) {
        case "ev":     return "event";
        case "ck":     return "clicks";
        case "ab":     return "experiment";
        case "dbgerr": return "client_error";
        default:       return "pageview";
    }
}

/**
 * Never throws — a debug write failing must not affect ingestion.
 * Awaited by the caller (rather than fired after the response) because a
 * serverless function can be frozen as soon as the response is sent.
 */
export async function recordDebugHit(token, body, status, verdict, reason) {
    if (!token || !DEBUG_TOKEN_RE.test(token)) return;
    try {
        const db = getPool();
        await ensureDebugTable(db);
        const { dbg, ...rest } = body || {};
        let payload = JSON.stringify(rest);
        if (payload.length > MAX_PAYLOAD_CHARS) {
            payload = JSON.stringify({ _truncated: true, preview: payload.slice(0, MAX_PAYLOAD_CHARS) });
        }
        // INSERT ... SELECT so the session check and the write are one round
        // trip. The casts are required: in a SELECT list Postgres can't infer
        // parameter types from the target columns, and without them this
        // fails with "inconsistent types deduced for parameter $1".
        await db.query(
            `INSERT INTO analytics_debug_hits (token, site_id, hit_type, event_name, status, verdict, reason, payload)
             SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::smallint, $6::varchar, $7::text, $8::jsonb
             WHERE EXISTS (
                 SELECT 1 FROM analytics_debug_sessions
                 WHERE token = $1::varchar AND created_at > NOW() - make_interval(hours => $9::int)
             )`,
            [
                token,
                typeof rest.s === "string" ? rest.s.slice(0, 64) : null,
                hitTypeOf(rest),
                typeof rest.n === "string" ? rest.n.slice(0, 64) : null,
                status,
                verdict,
                reason || null,
                payload,
                DEBUG_TTL_HOURS,
            ]
        );
    } catch (err) {
        // Best-effort — never affects ingestion — but logged, since a failure
        // here is otherwise invisible (the debugger just stays empty).
        console.error("[debug-hits] failed to record hit:", err?.message || err);
    }
}
