import { getPool } from "./_db.js";

/**
 * Event debugger storage — backs the public /analytics/debug page.
 *
 * A debug session is a random token the debugger page generates. The visitor
 * opens their own site with ?ia_debug=<token>; the embed script keeps that
 * token in sessionStorage and adds it as `dbg` to every payload it sends.
 * /api/a then records what it received plus its verdict (stored / dropped and
 * why) here, keyed by the token — so the only way to read a hit back is to
 * hold the token of the browser that sent it. Nothing is written for normal
 * traffic (no `dbg` field), and rows are purged after DEBUG_TTL_HOURS.
 */
export const DEBUG_TOKEN_RE = /^[a-z0-9]{16,40}$/i;
export const DEBUG_TTL_HOURS = 24;

const MAX_PAYLOAD_CHARS = 8000;

let tableReady = null;

export function ensureDebugTable(db = getPool()) {
    if (!tableReady) {
        tableReady = db.query(`
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
        await db.query(
            `INSERT INTO analytics_debug_hits (token, site_id, hit_type, event_name, status, verdict, reason, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                token,
                typeof rest.s === "string" ? rest.s.slice(0, 64) : null,
                hitTypeOf(rest),
                typeof rest.n === "string" ? rest.n.slice(0, 64) : null,
                status,
                verdict,
                reason || null,
                payload,
            ]
        );
    } catch { /* debug logging is best-effort */ }
}
