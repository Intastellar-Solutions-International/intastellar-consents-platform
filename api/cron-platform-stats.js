import { getPool } from "./_db.js";
import { calculateFigures, ensureStatsTables, saveSnapshot } from "./_platform-stats.js";

/**
 * GET /api/cron-platform-stats  (invoked by Vercel Cron, daily at 04:30 UTC)
 *
 * Saves the day's sales figures. Never changes what the website shows;
 * that only happens when an admin publishes from the Platform page.
 */
export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const db = getPool();
        await ensureStatsTables(db);
        const figures = await calculateFigures(db);
        await saveSnapshot(db, figures);
        return res.json({ ok: true, figures });
    } catch (err) {
        console.error("[cron-platform-stats]", err.message);
        return res.status(500).json({ error: err.message });
    }
}
