// Google Analytics 4 history import — aggregated numbers only (no user or
// event data), so a site switching to Intastellar Analytics keeps its
// year-over-year charts.
//
// Uses the site's existing GA4 connection (ad_platform_connections,
// platform 'google_analytics', account_id = property id). GA4's data
// retention setting only limits explorations; the standard reports the Data
// API serves go back to the property's creation, so the import walks
// backwards in chunks of CHUNK_MONTHS whole calendar months (so a month's
// top pages are never split over two calls). Starting, one small request
// finds the first and last day the property has data — a site that dropped
// GA4 months ago has empty recent months, which mustn't end the import. One chunk per call keeps each request well
// inside the function time limit; the dashboard calls again until done.
//
// Stored in analytics_imported: per day totals, channels, devices and
// countries; per month the top pages.

export const SOURCE = "ga4";
export const CHUNK_MONTHS = 3;
export const GA4_EARLIEST = "2015-08-14";
const PAGE_LIMIT = 500;
const LEASE_SECONDS = 120;
const API = "https://analyticsdata.googleapis.com/v1beta";

const METRICS = ["sessions", "totalUsers", "screenPageViews", "engagedSessions", "keyEvents", "totalRevenue"];
// report → GA4 dimensions after the date
export const DAILY_REPORTS = {
    total:   [],
    channel: ["sessionDefaultChannelGroup"],
    device:  ["deviceCategory"],
    country: ["countryId"],
};

export async function ensureImportTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_imported (
            site_id          VARCHAR(32) NOT NULL,
            organisation_id  INTEGER     NOT NULL,
            source           VARCHAR(16) NOT NULL,
            report           VARCHAR(16) NOT NULL,   -- total | channel | device | country (per day), page (per month)
            day              DATE        NOT NULL,   -- first of the month for 'page'
            dim              TEXT        NOT NULL DEFAULT '',
            sessions         INTEGER,
            users            INTEGER,
            pageviews        INTEGER,
            engaged_sessions INTEGER,
            key_events       NUMERIC,
            revenue          NUMERIC,
            PRIMARY KEY (site_id, source, report, day, dim)
        );
        CREATE TABLE IF NOT EXISTS analytics_imports (
            site_id          VARCHAR(32) NOT NULL,
            source           VARCHAR(16) NOT NULL,
            organisation_id  INTEGER     NOT NULL,
            property_id      TEXT,
            status           VARCHAR(12) NOT NULL DEFAULT 'running',  -- running | done | error
            cursor_day       DATE,        -- next chunk ends here (walking backwards)
            first_day        DATE,        -- the property's first day with data (import ends there)
            oldest_day       DATE,        -- oldest day with data so far
            newest_day       DATE,
            tracking_start   DATE,        -- first day of Intastellar's own data
            rows_imported    INTEGER     NOT NULL DEFAULT 0,
            error            TEXT,
            lease_until      TIMESTAMPTZ,
            started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (site_id, source)
        );
    `);
}

const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (day, n) => iso(new Date(Date.parse(day) + n * 864e5));

/** GA4 "20261105" / "202611" → "2026-11-05" / "2026-11-01". */
export function gaDate(raw) {
    const v = String(raw || "");
    if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    if (/^\d{6}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-01`;
    return null;
}

/** A runReport response → rows for analytics_imported. */
export function parseReport(report, body) {
    const out = [];
    for (const row of body?.rows || []) {
        const day = gaDate(row.dimensionValues?.[0]?.value);
        if (!day) continue;
        const m = (i) => Number(row.metricValues?.[i]?.value || 0);
        out.push({
            report, day,
            dim: String(row.dimensionValues?.[1]?.value ?? "").slice(0, 500),
            sessions: Math.round(m(0)), users: Math.round(m(1)), pageviews: Math.round(m(2)),
            engaged_sessions: Math.round(m(3)), key_events: m(4), revenue: m(5),
        });
    }
    return out;
}

/** Calendar months overlapping [from, to] → [{ start, end }] clipped to the range. */
export function monthsBetween(from, to) {
    const out = [];
    let cur = `${from.slice(0, 7)}-01`;
    while (cur <= to) {
        const next = iso(new Date(Date.UTC(+cur.slice(0, 4), +cur.slice(5, 7), 1)));
        out.push({ start: cur < from ? from : cur, end: addDays(next, -1) > to ? to : addDays(next, -1) });
        cur = next;
    }
    return out;
}

async function runReport(conn, body, fetchImpl) {
    const res = await fetchImpl(`${API}/properties/${encodeURIComponent(conn.account_id)}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* reported below */ }
    if (!res.ok) throw new Error(json?.error?.message || `GA4 API error (${res.status})`);
    return json || {};
}

/** First and last day the property has data → { first, last } or null. */
export async function dataSpan(conn, to, { fetchImpl = globalThis.fetch } = {}) {
    const body = await runReport(conn, {
        dateRanges: [{ startDate: GA4_EARLIEST, endDate: to }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
        limit: 100000,
    }, fetchImpl);
    const days = parseReport("total", body).filter((r) => r.sessions + r.pageviews > 0).map((r) => r.day).sort();
    return days.length ? { first: days[0], last: days.at(-1) } : null;
}

/** All rows of one GA4 chunk [from, to] (paged, 100k rows per request). */
export async function fetchChunk(conn, from, to, { fetchImpl = globalThis.fetch } = {}) {
    const metrics = METRICS.map((name) => ({ name }));
    const rows = [];
    for (const [report, extra] of Object.entries(DAILY_REPORTS)) {
        for (let offset = 0; ; offset += 100000) {
            const body = await runReport(conn, {
                dateRanges: [{ startDate: from, endDate: to }],
                dimensions: [{ name: "date" }, ...extra.map((name) => ({ name }))],
                metrics, limit: 100000, offset, keepEmptyRows: false,
            }, fetchImpl);
            rows.push(...parseReport(report, body));
            if (offset + 100000 >= Number(body.rowCount || 0)) break;
        }
    }
    for (const month of monthsBetween(from, to)) {
        const body = await runReport(conn, {
            dateRanges: [{ startDate: month.start, endDate: month.end }],
            dimensions: [{ name: "yearMonth" }, { name: "pagePath" }],
            metrics, limit: PAGE_LIMIT,
            orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        }, fetchImpl);
        rows.push(...parseReport("page", body));
    }
    return rows;
}

/** First day of the chunk ending on `to`: the 1st of the month CHUNK_MONTHS - 1 months earlier. */
export function chunkStart(to, months = CHUNK_MONTHS) {
    const start = iso(new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - months, 1)));
    return start < GA4_EARLIEST ? GA4_EARLIEST : start;
}

// Chunks cover whole months and never overlap, so a re-import simply overwrites.
async function saveRows(db, site, rows) {
    for (let i = 0; i < rows.length; i += 1000) {
        const batch = rows.slice(i, i + 1000);
        const col = (k) => batch.map((r) => r[k]);
        await db.query(
            `INSERT INTO analytics_imported (site_id, organisation_id, source, report, day, dim, sessions, users, pageviews, engaged_sessions, key_events, revenue)
             SELECT $1, $2, $3, * FROM UNNEST($4::text[], $5::date[], $6::text[], $7::int[], $8::int[], $9::int[], $10::int[], $11::numeric[], $12::numeric[])
             ON CONFLICT (site_id, source, report, day, dim) DO UPDATE SET
               sessions = EXCLUDED.sessions, users = EXCLUDED.users, pageviews = EXCLUDED.pageviews,
               engaged_sessions = EXCLUDED.engaged_sessions, key_events = EXCLUDED.key_events, revenue = EXCLUDED.revenue`,
            [site.id, site.organisationId, SOURCE, col("report"), col("day"), col("dim"), col("sessions"), col("users"),
             col("pageviews"), col("engaged_sessions"), col("key_events"), col("revenue")],
        );
    }
}

/** The import's state for the dashboard. */
export function importView(row) {
    if (!row) return null;
    const d = (v) => (v ? (v instanceof Date ? iso(v) : String(v).slice(0, 10)) : null);
    return {
        status: row.status, oldest: d(row.oldest_day), newest: d(row.newest_day), cursor: d(row.cursor_day), firstDay: d(row.first_day),
        trackingStart: d(row.tracking_start), rows: Number(row.rows_imported || 0), error: row.error || null,
        updatedAt: row.updated_at,
    };
}

/**
 * Starts (restart = true) or continues the import by one chunk.
 * site: { id, organisationId, domain }; conn: refreshed GA4 connection.
 * → importView of the state afterwards, or { busy: true } when another
 *   call holds the lease.
 */
export async function importStep(db, site, conn, { restart = false, today = iso(new Date()), fetchImpl } = {}) {
    await ensureImportTables(db);
    const yesterday = addDays(today, -1);
    if (restart) {
        let span;
        try {
            span = await dataSpan(conn, yesterday, { fetchImpl });
        } catch (err) {
            return { status: "error", error: String(err.message || err).slice(0, 500), rows: 0 };
        }
        if (!span) return { status: "empty", rows: 0 };
        const { rows: first } = await db.query(
            "SELECT TO_CHAR(MIN(received_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM analytics_events WHERE site_id = $1",
            [site.id],
        );
        await db.query(
            `INSERT INTO analytics_imports (site_id, source, organisation_id, property_id, status, cursor_day, first_day, tracking_start, rows_imported, error, lease_until, started_at, updated_at, oldest_day, newest_day)
             VALUES ($1, $2, $3, $4, 'running', $5, $7, $6, 0, NULL, NULL, NOW(), NOW(), NULL, NULL)
             ON CONFLICT (site_id, source) DO UPDATE SET organisation_id = EXCLUDED.organisation_id, property_id = EXCLUDED.property_id,
               status = 'running', cursor_day = EXCLUDED.cursor_day, first_day = EXCLUDED.first_day, tracking_start = EXCLUDED.tracking_start, rows_imported = 0,
               error = NULL, lease_until = NULL, started_at = NOW(), updated_at = NOW(), oldest_day = NULL, newest_day = NULL`,
            [site.id, SOURCE, site.organisationId, conn.account_id, span.last, first[0]?.d || null, span.first],
        );
    }
    // Lease: one chunk at a time per site, even with two tabs open.
    const { rows: leased } = await db.query(
        `UPDATE analytics_imports SET lease_until = NOW() + make_interval(secs => $3)
          WHERE site_id = $1 AND source = $2 AND status = 'running' AND (lease_until IS NULL OR lease_until < NOW())
          RETURNING *`,
        [site.id, SOURCE, LEASE_SECONDS],
    );
    if (!leased.length) {
        const { rows } = await db.query("SELECT * FROM analytics_imports WHERE site_id = $1 AND source = $2", [site.id, SOURCE]);
        return rows[0]?.status === "running" ? { ...importView(rows[0]), busy: true } : importView(rows[0]);
    }
    const state = leased[0];
    const to = importView(state).cursor;
    const from = chunkStart(to);
    try {
        const rows = await fetchChunk(conn, from, to, { fetchImpl });
        if (rows.length) await saveRows(db, site, rows);
        const days = rows.filter((r) => r.report === "total" && r.sessions + r.pageviews > 0).map((r) => r.day).sort();
        const done = from <= (importView(state).firstDay || GA4_EARLIEST);
        const { rows: after } = await db.query(
            `UPDATE analytics_imports SET
               status = $3, cursor_day = $4, rows_imported = rows_imported + $5, lease_until = NULL, updated_at = NOW(),
               oldest_day = COALESCE(LEAST(oldest_day, $6::date), $6::date),
               newest_day = COALESCE(GREATEST(newest_day, $7::date), $7::date)
             WHERE site_id = $1 AND source = $2 RETURNING *`,
            [site.id, SOURCE, done ? "done" : "running", addDays(from, -1), rows.length, days[0] || null, days.at(-1) || null],
        );
        return importView(after[0]);
    } catch (err) {
        const { rows: after } = await db.query(
            `UPDATE analytics_imports SET status = 'error', error = $3, lease_until = NULL, updated_at = NOW()
              WHERE site_id = $1 AND source = $2 RETURNING *`,
            [site.id, SOURCE, String(err.message || err).slice(0, 500)],
        );
        return importView(after[0]);
    }
}

/**
 * Imported numbers for a report period: daily totals for the days before
 * Intastellar's own data starts; channel / page / country / device tables
 * only when the whole period lies before it (mixing GA4's and our own
 * definitions in one table would mislead). → null when nothing applies.
 */
export async function importedHistory(db, siteId, from, to) {
    let state;
    try {
        ({ rows: [state] } = await db.query("SELECT * FROM analytics_imports WHERE site_id = $1 AND source = $2", [siteId, SOURCE]));
    } catch {
        return null; // tables not created yet
    }
    const view = importView(state);
    if (!view?.oldest) return null;
    const cutoff = view.trackingStart ? addDays(view.trackingStart, -1) : to;
    const end = cutoff < to ? cutoff : to;
    if (end < from) return null;

    const { rows: daily } = await db.query(
        `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS date, sessions, users, pageviews, engaged_sessions, key_events, revenue
           FROM analytics_imported WHERE site_id = $1 AND source = $2 AND report = 'total' AND day BETWEEN $3 AND $4 ORDER BY day`,
        [siteId, SOURCE, from, end],
    );
    if (!daily.length) return null;
    const sum = (k) => daily.reduce((s, r) => s + Number(r[k] || 0), 0);
    const history = {
        source: SOURCE, trackingStart: view.trackingStart, from, to: end,
        wholePeriod: end === to,
        totals: { sessions: sum("sessions"), users: sum("users"), pageviews: sum("pageviews"), engagedSessions: sum("engaged_sessions"), keyEvents: sum("key_events"), revenue: sum("revenue") },
        daily: daily.map((r) => ({ date: r.date, sessions: r.sessions, users: r.users, pageviews: r.pageviews })),
    };
    if (history.wholePeriod) {
        const table = async (report, limit) => (await db.query(
            `SELECT dim, SUM(sessions)::int AS sessions, SUM(users)::int AS users, SUM(pageviews)::int AS pageviews
               FROM analytics_imported WHERE site_id = $1 AND source = $2 AND report = $3 AND day BETWEEN $4 AND $5
              GROUP BY dim ORDER BY ${report === "page" ? "pageviews" : "sessions"} DESC LIMIT ${limit}`,
            // Pages are stored per month: include the month the period starts in.
            [siteId, SOURCE, report, report === "page" ? `${from.slice(0, 7)}-01` : from, end],
        )).rows;
        [history.channels, history.devices, history.countries, history.pages] = await Promise.all([
            table("channel", 20), table("device", 10), table("country", 20), table("page", 20),
        ]);
        history.pagesByMonth = true;
    }
    return history;
}
