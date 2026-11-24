import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { getApprovedDomains, isValidHostname } from "./_self-referral.js";
import { channelSql } from "./analytics-report.js";
import { explainChange, periods } from "./_explain.js";

/**
 * /api/analytics-explain — why a metric changed against the previous period
 * of the same length (see _explain.js).
 *
 *   GET ?domain=&from=YYYY-MM-DD&to=YYYY-MM-DD&metric=pageviews|sessions
 *     → explainChange() + { metric, previousFrom, previousTo }
 *
 * Signed in: Authorization + Organisation (requireMember). Same row filter as
 * the Overview chart: no embedded widgets, own host, suspected bots excluded
 * unless the ExcludeBots header is "0". Sessions are consenting sessions.
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

export async function explain(db, member, query, { excludeBots = true } = {}) {
    const metric = query.metric === "sessions" ? "sessions" : "pageviews";
    if (!DAY_RE.test(String(query.from || "")) || !DAY_RE.test(String(query.to || ""))) {
        return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
    }
    const p = periods(query.from, query.to);
    if (p.days < 1 || p.days > MAX_DAYS) return { status: 400, body: { error: `The range must be 1–${MAX_DAYS} days` } };

    const domain = String(query.domain || "").trim().toLowerCase();
    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, domain],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };
    const siteId = sites[0].id;
    const { CHANNEL_CASE } = channelSql(domain, await getApprovedDomains(db, siteId));

    const filters = [
        "is_embedded = false",
        excludeBots ? "NOT (is_hosting_ip IS TRUE AND consent_level <> 'full')" : null,
        isValidHostname(domain) ? `(page_host = '${domain}' OR page_host = 'www.${domain}')` : null,
    ].filter(Boolean).map((c) => `AND ${c}`).join(" ");
    // $4 = start of the current period: rows before it are the previous period.
    const value = (when) => (metric === "sessions"
        ? `COUNT(DISTINCT session_id) FILTER (WHERE consent_level = 'full' AND received_at ${when} $4)`
        : `COUNT(*) FILTER (WHERE received_at ${when} $4)`);
    const params = [siteId, p.prevFrom, p.toExclusive, p.from];
    const grouped = (expr) => db.query(`
        SELECT ${expr} AS value, ${value(">=")} AS current, ${value("<")} AS previous
          FROM analytics_events
         WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${filters}
         GROUP BY 1
         ORDER BY ABS(${value(">=")} - ${value("<")}) DESC
         LIMIT 20`, params);

    const [totals, channel, device, country, page, channelDevice] = await Promise.all([
        db.query(`SELECT ${value(">=")} AS current, ${value("<")} AS previous FROM analytics_events
                   WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${filters}`, params),
        grouped(CHANNEL_CASE),
        grouped("COALESCE(device_type, 'other')"),
        grouped("COALESCE(country_code, '')"),
        grouped("pathname"),
        grouped(`(${CHANNEL_CASE}) || '|' || COALESCE(device_type, 'other')`),
    ]);
    const result = explainChange(totals.rows[0] || {}, {
        channel: channel.rows, device: device.rows, country: country.rows, page: page.rows, channel_device: channelDevice.rows,
    });
    const prevTo = new Date(Date.parse(p.from) - 864e5).toISOString().slice(0, 10);
    return { status: 200, body: { metric, previousFrom: p.prevFrom, previousTo: prevTo, ...result } };
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
        const out = await explain(getPool(), member, req.query || {}, { excludeBots: String(req.headers.excludebots ?? "1") !== "0" });
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-explain]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
