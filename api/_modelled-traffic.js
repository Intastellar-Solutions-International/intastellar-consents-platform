// Modelled traffic — how many sessions a site really had, including the
// visitors who declined statistics consent.
//
// What we know for certain: every page view is counted (consenting visits as
// "full" rows, declining ones as anonymous "minimal" rows: path, referrer
// host, device, country — no visitor or session id). What we can't count is
// sessions of declining visitors, because nothing links their page views.
//
// Method (stratified inverse-probability weighting), deliberately simple
// enough to explain in the interface:
//   1. Group page views by day × referrer type (none / search / social /
//      other) × device — the fields both kinds of row have.
//   2. Consent rate of a group = consenting page views ÷ all page views.
//   3. Each consenting session counts as 1 ÷ the rate of the group of its
//      first page view. Groups under MIN_VIEWS page views use the day's rate,
//      then the site's rate, so one odd hour can't produce wild numbers.
// Assumption (stated in the UI): within a group, people who decline view
// about as many pages per visit as people who accept.
//
// Channels add up exactly to the modelled total; pages use their own counted
// ratio (all views ÷ consenting views of that page).

export const MODEL_METHOD = "stratified-v1";
const MIN_VIEWS = 20;
// A group where 2 % accepted would weigh each consenting session 50× — cap
// the weight so a handful of sessions can't dominate.
const MIN_RATE = 0.05;

/**
 * strata:   [{ day, grp, device, full, all }]   page views per group
 * sessions: [{ day, grp, device, channel, sessions }]  consenting sessions by
 *           the group and channel of their first page view
 * → null without consenting traffic, else
 *   { sessions, observedSessions, siteRate, coverage, channels: {ch: {observed, modelled}}, daily: {day: modelled} }
 */
export function modelSessions(strata, sessions, { minViews = MIN_VIEWS, minRate = MIN_RATE } = {}) {
    const levels = [new Map(), new Map(), new Map()]; // day|grp|device, day|grp, day
    let full = 0, all = 0, coveredViews = 0;
    const add = (map, key, f, a) => {
        const cur = map.get(key) || { full: 0, all: 0 };
        cur.full += f; cur.all += a;
        map.set(key, cur);
    };
    for (const s of strata || []) {
        const f = Number(s.full || 0), a = Number(s.all || 0);
        add(levels[0], `${s.day}|${s.grp}|${s.device}`, f, a);
        add(levels[1], `${s.day}|${s.grp}`, f, a);
        add(levels[2], `${s.day}`, f, a);
        full += f; all += a;
        if (f > 0) coveredViews += a;
    }
    if (!full || !all) return null;
    const siteRate = full / all;

    const rateFor = (day, grp, device) => {
        for (const [map, key] of [[levels[0], `${day}|${grp}|${device}`], [levels[1], `${day}|${grp}`], [levels[2], `${day}`]]) {
            const g = map.get(key);
            if (g && g.all >= minViews && g.full > 0) return Math.max(g.full / g.all, minRate);
        }
        return Math.max(siteRate, minRate);
    };

    const channels = {};
    const daily = {};
    let observed = 0, modelled = 0;
    for (const s of sessions || []) {
        const n = Number(s.sessions || 0);
        if (!n) continue;
        const weighted = n / rateFor(s.day, s.grp, s.device);
        const ch = channels[s.channel] || (channels[s.channel] = { observed: 0, modelled: 0 });
        ch.observed += n;
        ch.modelled += weighted;
        daily[s.day] = (daily[s.day] || 0) + weighted;
        observed += n;
        modelled += weighted;
    }
    for (const ch of Object.values(channels)) ch.modelled = Math.round(ch.modelled);
    for (const day of Object.keys(daily)) daily[day] = Math.round(daily[day]);
    return {
        method: MODEL_METHOD,
        sessions: Math.round(modelled),
        observedSessions: observed,
        siteRate,
        // Share of page views in groups with at least one consenting view —
        // the rest belong to groups nobody accepted in, so no session can
        // stand in for them.
        coverage: coveredViews / all,
        channels,
        daily,
    };
}

/**
 * One page: { allViews, fullViews, fullSessions } → modelled sessions, or
 * null when no consenting visitor saw the page (nothing to scale).
 */
export function modelPageSessions({ allViews, fullViews, fullSessions }, siteRate, { minViews = MIN_VIEWS, minRate = MIN_RATE } = {}) {
    const sessions = Number(fullSessions || 0);
    const views = Number(allViews || 0), consenting = Number(fullViews || 0);
    if (!sessions || !consenting) return null;
    const rate = views >= minViews ? consenting / views : siteRate;
    return Math.round(sessions / Math.max(rate || 0, minRate));
}

/**
 * The SQL for the referrer type both consenting and anonymous rows share.
 * `selfReferral` / `noiseReferral` are the report's existing clauses.
 */
export function referrerGroupSql(selfReferral, noiseReferral) {
    return `CASE
        WHEN COALESCE(referrer_host, '') = '' OR ${selfReferral} OR ${noiseReferral} THEN 'none'
        WHEN referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\\.' THEN 'search'
        WHEN referrer_host ~* '(facebook|instagram|linkedin|lnkd\\.in|(^|\\.)t\\.co$|twitter|(^|\\.)x\\.com$|tiktok|pinterest|reddit|youtube|threads)' THEN 'social'
        ELSE 'other' END`;
}

const DAY_SQL = "TO_CHAR(DATE_TRUNC('day', received_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')";

/**
 * Runs the two grouping queries and models the site's sessions.
 * `filter` is the report's row filter ("AND …", no user text); `channelSql`
 * the report's CASE for a row's channel; `pathnames` the top pages to model.
 * → { ...modelSessions(), pages: { [pathname]: modelled } } or null.
 */
export async function modelSiteTraffic(db, { siteId, from, toExclusive, filter, groupSql, channelSql, pathnames = [] }) {
    const params = [siteId, from, toExclusive];
    const [strataRes, sessionsRes, pagesRes] = await Promise.all([
        db.query(`
            SELECT ${DAY_SQL} AS day, ${groupSql} AS grp, COALESCE(device_type, 'other') AS device,
                   COUNT(*) FILTER (WHERE consent_level = 'full') AS full, COUNT(*) AS all
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${filter}
            GROUP BY 1, 2, 3`, params),
        db.query(`
            SELECT day, grp, device, channel, COUNT(*) AS sessions FROM (
                SELECT DISTINCT ON (session_id)
                       ${DAY_SQL} AS day, ${groupSql} AS grp, COALESCE(device_type, 'other') AS device,
                       ${channelSql} AS channel
                FROM analytics_events
                WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${filter}
                  AND consent_level = 'full' AND session_id IS NOT NULL
                ORDER BY session_id, received_at
            ) landing
            GROUP BY 1, 2, 3, 4`, params),
        pathnames.length
            ? db.query(`
                SELECT pathname, COUNT(*) AS all_views,
                       COUNT(*) FILTER (WHERE consent_level = 'full') AS full_views,
                       COUNT(DISTINCT session_id) FILTER (WHERE consent_level = 'full') AS full_sessions
                FROM analytics_events
                WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${filter}
                  AND pathname = ANY($4)
                GROUP BY pathname`, [...params, pathnames])
            : { rows: [] },
    ]);
    const model = modelSessions(strataRes.rows, sessionsRes.rows);
    if (!model) return null;
    const pages = {};
    for (const r of pagesRes.rows) {
        pages[r.pathname] = modelPageSessions({ allViews: r.all_views, fullViews: r.full_views, fullSessions: r.full_sessions }, model.siteRate);
    }
    return { ...model, pages };
}
