import { getPool } from "./_db.js";
import { ensureStatsTables, readPublished } from "./_platform-stats.js";

/**
 * GET /api/platform-stats-public — the figures an admin published, for the marketing website.
 * No authentication. Returns { published: false } until something has been published.
 */
export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    try {
        const db = getPool();
        await ensureStatsTables(db);
        const live = await readPublished(db);
        res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
        return res.json(live ? { published: true, as_of: live.as_of, figures: live.figures } : { published: false });
    } catch (err) {
        console.error("[platform-stats-public]", err.message);
        return res.status(500).json({ error: "Could not load the figures" });
    }
}
