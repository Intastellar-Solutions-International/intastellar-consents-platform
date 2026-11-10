import { SCAN_TYPE, ensureScanColumns } from "./_scan-schema.js";
import { getPool } from "./_db.js";
import { anonymizeExpiredRequests } from "./_dsr.js";
import { checkCustomDomains } from "./_dsr-domains.js";
/**
 * GET /api/cron-cleanup-scans  (invoked by Vercel Cron, daily at 03:30 UTC)
 *
 * Keeps the pre_consent_scans table from growing unbounded.
 * Retains the 3 most recent completed and 3 most recent failed scans per
 * domain and deletes the rest.
 * Also purges stuck pending/in_progress rows older than 2 hours, and removes
 * personal details from data subject requests closed over 3 years ago.
 */
export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();

    try {
        await ensureScanColumns(db);
        // Keep the 3 most recent completed and the 3 most recent failed rows per
        // domain and scan type. Ranked separately so a run of failed scans can't push out the
        // last completed scan, which Compliance and the banner still serve.
        const { rowCount: oldScans } = await db.query(`
            DELETE FROM pre_consent_scans
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY domain, status, ${SCAN_TYPE} ORDER BY scanned_at DESC) AS rn
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

        // Separate so a problem here can't stop the scan cleanup being reported.
        const anonymizedRequests = await anonymizeExpiredRequests(db).catch((err) => {
            console.error("[cron-cleanup-scans] DSR retention failed:", err.message);
            return null;
        });

        const customDomains = await checkCustomDomains(db).catch((err) => {
            console.error("[cron-cleanup-scans] custom domain check failed:", err.message);
            return null;
        });

        return res.json({
            custom_domains:      customDomains,
            deleted_old_scans:   oldScans,
            deleted_stuck_scans: stuckScans,
            anonymized_dsr_requests: anonymizedRequests,
        });
    } catch (err) {
        console.error("[cron-cleanup-scans] error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
