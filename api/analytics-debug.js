import { getPool } from "./_db.js";
import { createDebugSession, debugSessionOrg, purgeExpiredDebugData, DEBUG_TTL_HOURS } from "./_debug-hits.js";
/**
 * POST /api/analytics-debug                          → { token } — starts a debug session
 * GET  /api/analytics-debug?token=<t>&after=<id>     → { hits } — hits newer than `after`
 *
 * Backs the Analytics → Event Debugger page (see api/_debug-hits.js for the
 * whole flow). A session belongs to the organisation that created it; GET
 * only returns hits for sessions owned by the caller's organisation.
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://analytics.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

const PAGE_SIZE = 200;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

export default async function handler(req, res) {
    setCors(req, res);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    try {
        if (req.method === "POST") {
            const token = await createDebugSession(orgId, db);
            return res.status(201).json({ token, ttlHours: DEBUG_TTL_HOURS });
        }

        const token = String(req.query.token || "");
        const ownerOrg = await debugSessionOrg(token, db);
        // Same response for "expired" and "someone else's session" — don't
        // confirm that another organisation's token exists.
        if (ownerOrg == null || Number(ownerOrg) !== orgId) {
            return res.status(404).json({ error: "Debug session not found or expired" });
        }

        // Opportunistic retention sweep — cheap thanks to the received_at index.
        if (Math.random() < 0.05) await purgeExpiredDebugData(db).catch(() => {});

        const after = Math.max(0, parseInt(req.query.after || "0", 10) || 0);
        const { rows } = await db.query(
            `SELECT id, received_at, site_id, hit_type, event_name, status, verdict, reason, payload
             FROM analytics_debug_hits
             WHERE token = $1 AND id > $2
             ORDER BY id ASC
             LIMIT $3`,
            [token, after, PAGE_SIZE]
        );
        return res.status(200).json({ hits: rows });
    } catch (err) {
        console.error("[analytics-debug]", err);
        return res.status(500).json({ error: "Event debugger request failed" });
    }
}
