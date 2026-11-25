import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { isHeadlineConversionSql } from "./_conversions.js";
import { locationQuery, shapeLocations, regionName, MIN_CITY_SESSIONS } from "./_locations.js";

/**
 * /api/analytics-locations — where visitors and sales come from, one level
 * at a time: countries, the regions of one country, or the cities of one
 * country (optionally one region). Per place: page views, sessions, lead /
 * sale conversions, revenue and the products sold there.
 *
 *   GET ?domain=&from=YYYY-MM-DD&to=YYYY-MM-DD&level=country|region|city&country=DK&region=84
 *
 * City is only recorded for visitors who accepted statistics cookies (see
 * api/a.js), so the city level counts consented traffic only, and cities
 * under MIN_CITY_SESSIONS sessions are merged into "Other cities".
 * Conversions without a stored region/city borrow the one from their
 * session's page view (consented conversions only — others have no session).
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
const COLUMN = { country: "country_code", region: "region", city: "city" };

export async function locationsReport(db, member, query) {
    if (!DAY_RE.test(String(query.from || "")) || !DAY_RE.test(String(query.to || ""))) {
        return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
    }
    const q = locationQuery(query);
    if (q.error) return { status: 400, body: { error: q.error } };

    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, String(query.domain || "").trim()],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };

    const params = [sites[0].id, query.from, new Date(Date.parse(query.to) + 864e5).toISOString().slice(0, 10)];
    const col = COLUMN[q.level];
    // Same row filter as the reports: no embedded widgets, no suspected bots.
    const pvFilter = "AND is_embedded = false AND NOT (is_hosting_ip IS TRUE AND consent_level <> 'full')";

    let pvWhere = "", convWhere = "";
    if (q.country) {
        params.push(q.country);
        pvWhere += ` AND country_code = $${params.length}`;
        convWhere += ` AND COALESCE(ace.country_code, s.country_code) = $${params.length}`;
    }
    if (q.region) {
        params.push(q.region);
        pvWhere += ` AND region = $${params.length}`;
        convWhere += ` AND COALESCE(ace.region, s.region) = $${params.length}`;
    }
    if (q.level === "city") {
        pvWhere += " AND consent_level = 'full'";
        convWhere += " AND ace.consent_level = 'full'";
    }

    // The place a conversion happened: stored on the event itself since
    // region/city were added there; for older consented events, the page
    // view it happened on (pageview_id), else the session's latest one.
    const convFrom = (join = "") => `
        FROM analytics_custom_events ace ${join}
        LEFT JOIN LATERAL (
            SELECT e.country_code, e.region, e.city FROM analytics_events e
             WHERE ace.session_id IS NOT NULL AND e.site_id = ace.site_id AND e.session_id = ace.session_id
             ORDER BY (ace.pageview_id IS NOT NULL AND e.pageview_id = ace.pageview_id) DESC, e.received_at DESC LIMIT 1
        ) s ON true
        WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3 ${convWhere}`;
    const place = `COALESCE(ace.${col}, s.${col})`;
    const missingColumn = (err) => { if (/does not exist/.test(err.message)) return { rows: [] }; throw err; };

    const [pv, conv, products] = await Promise.all([
        db.query(`
            SELECT ${col} AS k, COUNT(*) AS pageviews,
                   COUNT(DISTINCT session_id) FILTER (WHERE consent_level = 'full') AS sessions
                   ${q.level === "city" ? ", AVG(lat) AS lat, AVG(lon) AS lon" : ""}
              FROM analytics_events
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${pvFilter} ${pvWhere}
             GROUP BY 1`, params).catch(missingColumn),
        db.query(`
            SELECT ${place} AS k, COUNT(*) AS conversions, COALESCE(SUM(ace.value_cents), 0) AS revenue_cents, MAX(ace.currency) AS currency
              ${convFrom("LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name")}
               AND ${isHeadlineConversionSql("ace", "d")}
             GROUP BY 1`, params).catch(missingColumn),
        db.query(`
            SELECT ${place} AS k, p->>'id' AS product_id, p->>'name' AS product_name,
                   SUM(COALESCE((p->>'qty')::numeric, 1)) AS units,
                   SUM(COALESCE((p->>'price')::numeric, 0) * COALESCE((p->>'qty')::numeric, 1)) AS revenue
              ${convFrom("CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ace.products) = 'array' THEN ace.products ELSE '[]'::jsonb END) AS p")}
               AND (ace.name = 'purchase' OR ace.name IN (SELECT name FROM analytics_event_defs WHERE site_id = $1 AND kind = 'purchase'))
             GROUP BY 1, 2, 3`, params).catch(missingColumn),
    ]);

    return {
        status: 200,
        body: {
            level: q.level, country: q.country, region: q.region,
            regionName: q.region ? regionName(q.country, q.region) : null,
            minCitySessions: MIN_CITY_SESSIONS,
            ...shapeLocations({ level: q.level, country: q.country, pv: pv.rows, conv: conv.rows, products: products.rows }),
        },
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
        const out = await locationsReport(getPool(), member, req.query || {});
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-locations]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
