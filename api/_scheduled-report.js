/**
 * Shared scheduled-report logic — used by analytics-scheduled-reports.js
 * (manual "send test" trigger) and cron-analytics-scheduled-reports.js
 * (automatic weekly/monthly send).
 *
 * Exported: buildReportData(db, siteIds, periodDays)
 *           resolveReportSites(db, cfg)
 *           buildReportEmailHtml({ domain, frequency, label, data, clientName })
 *           renderScheduledReport(db, cfg) — the above combined, for one config
 *           sendReportEmail({ recipients, subject, html })
 *
 * A report covers one site (site_id) or, for an Agency Pro client report, all
 * domains of one client workspace (workspace_id + a stored domains list).
 */

import { emailLayout, EMAIL_FONT, ANALYTICS_BRAND, ANALYTICS_LOGO_ATTACHMENT } from "./_email-layout.js";
import { selfReferralClause, noiseReferralClause, getApprovedDomainsForSites } from "./_self-referral.js";
import { isHeadlineConversionSql, REVENUE_DASHBOARDS } from "./_conversions.js";
import { goalKeySql, goalLabel } from "./_goals.js";
import { channelSql } from "./analytics-report.js";

function pctChange(cur, prev) {
    if (prev == null || prev === 0 || cur == null) return null;
    return ((cur - prev) / prev) * 100;
}

// ── Report data ───────────────────────────────────────────────────────────────

// The sites a scheduled-report config covers: its one site, or the domains
// stored on a client report — only those that still belong to the config's
// organisation and are active.
export async function resolveReportSites(db, cfg) {
    const { rows } = cfg.workspace_id
        ? await db.query(
            `SELECT id, domain FROM analytics_sites
             WHERE organisation_id = $1 AND LOWER(domain) = ANY($2) AND active = true
             ORDER BY domain`,
            [cfg.organisation_id, (cfg.domains || []).map(d => String(d).toLowerCase())]
        ).catch(() => ({ rows: [] }))
        : await db.query(
            `SELECT id, domain FROM analytics_sites WHERE id = $1 LIMIT 1`, [cfg.site_id]
        ).catch(() => ({ rows: [] }));
    return { siteIds: rows.map(r => r.id), domains: rows.map(r => r.domain) };
}

export async function buildReportData(db, siteIds, periodDays) {
    siteIds = [].concat(siteIds);
    const now = new Date();
    const toDateExclusive   = now.toISOString().slice(0, 10);
    const fromDate          = new Date(now - periodDays * 86400000).toISOString().slice(0, 10);
    const prevToExclusive   = fromDate;
    const prevFrom          = new Date(now - periodDays * 2 * 86400000).toISOString().slice(0, 10);

    // See docs/analytics-audit-plan.md item 2 — same self-referral exclusion
    // as api/analytics-report.js's referrers table, applied here so the
    // weekly/monthly emailed report doesn't show the site's own domain as a
    // top "referrer".
    const [{ rows: siteDomainRows }, approvedDomains] = await Promise.all([
        db.query(`SELECT id, domain, business_type FROM analytics_sites WHERE id = ANY($1)`, [siteIds]).catch(() => ({ rows: [] })),
        getApprovedDomainsForSites(db, siteIds),
    ]);
    const SELF_REFERRAL = selfReferralClause(siteDomainRows.map(r => r.domain), approvedDomains);
    const NOISE_REFERRAL = noiseReferralClause();
    const { CHANNEL_CASE } = channelSql(siteDomainRows.map(r => r.domain), approvedDomains);
    // Same page views as the dashboard's default: no embedded widgets, no
    // suspected bots (hosting IPs without consent — see analytics-report.js).
    const PV = "AND is_embedded = false AND NOT (is_hosting_ip IS TRUE AND consent_level <> 'full')";

    const totalsQuery = (from, to) => db.query(`
        SELECT
            COUNT(*)                                                          AS total,
            COUNT(*) FILTER (WHERE consent_level = 'full')                    AS full_count,
            COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)  AS unique_sessions
        FROM analytics_events
        WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3 ${PV}`,
        [siteIds, from, to]
    ).catch(() => ({ rows: [] }));

    const engagedQuery = (from, to) => db.query(`
        WITH session_stats AS (
            SELECT session_id, MAX(duration_sec) AS max_duration, COUNT(*) AS pageviews
            FROM analytics_events
            WHERE site_id = ANY($1) AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND session_id IS NOT NULL ${PV}
            GROUP BY session_id
        )
        SELECT COUNT(*) AS engaged
        FROM session_stats s
        WHERE s.max_duration >= 10
           OR s.pageviews > 1
           OR EXISTS (
                SELECT 1 FROM analytics_clicks c
                WHERE c.site_id = ANY($1) AND c.session_id = s.session_id
                  AND c.received_at >= $2 AND c.received_at < $3
           )`,
        [siteIds, from, to]
    ).catch(() => ({ rows: [] }));

    // "Conversion" here means headline tier (lead/sale) per api/_conversions.js
    // — not just "any event registered in analytics_event_defs", which also
    // matches Intent-tier clicks and unregistered/auto-collected Micro-tier
    // noise (scroll_depth, page_perf, ...) if those ever got registered too.
    const conversionsTotalQuery = (from, to) => db.query(`
        SELECT COUNT(*) AS total FROM analytics_custom_events ace
        LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
        WHERE ace.site_id = ANY($1) AND ace.received_at >= $2 AND ace.received_at < $3
          AND ${isHeadlineConversionSql("ace", "d")}`,
        [siteIds, from, to]
    ).catch(() => ({ rows: [] }));

    const [
        totalsRes, prevTotalsRes, engagedRes, prevEngagedRes,
        pagesRes, countriesRes, referrersRes, conversionsRes, revenueRes,
        conversionsTotalRes, prevConversionsTotalRes,
        perSiteRes, perSiteConversionsRes,
        dailyRes, goalsRes, defsRes, channelsRes,
    ] = await Promise.all([
        totalsQuery(fromDate, toDateExclusive),
        totalsQuery(prevFrom, prevToExclusive),
        engagedQuery(fromDate, toDateExclusive),
        engagedQuery(prevFrom, prevToExclusive),

        db.query(`
            SELECT site_id, pathname, COUNT(*) AS views
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3 ${PV}
              AND pathname !~* '^/api/'
              AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            GROUP BY site_id, pathname ORDER BY views DESC LIMIT 5`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3 ${PV}
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 5`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT CASE WHEN COALESCE(referrer_host, '') = '' OR ${SELF_REFERRAL} OR ${NOISE_REFERRAL}
                        THEN '(direct)' ELSE referrer_host END AS referrer,
                   COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
            GROUP BY referrer ORDER BY events DESC LIMIT 5`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT ace.name, COUNT(*) AS count
            FROM analytics_custom_events ace
            LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
            WHERE ace.site_id = ANY($1) AND ace.received_at >= $2 AND ace.received_at < $3
              AND ${isHeadlineConversionSql("ace", "d")}
            GROUP BY ace.name ORDER BY count DESC LIMIT 1`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT COALESCE(SUM(value_cents), 0) AS total_cents,
                   COUNT(*)                       AS transactions,
                   (ARRAY_AGG(currency) FILTER (WHERE currency IS NOT NULL))[1] AS currency
            FROM analytics_custom_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
              AND value_cents IS NOT NULL
              AND (name = 'purchase' OR name IN (
                    SELECT d.name FROM analytics_event_defs d
                    WHERE d.site_id = analytics_custom_events.site_id AND d.kind = 'purchase'
              ))`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Total conversion events, computed separately from the "top named event"
        // query above (which caps at 1 row) so the summary count isn't limited by it.
        conversionsTotalQuery(fromDate, toDateExclusive),
        conversionsTotalQuery(prevFrom, prevToExclusive),

        // Per-domain breakdown — only for client reports covering several sites.
        siteIds.length > 1 ? db.query(`
            SELECT site_id,
                   COUNT(*) FILTER (WHERE received_at >= $2)                                          AS total,
                   COUNT(*) FILTER (WHERE received_at >= $2 AND consent_level = 'full')               AS full_count,
                   COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL AND received_at >= $2) AS sessions,
                   COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL AND received_at <  $2) AS prev_sessions
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $3 AND received_at < $4
            GROUP BY site_id`,
            [siteIds, fromDate, prevFrom, toDateExclusive]
        ).catch(() => ({ rows: [] })) : { rows: [] },
        siteIds.length > 1 ? db.query(`
            SELECT ace.site_id, COUNT(*) AS conversions
            FROM analytics_custom_events ace
            LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
            WHERE ace.site_id = ANY($1) AND ace.received_at >= $2 AND ace.received_at < $3
              AND ${isHeadlineConversionSql("ace", "d")}
            GROUP BY ace.site_id`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })) : { rows: [] },

        // Page views per day, for the chart
        db.query(`
            SELECT to_char(date_trunc('day', received_at), 'YYYY-MM-DD') AS day, COUNT(*) AS views
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3 ${PV}
            GROUP BY 1`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),
        // Conversions per goal (form lead types, other forms, lead / sale events), this and last period
        db.query(`
            SELECT ${goalKeySql("ace")} AS goal_key,
                   COUNT(*) FILTER (WHERE ace.received_at >= $2) AS cur,
                   COUNT(*) FILTER (WHERE ace.received_at <  $2) AS prev
            FROM analytics_custom_events ace
            LEFT JOIN analytics_event_defs d ON d.site_id = ace.site_id AND d.name = ace.name
            WHERE ace.site_id = ANY($1) AND ace.received_at >= $3 AND ace.received_at < $4
              AND ${isHeadlineConversionSql("ace", "d")}
            GROUP BY 1`,
            [siteIds, fromDate, prevFrom, toDateExclusive]
        ).catch(() => ({ rows: [] })),
        db.query(`SELECT name, label FROM analytics_event_defs WHERE site_id = ANY($1)`, [siteIds]).catch(() => ({ rows: [] })),
        // Consented sessions by the channel they arrived through (first page view)
        db.query(`
            WITH firsts AS (
                SELECT DISTINCT ON (session_id) ${CHANNEL_CASE} AS channel
                FROM analytics_events
                WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
                  AND consent_level = 'full' AND session_id IS NOT NULL ${PV}
                ORDER BY session_id, received_at
            )
            SELECT channel, COUNT(*) AS sessions FROM firsts GROUP BY 1 ORDER BY 2 DESC`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),
    ]);

    const t     = totalsRes.rows[0] || {};
    const prevT = prevTotalsRes.rows[0] || {};
    const total     = Number(t.total || 0);
    const prevTotal = Number(prevT.total || 0);
    const consentRate     = total > 0     ? (Number(t.full_count     || 0) / total)     * 100 : 0;
    const prevConsentRate = prevTotal > 0 ? (Number(prevT.full_count || 0) / prevTotal) * 100 : 0;

    const conversionsTotal     = Number(conversionsTotalRes.rows[0]?.total || 0);
    const prevConversionsTotal = Number(prevConversionsTotalRes.rows[0]?.total || 0);
    const revenueCents = Number(revenueRes.rows[0]?.total_cents || 0);

    const perSite = new Map(perSiteRes.rows.map(r => [String(r.site_id), r]));
    const perSiteConversions = new Map(perSiteConversionsRes.rows.map(r => [String(r.site_id), Number(r.conversions || 0)]));
    const perDomain = siteIds.length > 1
        ? siteDomainRows.map(({ id, domain }) => {
            const r = perSite.get(String(id)) || {};
            const siteTotal = Number(r.total || 0);
            const sessions = Number(r.sessions || 0);
            return {
                domain,
                sessions,
                sessionsTrend: pctChange(sessions, Number(r.prev_sessions || 0)),
                consentRate:   siteTotal > 0 ? (Number(r.full_count || 0) / siteTotal) * 100 : null,
                conversions:   perSiteConversions.get(String(id)) || 0,
            };
        }).sort((a, b) => b.sessions - a.sessions)
        : [];

    return {
        periodDays,
        from: fromDate,
        to: new Date(now - 86400000).toISOString().slice(0, 10),
        totals: {
            events:        total,
            sessions:      Number(t.unique_sessions || 0),
            engagedUsers:  Number(engagedRes.rows[0]?.engaged || 0),
            consentRate,
            conversions:   conversionsTotal,
        },
        // Last period's values, so the email can say "vs 126 last week"
        previous: {
            sessions:     Number(prevT.unique_sessions || 0),
            engagedUsers: Number(prevEngagedRes.rows[0]?.engaged || 0),
            consentRate:  prevTotal > 0 ? prevConsentRate : null,
            conversions:  prevConversionsTotal,
        },
        daily: (() => {
            const byDay = new Map(dailyRes.rows.map(r => [r.day, Number(r.views || 0)]));
            return Array.from({ length: periodDays }, (_, i) => {
                const day = new Date(Date.parse(fromDate) + i * 86400000).toISOString().slice(0, 10);
                return { date: day, views: byDay.get(day) || 0 };
            });
        })(),
        goals: (() => {
            const labels = new Map(defsRes.rows.map(d => [d.name, d.label || d.name]));
            return goalsRes.rows
                .map(r => ({ key: r.goal_key, label: goalLabel(r.goal_key, labels), count: Number(r.cur || 0), prev: Number(r.prev || 0) }))
                .filter(g => g.count > 0 || g.prev > 0)
                .sort((a, b) => b.count - a.count || b.prev - a.prev);
        })(),
        channels: channelsRes.rows.map(r => ({ key: r.channel, sessions: Number(r.sessions || 0) })),
        trends: {
            events:       pctChange(total, prevTotal),
            sessions:     pctChange(Number(t.unique_sessions || 0), Number(prevT.unique_sessions || 0)),
            engagedUsers: pctChange(Number(engagedRes.rows[0]?.engaged || 0), Number(prevEngagedRes.rows[0]?.engaged || 0)),
            consentRate:  consentRate - prevConsentRate, // percentage-point delta, not a ratio
            conversions:  pctChange(conversionsTotal, prevConversionsTotal),
        },
        // A client report spans several domains, so its paths name the domain.
        topPages:     pagesRes.rows.map(r => ({
            pathname: siteIds.length > 1 ? (siteDomainRows.find(d => String(d.id) === String(r.site_id))?.domain || "") + r.pathname : r.pathname,
            views: Number(r.views || 0),
        })),
        topCountries: countriesRes.rows.map(r => ({ code: r.country_code, events: Number(r.events || 0) })),
        topReferrers: referrersRes.rows.map(r => ({ referrer: r.referrer, events: Number(r.events || 0) })),
        topConversion: conversionsRes.rows[0]
            ? { name: conversionsRes.rows[0].name, count: Number(conversionsRes.rows[0].count || 0) }
            : null,
        perDomain,
        // Revenue only when a site's dashboard mode sells something (REVENUE_DASHBOARDS)
        revenue: revenueCents > 0 && siteDomainRows.some(r => REVENUE_DASHBOARDS.includes(r.business_type))
            ? { total: revenueCents / 100, currency: revenueRes.rows[0]?.currency || null, transactions: Number(revenueRes.rows[0]?.transactions || 0) }
            : null,
    };
}

// ── Email ─────────────────────────────────────────────────────────────────────
// Tables and inline styles only (what mail clients render), 600px wide,
// one column so it reads the same on a phone. Bars are table cells with a
// background colour — no images, no CSS that Outlook drops.

const APP_URL = "https://www.intastellarconsents.com";
const C = { text: "#1c1c1c", body: "#4a4a4a", muted: "#6b6b6b", line: "#e5e5e2", bar: "#a78941", barSoft: "#eadfc4", up: "#15803d", down: "#b42318", tint: "#faf5e8" };
const FONT = EMAIL_FONT;

// Labels, client names and visitor-supplied paths/referrers all end up in
// the email body.
function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const num = (n) => Number(n || 0).toLocaleString("en-US");
const fmtPct = (n, decimals = 1) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(decimals) + "%" : "—");

const CHANNEL_LABELS = { organic: "Organic search", paid: "Paid search & ads", paid_social: "Paid social", referral: "Referral sites", direct: "Direct" };
let regionNames = null;
function countryName(code) {
    try {
        regionNames = regionNames || new Intl.DisplayNames(["en"], { type: "region" });
        return regionNames.of(code) || code;
    } catch {
        return code;
    }
}

/** "18–24 Nov 2026" (or "28 Oct – 26 Nov 2026") from two YYYY-MM-DD days. */
export function formatRange(from, to) {
    const a = new Date(from + "T12:00:00Z"), b = new Date(to + "T12:00:00Z");
    const day = (d) => d.getUTCDate();
    const mon = (d) => d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${day(a)} ${mon(a)} ${a.getUTCFullYear()} – ${day(b)} ${mon(b)} ${b.getUTCFullYear()}`;
    if (a.getUTCMonth() !== b.getUTCMonth()) return `${day(a)} ${mon(a)} – ${day(b)} ${mon(b)} ${b.getUTCFullYear()}`;
    return `${day(a)}–${day(b)} ${mon(b)} ${b.getUTCFullYear()}`;
}

/**
 * The one sentence worth reading first: the biggest real change among
 * conversions, sessions and active users (small numbers don't count as a
 * change), else a steady-week line. Plain text — also the inbox preview.
 */
export function reportHeadline(data, unit) {
    const p = data.previous || {}, t = data.totals;
    const change = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
    const candidates = [
        { what: "Conversions", cur: t.conversions, prev: p.conversions, min: 3, weight: 1.5 },
        { what: "Sessions", cur: t.sessions, prev: p.sessions, min: 20, weight: 1 },
        { what: "Active users", cur: t.engagedUsers, prev: p.engagedUsers, min: 20, weight: 1 },
    ].map((c) => ({ ...c, pct: change(c.cur, c.prev) }))
        .filter((c) => c.pct != null && Math.max(c.cur, c.prev) >= c.min && Math.abs(c.pct) >= 15);
    if (!candidates.length) {
        return `A steady ${unit}: ${num(t.sessions)} sessions and ${num(t.conversions)} conversion${t.conversions === 1 ? "" : "s"}, close to the ${unit} before.`;
    }
    const top = candidates.sort((a, b) => Math.abs(b.pct) * b.weight - Math.abs(a.pct) * a.weight)[0];
    if (top.cur === 0) return `No ${top.what.toLowerCase()} this ${unit}, after ${num(top.prev)} the ${unit} before.`;
    return `${top.what} ${top.pct > 0 ? "up" : "down"} ${Math.abs(Math.round(top.pct))}%: ${num(top.cur)} this ${unit}, ${num(top.prev)} the ${unit} before.`;
}

/** ▲ +12% / ▼ −41% pill; points for rates. Good / bad colour follows direction. */
function changePill(value, { points = false } = {}) {
    if (value == null || !Number.isFinite(value)) return `<span style="${FONT}font-size:12px;color:${C.muted}">new</span>`;
    const rounded = points ? Math.round(value * 10) / 10 : Math.round(value);
    if (rounded === 0) return `<span style="${FONT}font-size:12px;font-weight:700;color:${C.muted}">±0${points ? " pts" : "%"}</span>`;
    const up = rounded > 0;
    const text = `${up ? "▲ +" : "▼ −"}${Math.abs(rounded)}${points ? " pts" : "%"}`;
    return `<span style="${FONT}font-size:12px;font-weight:700;color:${up ? C.up : C.down};white-space:nowrap">${text}</span>`;
}

function kpiCell({ label, value, change, points, previous }) {
    return `<td width="50%" valign="top" style="padding:6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate">
          <tr><td style="padding:14px 16px">
            <p style="margin:0;${FONT}font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.muted}">${label}</p>
            <p style="margin:6px 0 0;${FONT}font-size:26px;line-height:30px;font-weight:700;color:${C.text}">${value}</p>
            <p style="margin:6px 0 0;${FONT}font-size:12px;color:${C.muted}">${changePill(change, { points })}&nbsp; vs ${previous}</p>
          </td></tr>
        </table>
      </td>`;
}

function sectionTitle(title, hint) {
    return `<p style="margin:28px 0 10px;${FONT}font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.text}">${title}${hint ? `<span style="font-weight:400;letter-spacing:0;text-transform:none;color:${C.muted}"> · ${hint}</span>` : ""}</p>`;
}

/** Page views per day as bars (table cells), with first / middle / last date. */
function dailyChart(daily) {
    if (!daily?.length) return "";
    const max = Math.max(...daily.map((d) => d.views), 1);
    const H = 90;
    const bars = daily.map((d) => {
        const h = Math.max(2, Math.round((d.views / max) * H));
        return `<td valign="bottom" style="padding:0 1px" title="${esc(d.date)}: ${num(d.views)}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="${h}" bgcolor="${d.views === max ? C.bar : C.barSoft}" style="height:${h}px;line-height:${h}px;font-size:0;border-radius:3px 3px 0 0">&nbsp;</td></tr></table>
          </td>`;
    }).join("");
    const label = (d) => new Date(d.date + "T12:00:00Z").toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const mid = daily[Math.floor((daily.length - 1) / 2)];
    return `${sectionTitle("Page views per day", `busiest day ${num(max)}`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr style="height:${H}px">${bars}</tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>
        <td style="${FONT}font-size:11px;color:${C.muted}">${label(daily[0])}</td>
        <td align="center" style="${FONT}font-size:11px;color:${C.muted}">${daily.length > 2 ? label(mid) : ""}</td>
        <td align="right" style="${FONT}font-size:11px;color:${C.muted}">${label(daily[daily.length - 1])}</td>
      </tr></table>`;
}

/** Label · bar · value rows, longest bar = the biggest value. */
function barList(rows) {
    if (!rows.length) return "";
    const max = Math.max(...rows.map((r) => r.value), 1);
    const body = rows.map((r) => {
        const pct = Math.max(2, Math.round((r.value / max) * 100));
        return `<tr>
            <td width="44%" style="padding:7px 12px 7px 0;${FONT}font-size:14px;color:${C.text};border-top:1px solid ${C.line};overflow-wrap:anywhere;word-break:break-word">${esc(r.label)}</td>
            <td width="38%" style="padding:7px 12px 7px 0;border-top:1px solid ${C.line}">
              <table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0"><tr><td height="8" bgcolor="${C.bar}" style="height:8px;line-height:8px;font-size:0;border-radius:4px">&nbsp;</td></tr></table>
            </td>
            <td align="right" style="padding:7px 0;${FONT}font-size:14px;font-weight:700;color:${C.text};border-top:1px solid ${C.line};white-space:nowrap">${r.display ?? num(r.value)}</td>
          </tr>`;
    }).join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${body}</table>`;
}

function goalsTable(goals, unit) {
    if (!goals.length) {
        return `<p style="margin:0;${FONT}font-size:14px;color:${C.muted}">No conversions this ${unit} or the ${unit} before.</p>`;
    }
    const body = goals.map((g) => `<tr>
        <td style="padding:8px 12px 8px 0;${FONT}font-size:14px;color:${C.text};border-top:1px solid ${C.line}">${esc(g.label)}</td>
        <td align="right" style="padding:8px 12px 8px 0;${FONT}font-size:16px;font-weight:700;color:${C.text};border-top:1px solid ${C.line}">${num(g.count)}</td>
        <td align="right" style="padding:8px 0;${FONT}font-size:12px;color:${C.muted};border-top:1px solid ${C.line};white-space:nowrap">${changePill(g.prev > 0 ? ((g.count - g.prev) / g.prev) * 100 : g.count > 0 ? null : 0)}&nbsp; vs ${num(g.prev)}</td>
      </tr>`).join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${body}</table>`;
}

function domainTable(rows) {
    if (!rows?.length) return "";
    const th = (text, align = "right") =>
        `<th align="${align}" style="padding:6px 0;${FONT}font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:${C.muted}">${text}</th>`;
    const td = (html, align = "right") =>
        `<td align="${align}" style="padding:8px 0;${FONT}font-size:14px;color:${align === "left" ? C.text : C.body};border-top:1px solid ${C.line}">${html}</td>`;
    const body = rows.map(r => `<tr>
            ${td(esc(r.domain), "left")}
            ${td(`${num(r.sessions)} ${changePill(r.sessionsTrend)}`)}
            ${td(fmtPct(r.consentRate))}
            ${td(num(r.conversions))}
        </tr>`).join("");
    return `${sectionTitle("By domain")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>${th("Domain", "left")}${th("Sessions")}${th("Consent")}${th("Conversions")}</tr>
            ${body}
        </table>`;
}

function dashboardUrl(domain, path = "") {
    if (!domain) return APP_URL + "/analytics" + path;
    return `${APP_URL}/analytics/${encodeURIComponent(String(domain).trim().toLowerCase()).replace(/\./g, "%2E")}${path}`;
}

// clientName: set for a client (workspace) report — the header then names the
// client and how many domains the numbers cover instead of one domain.
export function buildReportEmailHtml({ domain, frequency, label, data, clientName }) {
    const monthly = frequency === "monthly";
    const unit = monthly ? "month" : "week";
    const domainCount = data.perDomain?.length || 1;
    const scope = clientName ? `${clientName} · ${domainCount} domain${domainCount === 1 ? "" : "s"}` : domain;
    const heading = label || `Your ${unit} on ${clientName || domain}`;
    const headline = reportHeadline(data, unit);
    const prev = data.previous || {};
    const periodDays = data.periodDays || (monthly ? 30 : 7);
    const prevRange = formatRange(
        new Date(Date.parse(data.from) - periodDays * 86400000).toISOString().slice(0, 10),
        new Date(Date.parse(data.from) - 86400000).toISOString().slice(0, 10),
    );

    const kpis = [
        { label: "Active users", value: num(data.totals.engagedUsers), change: data.trends.engagedUsers, previous: num(prev.engagedUsers) },
        { label: "Sessions", value: num(data.totals.sessions), change: data.trends.sessions, previous: num(prev.sessions) },
        { label: "Statistics consent", value: fmtPct(data.totals.consentRate), change: data.trends.consentRate, points: true, previous: fmtPct(prev.consentRate) },
        { label: "Conversions", value: num(data.totals.conversions), change: data.trends.conversions, previous: num(prev.conversions) },
    ];
    if (data.revenue) {
        const symbol = data.revenue.currency === "USD" ? "$" : data.revenue.currency === "GBP" ? "£" : "€";
        kpis.push({ label: "Revenue", value: symbol + data.revenue.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), change: null, previous: `${num(data.revenue.transactions)} orders` });
    }
    const kpiRows = [];
    for (let i = 0; i < kpis.length; i += 2) kpiRows.push(`<tr>${kpiCell(kpis[i])}${kpis[i + 1] ? kpiCell(kpis[i + 1]) : '<td width="50%"></td>'}</tr>`);

    const channelTotal = (data.channels || []).reduce((s, c) => s + c.sessions, 0);
    const body = `
      <p style="margin:0;${FONT}font-size:14px;color:${C.muted}">${esc(formatRange(data.from, data.to))} · compared with ${esc(prevRange)}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
        <td bgcolor="${C.tint}" style="padding:16px 18px;border-radius:10px;border-left:4px solid ${C.bar}">
          <p style="margin:0;${FONT}font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7a5c17">What stands out</p>
          <p style="margin:6px 0 0;${FONT}font-size:18px;line-height:25px;font-weight:700;color:${C.text}">${esc(headline)}</p>
        </td>
      </tr></table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${kpiRows.join("")}</table>

      ${dailyChart(data.daily)}

      ${sectionTitle("Conversions by goal")}
      ${goalsTable(data.goals || [], unit)}

      ${domainTable(data.perDomain)}

      ${channelTotal ? sectionTitle("How visitors arrived", "sessions of visitors who accepted statistics cookies") + barList(data.channels.map((c) => ({ label: CHANNEL_LABELS[c.key] || c.key, value: c.sessions, display: `${num(c.sessions)} <span style="font-weight:400;color:${C.muted}">${Math.round((c.sessions / channelTotal) * 100)}%</span>` }))) : ""}

      ${data.topPages?.length ? sectionTitle("Top pages", "page views") + barList(data.topPages.map((p) => ({ label: p.pathname, value: p.views }))) : ""}

      ${data.topCountries?.length ? sectionTitle("Top countries", "page views") + barList(data.topCountries.map((c) => ({ label: countryName(c.code), value: c.events }))) : ""}
    `;

    return emailLayout({
        width: 600,
        brand: ANALYTICS_BRAND,
        preheader: headline,
        badge: { text: `${esc(scope)} · ${monthly ? "Monthly" : "Weekly"} report`, tone: "brand" },
        heading,
        body,
        cta: { label: clientName ? "Open Analytics" : `Open ${domain} in Analytics`, href: dashboardUrl(clientName ? null : domain) },
        note: `You get this ${monthly ? "monthly" : "every week"} as a recipient of this scheduled report. <a href="${esc(dashboardUrl(clientName ? null : domain, "/scheduled-reports"))}" style="color:#7a5c17">Change or stop it</a>.`,
    });
}

/** Subject line: scope, period and the headline's first part. */
export function reportSubject({ domain, clientName, frequency, label, data }) {
    const unit = frequency === "monthly" ? "month" : "week";
    const lead = reportHeadline(data, unit).split(":")[0];
    return `${label || `${clientName || domain}: your ${unit}`} — ${lead}`;
}

// One config's email: { html, subject }, or null when none of its sites
// resolve (e.g. a client whose domains don't have analytics installed yet).
export async function renderScheduledReport(db, cfg) {
    const { siteIds, domains } = await resolveReportSites(db, cfg);
    if (!siteIds.length) return null;
    const data = await buildReportData(db, siteIds, cfg.frequency === "monthly" ? 30 : 7);
    const clientName = cfg.workspace_id ? cfg.workspace_name || "Client" : undefined;
    const html = buildReportEmailHtml({ domain: domains[0], frequency: cfg.frequency, label: cfg.label, data, clientName });
    return { html, subject: reportSubject({ domain: domains[0], clientName, frequency: cfg.frequency, label: cfg.label, data }) };
}

export async function sendReportEmail({ recipients, subject, html }) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, reason: "RESEND_API_KEY not configured" };
    if (!recipients?.length) return { ok: false, reason: "no recipients" };
    const from = process.env.RESEND_FROM || "alerts@intastellar.com";
    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: recipients, subject, html, attachments: [ANALYTICS_LOGO_ATTACHMENT] }),
        });
        if (resp.ok) return { ok: true };
        const body = await resp.json().catch(() => ({}));
        console.error("[scheduled-report] Resend error:", resp.status, JSON.stringify(body));
        return { ok: false, reason: body?.message || body?.name || `Resend ${resp.status}` };
    } catch (err) {
        console.error("[scheduled-report] email error:", err.message);
        return { ok: false, reason: err.message };
    }
}
