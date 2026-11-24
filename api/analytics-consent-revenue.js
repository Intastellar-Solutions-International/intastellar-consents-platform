import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { isHeadlineConversionSql } from "./_conversions.js";
import { compareVariants, consentRevenue } from "./_banner-experiment.js";

/**
 * /api/analytics-consent-revenue — what consent is worth: conversions (lead /
 * sale, same rule as everywhere) that can or can't be attributed to a
 * channel, a "5 points more consent" estimate, and banner A/B tests compared
 * by consent rate and conversions per 1,000 page views.
 *
 *   GET ?domain=&from=YYYY-MM-DD&to=YYYY-MM-DD → { ...consentRevenue(), experiments }
 *
 * Signed in: Authorization + Organisation (requireMember).
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function consentRevenueReport(db, member, query) {
    if (!DAY_RE.test(String(query.from || "")) || !DAY_RE.test(String(query.to || ""))) {
        return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
    }
    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, String(query.domain || "").trim()],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };
    const params = [sites[0].id, query.from, new Date(Date.parse(query.to) + 864e5).toISOString().slice(0, 10)];
    // Same row filter as the reports: no embedded widgets, no suspected bots.
    const pvFilter = "AND is_embedded = false AND NOT (is_hosting_ip IS TRUE AND consent_level <> 'full')";
    const headline = isHeadlineConversionSql("ace", "d");
    const missingColumn = (err) => { if (/does not exist/.test(err.message)) return { rows: [] }; throw err; };

    const [levels, pageviews, variantPv, variantConv] = await Promise.all([
        db.query(`
            SELECT ace.consent_level, COUNT(*) AS conversions, COALESCE(SUM(ace.value_cents), 0) AS revenue_cents, MAX(ace.currency) AS currency
              FROM analytics_custom_events ace
              LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
             WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3 AND ${headline}
             GROUP BY ace.consent_level`, params).catch(missingColumn),
        db.query(`
            SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE consent_level = 'full') AS full
              FROM analytics_events WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${pvFilter}`, params),
        db.query(`
            SELECT banner_exp, banner_variant, COUNT(*) AS total, COUNT(*) FILTER (WHERE consent_level = 'full') AS full
              FROM analytics_events
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${pvFilter}
               AND banner_exp IS NOT NULL AND banner_variant IS NOT NULL
             GROUP BY banner_exp, banner_variant`, params).catch(missingColumn),
        db.query(`
            SELECT ace.banner_exp, ace.banner_variant, COUNT(*) AS conversions,
                   COUNT(*) FILTER (WHERE ace.consent_level = 'full') AS attributable,
                   COALESCE(SUM(ace.value_cents) FILTER (WHERE ace.consent_level = 'full'), 0) AS revenue_cents
              FROM analytics_custom_events ace
              LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
             WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3 AND ${headline}
               AND ace.banner_exp IS NOT NULL AND ace.banner_variant IS NOT NULL
             GROUP BY ace.banner_exp, ace.banner_variant`, params).catch(missingColumn),
    ]);
    return {
        status: 200,
        body: { ...consentRevenue(levels.rows, pageviews.rows[0] || {}), experiments: compareVariants(variantPv.rows, variantConv.rows) },
    };
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
        const out = await consentRevenueReport(getPool(), member, req.query || {});
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-consent-revenue]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
