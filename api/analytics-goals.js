import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { isHeadlineConversionSql, formIdSql } from "./_conversions.js";
import { channelSql } from "./analytics-report.js";
import { getApprovedDomains } from "./_self-referral.js";
import { goalKeySql, cleanGoalKey, shapeGoals, shapePath, bucketMinutes, median } from "./_goals.js";

/**
 * /api/analytics-goals — the Conversions page: conversions per goal (form
 * lead types, other forms, registered lead / sale events) and, for the goal
 * picked, its trend, its path (page → form started → converted), form
 * errors, what brings it (channel / campaign / landing page / country, first
 * or last touch), time to convert and device.
 *
 *   GET ?domain=&from=&to=&goal=all|type:Demo|forms|event:name&by=channel|campaign|landing|country&touch=first|last
 *
 * Attribution, paths and time to convert need a session, so they cover
 * visitors who accepted statistics cookies; counts and country cover all.
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
const BY = ["channel", "campaign", "landing", "country"];

const num = (v) => Number(v) || 0;
const missingTable = (err) => { if (/does not exist/.test(err.message)) return { rows: [] }; throw err; };

export async function goalsReport(db, member, query, { excludeBots = true } = {}) {
    if (!DAY_RE.test(String(query.from || "")) || !DAY_RE.test(String(query.to || ""))) {
        return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
    }
    const domain = String(query.domain || "").trim().toLowerCase();
    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, domain],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };
    const siteId = sites[0].id;

    const goal = cleanGoalKey(query.goal);
    const by = BY.includes(query.by) ? query.by : "channel";
    const touch = query.touch === "last" ? "last" : "first";
    const from = query.from;
    const toExcl = new Date(Date.parse(query.to) + 864e5).toISOString().slice(0, 10);
    const days = Math.round((Date.parse(toExcl) - Date.parse(from)) / 864e5);
    const prevFrom = new Date(Date.parse(from) - days * 864e5).toISOString().slice(0, 10);

    const { CHANNEL_CASE } = channelSql(domain, await getApprovedDomains(db, siteId).catch(() => []));
    // Same page-view filter as the reports: no embedded widgets; suspected bots out unless asked
    const PV = `AND is_embedded = false${excludeBots ? " AND NOT (is_hosting_ip IS TRUE AND consent_level <> 'full')" : ""}`;
    const base = [siteId, from, toExcl];
    // Conversions of the picked goal in the period ($4 = goal key unless "all")
    const CONV = `FROM analytics_custom_events ace
        LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
        WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
          AND ${isHeadlineConversionSql("ace", "d")}
          ${goal === "all" ? "" : `AND ${goalKeySql("ace")} = $4`}`;
    const gp = goal === "all" ? base : [...base, goal];

    const dim = by === "campaign" ? "NULLIF(e.utm_campaign, '')" : by === "landing" ? "e.pathname" : CHANNEL_CASE;

    const [goalsRes, defsRes, dailyRes, sessionsRes, convRes, breakdownRes, denomRes, timesRes, deviceRes] = await Promise.all([
        db.query(`
            SELECT ${goalKeySql("ace")} AS goal_key,
                   COUNT(*) FILTER (WHERE ace.received_at >= $2) AS cur,
                   COUNT(*) FILTER (WHERE ace.received_at <  $2) AS prev
              FROM analytics_custom_events ace
              LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
             WHERE ace.site_id = $1 AND ace.received_at >= $4 AND ace.received_at < $3
               AND ${isHeadlineConversionSql("ace", "d")}
             GROUP BY 1`, [siteId, from, toExcl, prevFrom]).catch(missingTable),
        db.query("SELECT name, label FROM analytics_event_defs WHERE site_id = $1", [siteId]).catch(missingTable),
        db.query(`SELECT to_char(date_trunc('day', ace.received_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n ${CONV} GROUP BY 1 ORDER BY 1`, gp).catch(missingTable),
        db.query(`
            SELECT COUNT(DISTINCT session_id) AS sessions FROM analytics_events
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
               AND consent_level = 'full' AND session_id IS NOT NULL ${PV}`, base),
        db.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE ace.session_id IS NOT NULL) AS attributable,
                   COUNT(DISTINCT ace.session_id) AS converted_sessions
            ${CONV}`, gp).catch(missingTable),
        by === "country"
            ? db.query(`
                SELECT COALESCE(ace.country_code, '') AS k, COUNT(*) AS conversions,
                       COUNT(DISTINCT ace.session_id) AS converted_sessions
                ${CONV} GROUP BY 1`, gp).catch(missingTable)
            // The session's first page view (first touch) or its last one up
            // to the conversion (last touch) gives the channel / campaign / page.
            : db.query(`
                WITH conv AS (SELECT ace.session_id AS sid, ace.received_at AS at ${CONV} AND ace.session_id IS NOT NULL),
                touched AS (
                    SELECT DISTINCT ON (c.sid, c.at) c.sid, ${dim} AS k
                      FROM conv c
                      JOIN analytics_events e ON e.site_id = $1 AND e.session_id = c.sid
                                             AND e.received_at <= c.at + interval '1 minute'
                     ORDER BY c.sid, c.at, e.received_at ${touch === "first" ? "ASC" : "DESC"}
                )
                SELECT COALESCE(k, '') AS k, COUNT(*) AS conversions, COUNT(DISTINCT sid) AS converted_sessions FROM touched GROUP BY 1`, gp).catch(missingTable),
        // Consented sessions per value, by where they started — the rate's denominator
        by === "country"
            ? db.query(`
                SELECT COALESCE(country_code, '') AS k, COUNT(DISTINCT session_id) AS sessions FROM analytics_events
                 WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                   AND consent_level = 'full' AND session_id IS NOT NULL ${PV} GROUP BY 1`, base)
            : db.query(`
                WITH firsts AS (
                    SELECT DISTINCT ON (session_id) ${dim.replace(/\be\./g, "")} AS k FROM analytics_events
                     WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                       AND consent_level = 'full' AND session_id IS NOT NULL ${PV}
                     ORDER BY session_id, received_at
                )
                SELECT COALESCE(k, '') AS k, COUNT(*) AS sessions FROM firsts GROUP BY 1`, base),
        db.query(`
            WITH conv AS (SELECT ace.session_id AS sid, ace.received_at AS at ${CONV} AND ace.session_id IS NOT NULL)
            SELECT EXTRACT(EPOCH FROM (c.at - MIN(e.received_at))) / 60 AS minutes
              FROM conv c JOIN analytics_events e ON e.site_id = $1 AND e.session_id = c.sid AND e.received_at <= c.at
             GROUP BY c.sid, c.at`, gp).catch(missingTable),
        db.query(`SELECT COALESCE(ace.device_type, '') AS k, COUNT(*) AS n ${CONV} GROUP BY 1 ORDER BY 2 DESC`, gp).catch(missingTable),
    ]);

    const defLabels = new Map(defsRes.rows.map((d) => [d.name, d.label || d.name]));
    const goals = shapeGoals(goalsRes.rows, defLabels);
    const conv = convRes.rows[0] || {};
    const sessions = num(sessionsRes.rows[0]?.sessions);
    const denom = new Map(denomRes.rows.map((r) => [r.k, num(r.sessions)]));
    const total = num(conv.total), attributable = num(conv.attributable);
    const breakdown = breakdownRes.rows
        .map((r) => ({
            key: r.k,
            conversions: num(r.conversions),
            // Rate = converted / all consented sessions that started there (first touch, country)
            rate: touch === "first" || by === "country"
                ? (denom.get(r.k) ? (num(r.converted_sessions) / denom.get(r.k)) * 100 : null)
                : null,
            sessions: denom.get(r.k) ?? null,
        }))
        .sort((a, b) => b.conversions - a.conversions);
    const minutes = timesRes.rows.map((r) => num(r.minutes));

    return {
        status: 200,
        body: {
            goal, by, touch, from, to: query.to,
            goals,
            selected: goals.find((g) => g.key === goal) || { key: goal, label: goal, count: 0, prevCount: 0, trend: null },
            daily: dailyRes.rows.map((r) => ({ date: r.day, count: num(r.n) })),
            totals: {
                conversions: total,
                attributable,
                consentedSessions: sessions,
                convertedSessions: num(conv.converted_sessions),
                rate: sessions ? (num(conv.converted_sessions) / sessions) * 100 : null,
            },
            path: goal.startsWith("type:") || goal.startsWith("event:") ? await goalPath(db, siteId, from, toExcl, goal, PV) : null,
            breakdown,
            // Conversions without a session (no statistics consent) can't be attributed
            notAttributable: by === "country" ? 0 : Math.max(0, total - attributable),
            timeToConvert: { medianMinutes: median(minutes), buckets: bucketMinutes(minutes) },
            devices: deviceRes.rows.map((r) => ({ key: r.k, count: num(r.n) })),
        },
    };
}

/**
 * A goal's path in consented sessions. Form lead type: visited a page with
 * one of its forms → started the form → submitted, plus that form's errors.
 * Registered event: visited a page where it fires → converted.
 */
async function goalPath(db, siteId, from, toExcl, goal, PV) {
    const isForm = goal.startsWith("type:");
    const value = goal.slice(isForm ? 5 : 6);
    const params = [siteId, from, toExcl, value, goal];
    const formIds = `SELECT form_id FROM analytics_form_goals WHERE site_id = $1 AND lead_type = $4 AND counts = true`;
    const pages = isForm
        ? `SELECT DISTINCT ace.pathname FROM analytics_custom_events ace
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.name IN ('form_started', 'form_submit') AND ${formIdSql("ace")} IN (${formIds})`
        : `SELECT DISTINCT ace.pathname FROM analytics_custom_events ace
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3 AND ace.name = $4`;
    const { rows: [r] } = await db.query(`
        SELECT
          (SELECT COUNT(DISTINCT session_id) FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND consent_level = 'full' AND session_id IS NOT NULL ${PV}
              AND pathname IN (${pages})) AS visited,
          ${isForm ? `(SELECT COUNT(DISTINCT ace.session_id) FROM analytics_custom_events ace
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.name = 'form_started' AND ace.session_id IS NOT NULL
              AND ${formIdSql("ace")} IN (${formIds}))` : "NULL"} AS started,
          (SELECT COUNT(DISTINCT ace.session_id) FROM analytics_custom_events ace
             LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3 AND ace.session_id IS NOT NULL
              AND ${isHeadlineConversionSql("ace", "d")} AND ${goalKeySql("ace")} = $5) AS converted,
          ${isForm ? `(SELECT COUNT(*) FROM analytics_custom_events ace
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.name = 'form_error' AND ace.extra_data->>'errorType' = 'network'
              AND ${formIdSql("ace")} IN (${formIds}))` : "0"} AS network_errors,
          ${isForm ? `(SELECT COUNT(*) FROM analytics_custom_events ace
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.name = 'form_error' AND COALESCE(ace.extra_data->>'errorType', '') <> 'network'
              AND ${formIdSql("ace")} IN (${formIds}))` : "0"} AS validation_errors`, params).catch(missingTable).then((x) => x.rows.length ? x : { rows: [{}] });
    const steps = isForm
        ? [{ key: "visited", count: r.visited }, { key: "started", count: r.started }, { key: "converted", count: r.converted }]
        : [{ key: "visited", count: r.visited }, { key: "converted", count: r.converted }];
    return {
        kind: isForm ? "form" : "event",
        steps: shapePath(steps),
        errors: { network: num(r.network_errors), validation: num(r.validation_errors) },
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
        const excludeBots = String(req.headers.excludebots ?? "1") !== "0";
        const out = await goalsReport(getPool(), member, req.query || {}, { excludeBots });
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-goals]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
