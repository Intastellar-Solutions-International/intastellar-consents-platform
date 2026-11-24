import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";

/**
 * /api/analytics-annotations — notes on the analytics timeline ("Campaign
 * started", "Site relaunched"), shown as markers on the Overview chart.
 *
 *   GET    ?domain=&from=YYYY-MM-DD&to=YYYY-MM-DD → { annotations: [{ id, day, text, createdBy, createdAt }] }
 *   POST   { domain, day, text }                  → { annotation }
 *   DELETE ?id=                                   → { ok: true }
 *
 * Signed in: Authorization + Organisation (requireMember). Notes belong to
 * one site of the organisation; any member can add or remove them.
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
export const MAX_TEXT = 200;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function ensureAnnotationsTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_annotations (
            id              BIGSERIAL    PRIMARY KEY,
            organisation_id INTEGER      NOT NULL,
            site_id         VARCHAR(32)  NOT NULL,
            day             DATE         NOT NULL,
            text            VARCHAR(${MAX_TEXT}) NOT NULL,
            created_by      VARCHAR(255),
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS analytics_annotations_site_day ON analytics_annotations (site_id, day);
    `);
}

const validDay = (d) => DAY_RE.test(String(d || "")) && !Number.isNaN(Date.parse(d));

const view = (r) => ({ id: Number(r.id), day: r.day, text: r.text, createdBy: r.created_by, createdAt: r.created_at });

async function siteOf(db, organisationId, domain) {
    const { rows } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [organisationId, String(domain || "").trim()],
    );
    return rows[0]?.id || null;
}

/** → { status, body } — the endpoint without HTTP, for tests. */
export async function handleAnnotations(db, member, { method, query = {}, body = {} }) {
    await ensureAnnotationsTable(db);
    if (method === "DELETE") {
        const id = parseInt(query.id, 10);
        if (!id) return { status: 400, body: { error: "id is required" } };
        const { rowCount } = await db.query("DELETE FROM analytics_annotations WHERE id = $1 AND organisation_id = $2", [id, member.organisationId]);
        return rowCount ? { status: 200, body: { ok: true } } : { status: 404, body: { error: "Not found" } };
    }

    const domain = method === "GET" ? query.domain : body.domain;
    const siteId = domain ? await siteOf(db, member.organisationId, domain) : null;
    if (!siteId) return { status: 404, body: { error: "No analytics site for this domain" } };

    if (method === "GET") {
        if (!validDay(query.from) || !validDay(query.to)) return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
        const { rows } = await db.query(
            `SELECT id, TO_CHAR(day, 'YYYY-MM-DD') AS day, text, created_by, created_at FROM analytics_annotations
              WHERE site_id = $1 AND organisation_id = $2 AND day BETWEEN $3 AND $4 ORDER BY day, id LIMIT 200`,
            [siteId, member.organisationId, query.from, query.to],
        );
        return { status: 200, body: { annotations: rows.map(view) } };
    }

    const text = String(body.text || "").trim();
    if (!validDay(body.day)) return { status: 400, body: { error: "day (YYYY-MM-DD) is required" } };
    if (!text) return { status: 400, body: { error: "text is required" } };
    if (text.length > MAX_TEXT) return { status: 400, body: { error: `text is longer than ${MAX_TEXT} characters` } };
    const { rows } = await db.query(
        `INSERT INTO analytics_annotations (organisation_id, site_id, day, text, created_by) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, TO_CHAR(day, 'YYYY-MM-DD') AS day, text, created_by, created_at`,
        [member.organisationId, siteId, body.day, text, member.email],
    );
    return { status: 200, body: { annotation: view(rows[0]) } };
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
    try {
        const out = await handleAnnotations(getPool(), member, { method: req.method, query: req.query, body: req.body || {} });
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-annotations]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
