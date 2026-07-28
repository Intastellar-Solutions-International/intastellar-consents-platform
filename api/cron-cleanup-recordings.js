/**
 * Cron: 05:00 daily (see vercel.json).
 *
 * 1. Flips stale `status='active'` recordings (no update in >2h — crashed tab
 *    or a final beacon that never landed) to 'abandoned'.
 * 2. Hard-deletes recordings past each site's `recording_retention_days`,
 *    including their Blob objects.
 * 3. Hard-deletes click rows past each site's `heatmap_retention_days`.
 */

import pkg from "pg";
const { Pool } = pkg;
import { del } from "@vercel/blob";

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

export default async function handler(req, res) {
    const db = getPool();

    // ── 1. Reap abandoned recordings ──────────────────────────────────────────
    await db.query(`
        UPDATE analytics_recordings SET status = 'abandoned'
        WHERE status = 'active' AND started_at < NOW() - INTERVAL '2 hours'
    `).catch(() => {});

    // ── 2. Delete recordings past their site's retention window ───────────────
    const { rows: expiredRecordings } = await db.query(`
        SELECT r.id, r.chunk_urls
        FROM analytics_recordings r
        JOIN analytics_sites s ON s.id = r.site_id
        WHERE r.started_at < NOW() - (COALESCE(s.recording_retention_days, 30) || ' days')::interval
        LIMIT 500
    `).catch(() => ({ rows: [] }));

    let deletedRecordings = 0;
    for (const rec of expiredRecordings) {
        if (Array.isArray(rec.chunk_urls) && rec.chunk_urls.length) {
            await del(rec.chunk_urls).catch(() => {});
        }
        await db.query(`DELETE FROM analytics_recordings WHERE id = $1`, [rec.id]).catch(() => {});
        deletedRecordings++;
    }

    // ── 3. Delete click rows past their site's heatmap retention window ───────
    const { rowCount: deletedClicks } = await db.query(`
        DELETE FROM analytics_clicks c
        USING analytics_sites s
        WHERE s.id = c.site_id
          AND c.received_at < NOW() - (COALESCE(s.heatmap_retention_days, 90) || ' days')::interval
    `).catch(() => ({ rowCount: 0 }));

    return res.status(200).json({ ok: true, deletedRecordings, deletedClicks: deletedClicks || 0 });
}
