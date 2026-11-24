import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { tryRefreshToken } from "./_ad-platform-fetch.js";
import { SOURCE, ensureImportTables, importStep, importView } from "./_ga4-import.js";

/**
 * /api/ga4-import — import a site's Google Analytics 4 history (aggregated
 * numbers only; see _ga4-import.js).
 *
 *   GET    ?domain=                          → { connected, property, import }
 *   POST   { domain, action: "start" }      → import state after the first chunk
 *   POST   { domain, action: "continue" }   → state after the next chunk (call until status isn't "running")
 *   DELETE ?domain=                          → { ok } removes the imported numbers
 *
 * Signed in: Authorization + Organisation (requireMember). Uses the site's
 * existing GA4 connection (Marketing → connections).
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

async function siteAndConnection(db, organisationId, domain) {
    const [{ rows: sites }, { rows: conns }] = await Promise.all([
        db.query("SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1", [organisationId, domain]),
        db.query(
            `SELECT * FROM ad_platform_connections
              WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND platform = 'google_analytics'
                AND account_id IS NOT NULL AND access_token IS NOT NULL LIMIT 1`,
            [organisationId, domain],
        ).catch(() => ({ rows: [] })),
    ]);
    return { site: sites[0] ? { id: sites[0].id, organisationId, domain } : null, conn: conns[0] || null };
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, X-User-Email, Content-Type");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (!["GET", "POST", "DELETE"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, DELETE");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });

    const domain = String((req.method === "POST" ? req.body?.domain : req.query.domain) || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const db = getPool();
    try {
        await ensureImportTables(db);
        const { site, conn } = await siteAndConnection(db, member.organisationId, domain);
        if (!site) return res.status(404).json({ error: "No analytics site for this domain" });

        if (req.method === "GET") {
            const { rows } = await db.query("SELECT * FROM analytics_imports WHERE site_id = $1 AND source = $2", [site.id, SOURCE]);
            return res.status(200).json({ connected: !!conn, property: conn ? (conn.account_label || conn.account_id) : null, import: importView(rows[0]) });
        }
        if (req.method === "DELETE") {
            await db.query("DELETE FROM analytics_imported WHERE site_id = $1 AND source = $2", [site.id, SOURCE]);
            await db.query("DELETE FROM analytics_imports WHERE site_id = $1 AND source = $2", [site.id, SOURCE]);
            return res.status(200).json({ ok: true });
        }

        const action = req.body?.action;
        if (action !== "start" && action !== "continue") return res.status(400).json({ error: "action must be start or continue" });
        if (!conn) return res.status(409).json({ error: "Connect Google Analytics 4 for this domain first" });
        const fresh = await tryRefreshToken(db, conn).catch(() => conn);
        return res.status(200).json({ import: await importStep(db, site, fresh, { restart: action === "start" }) });
    } catch (err) {
        console.error("[ga4-import]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
