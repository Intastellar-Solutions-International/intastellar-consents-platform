/**
 * POST /api/analytics-recording-ingest
 *
 * Ingests one chunk of an rrweb session-recording event stream from the
 * lazily-loaded recorder bundle (src/recorder-entry.js, built to /r.js).
 * Kept separate from GET/POST /api/a — different payload shape, pulls in
 * Vercel Blob writes, and is only ever hit for consented, sampled-in,
 * recording-enabled visits (a small minority of traffic), so it's kept off
 * the hot pageview ingest path.
 *
 * Body: { s: siteId, sid, recId, seq, final, pathname, pathnames, events }
 * Blob objects are stored with access:'private' — reading them back requires
 * the BLOB_READ_WRITE_TOKEN (see api/analytics-recordings.js's proxy), not
 * just knowledge of the URL.
 */

import { put } from "@vercel/blob";
import { getPool } from "./_db.js";
async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_recordings (
            id              VARCHAR(40)  PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            session_id      VARCHAR(64)  NOT NULL,
            started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            ended_at        TIMESTAMPTZ,
            duration_sec    INTEGER,
            pathnames       TEXT[]       NOT NULL DEFAULT '{}',
            entry_pathname  TEXT,
            chunk_count     SMALLINT     NOT NULL DEFAULT 0,
            chunk_urls      TEXT[]       NOT NULL DEFAULT '{}',
            byte_size       INTEGER      NOT NULL DEFAULT 0,
            device_type     VARCHAR(8),
            browser_family  VARCHAR(32),
            os_family       VARCHAR(32),
            country_code    CHAR(2),
            status          VARCHAR(12)  NOT NULL DEFAULT 'active'
        );
        CREATE INDEX IF NOT EXISTS idx_ar_site     ON analytics_recordings (site_id);
        CREATE INDEX IF NOT EXISTS idx_ar_session  ON analytics_recordings (session_id);
        CREATE INDEX IF NOT EXISTS idx_ar_started  ON analytics_recordings (started_at);
        CREATE INDEX IF NOT EXISTS idx_ar_status   ON analytics_recordings (status);
    `);
}

// Same GDPR-safe UA categorisation used in api/a.js — never store the raw UA.
function parseUA(ua = "") {
    let browser = "other";
    if (/Edg\//.test(ua))                              browser = "Edge";
    else if (/OPR\/|Opera/.test(ua))                   browser = "Opera";
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua))                     browser = "Firefox";
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";

    let os = "other";
    if (/Windows/.test(ua))                            os = "Windows";
    else if (/iPhone/.test(ua))                        os = "iOS";
    else if (/iPad/.test(ua))                          os = "iPadOS";
    else if (/Android/.test(ua))                       os = "Android";
    else if (/Mac OS X/.test(ua))                      os = "macOS";
    else if (/Linux/.test(ua))                         os = "Linux";

    return { browser, os };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).end();

    let body;
    try {
        body = typeof req.body === "object" && req.body !== null
            ? req.body
            : JSON.parse(req.body || "{}");
    } catch {
        return res.status(400).end();
    }

    const { s: siteId, sid, recId, seq, final, pathname, pathnames, events } = body;

    if (!siteId || typeof siteId !== "string" || !sid || !recId || !Array.isArray(events)) {
        return res.status(400).end();
    }
    if (!events.length && !final) return res.status(202).end();

    const db = getPool();
    await ensureTable(db).catch(() => {});

    const { rows: sites } = await db.query(
        `SELECT organisation_id FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
        [siteId]
    ).catch(() => ({ rows: [] }));
    if (!sites.length) return res.status(403).end();
    const orgId = sites[0].organisation_id;

    const recordingId = String(recId).slice(0, 40);
    const sessionId   = String(sid).slice(0, 64);
    const seqNum      = Number.isInteger(seq) ? seq : 0;

    const eventsJson = JSON.stringify(events);
    const blobPath = `recordings/${siteId}/${recordingId}/${seqNum}.json`;

    let blobUrl = null;
    try {
        const blob = await put(blobPath, eventsJson, {
            access: "private",
            contentType: "application/json",
            addRandomSuffix: false,
        });
        blobUrl = blob.url;
    } catch {
        // Storage failure shouldn't 500 the visitor's page — drop this chunk.
        return res.status(202).end();
    }

    const country = (req.headers["x-vercel-ip-country"] || "").slice(0, 2) || null;
    const { browser, os } = parseUA(req.headers["user-agent"]);
    const pathList = Array.isArray(pathnames) && pathnames.length
        ? pathnames.slice(0, 50).map(p => String(p).slice(0, 500))
        : [String(pathname || "/").slice(0, 500)];

    await db.query(
        `INSERT INTO analytics_recordings
           (id, site_id, organisation_id, session_id, started_at, pathnames, entry_pathname,
            chunk_count, chunk_urls, byte_size, device_type, browser_family, os_family, country_code,
            status, ended_at, duration_sec)
         VALUES
           ($1,$2,$3,$4,NOW(),$5,$6,1,ARRAY[$7]::text[],$8,$9,$10,$11,$12,
            CASE WHEN $13 THEN 'complete' ELSE 'active' END,
            CASE WHEN $13 THEN NOW() ELSE NULL END,
            CASE WHEN $13 THEN 0 ELSE NULL END)
         ON CONFLICT (id) DO UPDATE SET
           pathnames    = EXCLUDED.pathnames,
           chunk_count  = analytics_recordings.chunk_count + 1,
           chunk_urls   = array_append(analytics_recordings.chunk_urls, $7),
           byte_size    = analytics_recordings.byte_size + $8,
           status       = CASE WHEN $13 THEN 'complete' ELSE analytics_recordings.status END,
           ended_at     = CASE WHEN $13 THEN NOW() ELSE analytics_recordings.ended_at END,
           duration_sec = CASE WHEN $13 THEN EXTRACT(EPOCH FROM (NOW() - analytics_recordings.started_at))::int ELSE analytics_recordings.duration_sec END`,
        [
            recordingId, siteId, orgId, sessionId,
            pathList, pathList[0],
            blobUrl, Buffer.byteLength(eventsJson), null,
            browser, os, country,
            !!final,
        ]
    ).catch(() => {});

    return res.status(202).end();
}
