/**
 * GET /api/analytics-site-config?site=<siteKey>
 *
 * Public, unauthenticated — the site key is already embeddable/public (same
 * trust model as GET /api/a). Read by the embed script at runtime to decide
 * whether to bootstrap session recording for this visit. Kept separate from
 * the cached, byte-identical GET /api/a response so per-site config can change
 * without needing to bust that response's CDN cache.
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
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const siteId = String(req.query.site || "").slice(0, 32);
    if (!siteId) return res.status(400).end();

    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");

    const db = getPool();

    const { rows } = await db.query(
        `SELECT heatmaps_enabled, recording_enabled, recording_sample_rate,
                recording_block_selectors, recording_mask_selectors
         FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
        [siteId]
    ).catch(() => ({ rows: [] }));

    if (!rows.length) {
        return res.status(200).json({
            heatmapsEnabled: false, recordingEnabled: false,
            sampleRate: 0, blockSelectors: [], maskSelectors: [],
        });
    }

    const site = rows[0];
    return res.status(200).json({
        heatmapsEnabled:  site.heatmaps_enabled !== false,
        recordingEnabled: site.recording_enabled === true,
        sampleRate:       Number(site.recording_sample_rate ?? 20),
        blockSelectors:   Array.isArray(site.recording_block_selectors) ? site.recording_block_selectors : [],
        maskSelectors:    Array.isArray(site.recording_mask_selectors)  ? site.recording_mask_selectors  : [],
    });
}
