import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";

/**
 * /api/analytics-dimensions — the custom dimensions a site sends
 * (intaAnalytics.set, see a.js) with their most frequent values.
 *
 *   GET ?domain=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     → { dimensions: [{ key, pageviews, values: [{ value, pageviews, sessions }] }] }
 *
 * Signed in: Authorization + Organisation (requireMember). Dimensions only
 * exist on consented page views, so every number here is consenting traffic.
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const VALUES_PER_KEY = 20;

/** Rows of (key, value, pageviews, sessions) → grouped per key, most used first. */
export function groupDimensions(rows) {
    const byKey = new Map();
    for (const r of rows) {
        const entry = byKey.get(r.key) || { key: r.key, pageviews: 0, values: [] };
        entry.pageviews += Number(r.pageviews || 0);
        entry.values.push({ value: r.value, pageviews: Number(r.pageviews || 0), sessions: Number(r.sessions || 0) });
        byKey.set(r.key, entry);
    }
    return [...byKey.values()]
        .map((d) => ({ ...d, values: d.values.sort((a, b) => b.pageviews - a.pageviews).slice(0, VALUES_PER_KEY) }))
        .sort((a, b) => b.pageviews - a.pageviews);
}

export async function listDimensions(db, member, query) {
    if (!DAY_RE.test(String(query.from || "")) || !DAY_RE.test(String(query.to || ""))) {
        return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
    }
    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, String(query.domain || "").trim()],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };
    const toExclusive = new Date(Date.parse(query.to) + 864e5).toISOString().slice(0, 10);
    const { rows } = await db.query(
        `SELECT d.key, d.value, COUNT(*) AS pageviews, COUNT(DISTINCT e.session_id) AS sessions
           FROM analytics_events e, jsonb_each_text(e.custom_dims) AS d(key, value)
          WHERE e.site_id = $1 AND e.received_at >= $2 AND e.received_at < $3 AND e.custom_dims IS NOT NULL
          GROUP BY d.key, d.value`,
        [sites[0].id, query.from, toExclusive],
    ).catch((err) => {
        if (/custom_dims/.test(err.message)) return { rows: [] }; // column not created yet
        throw err;
    });
    return { status: 200, body: { dimensions: groupDimensions(rows) } };
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, X-User-Email, ExcludeBots, Content-Type");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    try {
        const out = await listDimensions(getPool(), member, req.query || {});
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-dimensions]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
