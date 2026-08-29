import { getPool } from "./_db.js";
/**
 * GET /api/cron-cleanup-scans  (invoked by Vercel Cron, daily at 03:30 UTC)
 *
 * Keeps the pre_consent_scans table from growing unbounded.
 * Retains the 3 most recent completed scans per domain and deletes the rest.
 * Also purges stuck pending/in_progress rows older than 2 hours.
 */
export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();

    try {
        // Delete completed/failed rows beyond the 3 most recent per domain
        const { rowCount: oldScans } = await db.query(`
            DELETE FROM pre_consent_scans
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY domain ORDER BY scanned_at DESC) AS rn
                    FROM   pre_consent_scans
                    WHERE  status IN ('completed', 'failed')
                ) ranked
                WHERE rn > 3
            )
        `);

        // Delete stuck pending/in_progress rows older than 2 hours
        const { rowCount: stuckScans } = await db.query(`
            DELETE FROM pre_consent_scans
            WHERE status IN ('pending', 'in_progress')
              AND scanned_at < NOW() - INTERVAL '2 hours'
        `);

        return res.json({
            deleted_old_scans:   oldScans,
            deleted_stuck_scans: stuckScans,
        });
    } catch (err) {
        console.error("[cron-cleanup-scans] error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
