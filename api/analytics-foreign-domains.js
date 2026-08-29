import { getPool } from "./_db.js";
/**
 * GET    /api/analytics-foreign-domains?domain=   → list foreign domains for a site
 * PATCH  /api/analytics-foreign-domains?domain=   body: { foreignDomain, approved } → approve/revoke
 * DELETE /api/analytics-foreign-domains?domain=&foreignDomain=  → remove record entirely
 *
 * "Foreign domain" = a host from which the analytics script fired events but
 * whose hostname doesn't match the domain the site key was registered under.
 * Unapproved foreign domains are logged but not tracked. Approved ones are
 * treated identically to the primary domain.
 */
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
    res.setHeader("Access-Control-Allow-Methods", "GET,PATCH,DELETE,OPTIONS");
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

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const db = getPool();

    // Resolve site_id for this org + domain — ownership check
    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(404).json({ error: "No site key found for this domain." });
    const siteId = siteRows[0].id;

    // ── GET: list all foreign domains ────────────────────────────────────────
    if (req.method === "GET") {
        const { rows } = await db.query(
            `SELECT domain, first_seen, last_seen, hit_count, approved
             FROM analytics_foreign_domains
             WHERE site_id = $1
             ORDER BY approved ASC, last_seen DESC`,
            [siteId]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({ domains: rows });
    }

    // ── PATCH: approve or revoke a foreign domain ─────────────────────────────
    if (req.method === "PATCH") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const foreignDomain = (body.foreignDomain || "").trim().toLowerCase();
        if (!foreignDomain) return res.status(400).json({ error: "foreignDomain is required" });
        if (typeof body.approved !== "boolean") return res.status(400).json({ error: "approved (boolean) is required" });

        const { rows } = await db.query(
            `UPDATE analytics_foreign_domains
             SET approved = $3
             WHERE site_id = $1 AND domain = $2
             RETURNING domain, first_seen, last_seen, hit_count, approved`,
            [siteId, foreignDomain, body.approved]
        ).catch(() => ({ rows: [] }));

        if (!rows.length) return res.status(404).json({ error: "Foreign domain not found." });
        return res.status(200).json(rows[0]);
    }

    // ── DELETE: remove a foreign domain record ────────────────────────────────
    if (req.method === "DELETE") {
        const foreignDomain = (req.query.foreignDomain || "").trim().toLowerCase();
        if (!foreignDomain) return res.status(400).json({ error: "foreignDomain is required" });

        await db.query(
            `DELETE FROM analytics_foreign_domains WHERE site_id = $1 AND domain = $2`,
            [siteId, foreignDomain]
        ).catch(() => {});

        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
