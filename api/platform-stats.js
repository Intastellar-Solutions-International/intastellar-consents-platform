import { getPool } from "./_db.js";
import { requirePlatformAdmin } from "./_member-auth.js";
import { adminView, calculateFigures, ensureStatsTables, publishLatest, saveSnapshot, unpublish } from "./_platform-stats.js";

/**
 * /api/platform-stats — sales figures for the admin Platform page, organisation 1 only.
 *
 * GET  → the newest snapshot, what could be published and what is live
 * POST { action: "refresh" | "publish" | "unpublish" } → the same, after acting
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "https://platform.intastellarconsents.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, X-User-Email");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const admin = await requirePlatformAdmin(req);
    if (admin.error) return res.status(admin.status).json({ error: admin.error });
    res.setHeader("Cache-Control", "private, no-store");

    const db = getPool();
    try {
        await ensureStatsTables(db);
        if (req.method === "POST") {
            const action = req.body?.action;
            if (action === "refresh") {
                await saveSnapshot(db, await calculateFigures(db, { authorization: req.headers.authorization }));
            } else if (action === "publish") {
                if (!await publishLatest(db, admin.email)) return res.status(409).json({ error: "There are no figures to publish yet" });
            } else if (action === "unpublish") {
                await unpublish(db);
            } else {
                return res.status(400).json({ error: "Unknown action" });
            }
        }
        return res.json(await adminView(db));
    } catch (err) {
        console.error("[platform-stats]", err.message);
        return res.status(500).json({ error: "Could not load the figures" });
    }
}
