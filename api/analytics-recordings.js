/**
 * GET /api/analytics-recordings?domain=<domain>&from=&to=&pathname=&limit=&cursor=
 *   → paginated list of recordings (never includes chunk_urls).
 *
 * GET /api/analytics-recordings?domain=<domain>&id=<recordingId>
 *   → server-side proxy: fetches each Blob chunk (stored access:'private',
 *     never exposed to the browser directly) and returns the combined rrweb
 *     event stream for playback.
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import pkg from "pg";
const { Pool } = pkg;
import { get } from "@vercel/blob";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
            connectionTimeoutMillis: 5000,
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
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
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

function safeDate(str, fallback, endOfDay = false) {
    if (!str) return fallback;
    // A bare "YYYY-MM-DD" (as sent by the date-range picker) parses to
    // midnight UTC — fine as a lower bound, but as the upper bound it
    // silently excludes everything recorded later that same day. Push it to
    // the end of that day so "today" is actually included in "to".
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(str).trim())) {
        str = `${str}T23:59:59.999Z`;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString();
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id, recording_enabled, recording_sample_rate
         FROM analytics_sites WHERE organisation_id = $1 AND domain = $2 AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
    const siteId = siteRows[0].id;
    const recordingEnabled = siteRows[0].recording_enabled === true;
    const sampleRate = Number(siteRows[0].recording_sample_rate ?? 20);

    const recordingId = (req.query.id || "").trim() || null;

    // ── Detail mode: server-side Blob proxy, never exposes raw URLs ───────────
    if (recordingId) {
        const { rows } = await db.query(
            `SELECT id, started_at, ended_at, duration_sec, pathnames, chunk_urls, status
             FROM analytics_recordings WHERE id = $1 AND site_id = $2 LIMIT 1`,
            [recordingId, siteId]
        ).catch(() => ({ rows: [] }));

        if (!rows.length) return res.status(404).json({ error: "Recording not found" });
        const rec = rows[0];

        const chunkUrls = Array.isArray(rec.chunk_urls) ? rec.chunk_urls : [];
        const events = [];
        for (const url of chunkUrls) {
            try {
                const { stream } = await get(url, { access: "private" });
                const text = await new Response(stream).text();
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) events.push(...parsed);
            } catch {
                // Skip an unreadable chunk rather than failing the whole playback.
            }
        }

        return res.status(200).json({
            id: rec.id,
            startedAt: rec.started_at,
            endedAt: rec.ended_at,
            durationSec: rec.duration_sec,
            pathnames: rec.pathnames,
            status: rec.status,
            events,
        });
    }

    // ── List mode ───────────────────────────────────────────────────────────
    const today     = new Date().toISOString();
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const fromDate  = safeDate(req.query.from, thirtyAgo);
    const toDate    = safeDate(req.query.to,   today, true);
    const pathname  = (req.query.pathname || "").trim() || null;
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const cursor    = req.query.cursor ? safeDate(req.query.cursor, null) : null;

    const params = [siteId, fromDate, toDate];
    let where = `site_id = $1 AND started_at >= $2 AND started_at <= $3`;
    if (pathname) { params.push(pathname); where += ` AND $${params.length} = ANY(pathnames)`; }
    if (cursor)   { params.push(cursor);   where += ` AND started_at < $${params.length}`; }
    params.push(limit);

    const { rows } = await db.query(
        `SELECT id, started_at, ended_at, duration_sec, pathnames, entry_pathname,
                device_type, browser_family, os_family, country_code, byte_size, status
         FROM analytics_recordings
         WHERE ${where}
         ORDER BY started_at DESC
         LIMIT $${params.length}`,
        params
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
        siteId,
        domain,
        recordingEnabled,
        sampleRate,
        recordings: rows.map(r => ({
            id:            r.id,
            startedAt:     r.started_at,
            endedAt:       r.ended_at,
            durationSec:   r.duration_sec,
            pathnames:     r.pathnames,
            entryPathname: r.entry_pathname,
            deviceType:    r.device_type,
            browserFamily: r.browser_family,
            osFamily:      r.os_family,
            countryCode:   r.country_code,
            byteSize:      r.byte_size,
            status:        r.status,
        })),
        nextCursor: rows.length === limit ? rows[rows.length - 1].started_at : null,
    });
}
