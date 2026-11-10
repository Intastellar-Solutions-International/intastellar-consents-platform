import { FIRST_VISIT, NOT_FIRST_VISIT, SCAN_TYPE, ensureScanColumns } from "./_scan-schema.js";

/**
 * Figures that promote the platform, calculated nightly from every site.
 * Snapshots hold counts only, never a domain or customer name. The website
 * reads a separate frozen copy that changes only when an admin publishes.
 */

/** A percentage on fewer sites says too little to quote, and could describe a single customer. */
export const MIN_SITES = 30;
export const MIN_RECORDS = 1000;
const TOP_TRACKERS = 10;
/** Kept off the website until an admin switches them on. */
const DEFAULT_HIDDEN = ["decline_all_pct"];
/** Figures the admin page draws over time. */
export const TREND_KEYS = ["visitors_30d", "consent_records_30d", "countries_30d", "sites_installed", "sites_active", "sites_scanned"];
const HISTORY_DAYS = 365;
const ACTIVE_DAYS = 30;
const GDPR_API = "https://apis.intastellarsolutions.com/analytics/gdpr";
// Inside the 60 second function limit in vercel.json, so the rest of the snapshot still saves when this query is slow.
const CONSENT_TIMEOUT_MS = 50000;
const TRACKING = new Set(["advertising", "analytics", "fingerprinting", "social"]);
const OWN_OR_TEST = /^localhost$|^[\d.]+$|\.(test|local)$|(^|\.)intastellar[a-z]*\.|\.vercel\.app$/i;

const PUBLIC_KEYS = [
    "visitors_30d", "consent_records_30d", "accept_all_pct", "custom_choice_pct", "decline_all_pct", "mobile_pct", "countries_30d", "sites_installed", "sites_active", "sites_scanned", "tracking_services_found", "cookies_found",
    "median_tracking_services", "us_transfer_pct", "advertising_pct", "pre_consent_pct", "pre_consent_sites",
    "top_trackers", "eu_accept_pct", "non_eu_accept_pct",
];

const list = (value) => (Array.isArray(value) ? value : []);
const countable = (domain) => Boolean(domain) && !OWN_OR_TEST.test(domain);
const percent = (part, whole) => (whole >= MIN_SITES ? Math.round((part / whole) * 100) : null);
const trackers = (transfers) => list(transfers).filter((t) => TRACKING.has(t?.category));
const serviceName = (t) => t.service || t.host;

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Latest accept-all scan per domain. A scan that found nothing was usually blocked, so it isn't counted. */
export function summarizeScans(rows) {
    const scans = list(rows).filter((r) => countable(r.domain) && (list(r.transfers).length || list(r.cookies).length));
    const services = new Set();
    const cookies = new Set();
    const sitesPerService = new Map();
    let usTransfer = 0;
    let advertising = 0;
    const perSite = scans.map((scan) => {
        const found = new Set(trackers(scan.transfers).map(serviceName));
        found.forEach((name) => services.add(name));
        // Named services only: an unrecognised host could be a customer's own subdomain.
        new Set(trackers(scan.transfers).map((t) => t.service).filter(Boolean))
            .forEach((name) => sitesPerService.set(name, (sitesPerService.get(name) || 0) + 1));
        list(scan.cookies).forEach((c) => c?.name && cookies.add(c.name));
        if (list(scan.transfers).some((t) => t?.dataCountry === "US" && t.category !== "cmp")) usTransfer += 1;
        if (trackers(scan.transfers).some((t) => t.category === "advertising")) advertising += 1;
        return found.size;
    });
    return {
        sites_scanned: scans.length,
        tracking_services_found: services.size,
        cookies_found: cookies.size,
        median_tracking_services: median(perSite),
        us_transfer_pct: percent(usTransfer, scans.length),
        advertising_pct: percent(advertising, scans.length),
        top_trackers: scans.length >= MIN_SITES
            ? [...sitesPerService].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_TRACKERS)
                .map(([name, sites]) => ({ name, pct: percent(sites, scans.length) }))
            : null,
    };
}

/** Latest first-visit scan per domain. These never accept, so every tracker in them loaded before consent. */
export function summarizeFirstVisits(rows) {
    const scans = list(rows).filter((r) => countable(r.domain) && (list(r.transfers).length || list(r.cookies).length));
    const withTrackers = scans.filter((scan) => trackers(scan.transfers).length > 0).length;
    return { pre_consent_sites: scans.length, pre_consent_pct: percent(withTrackers, scans.length) };
}

function parseSiteDate(value) {
    const match = /^(\d{2})\. (\d{2}) (\d{4})$/.exec(String(value ?? "").trim());
    return match && Number(match[3]) >= 2000 ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
}

/** getDomains can repeat a domain, newest row first. An empty list means the call failed, not that there are no sites. */
export function summarizeInstalls(entries, now = Date.now()) {
    const sites = new Map();
    for (const entry of list(entries)) {
        const domain = String((typeof entry === "string" ? entry : entry?.domain) || "").trim().toLowerCase();
        if (countable(domain) && !sites.has(domain)) sites.set(domain, parseSiteDate(entry?.lastedVisited));
    }
    if (!sites.size) return { sites_installed: null, sites_active: null };
    const dates = [...sites.values()].filter((d) => d != null);
    return {
        sites_installed: sites.size,
        sites_active: dates.length ? dates.filter((d) => now - d <= ACTIVE_DAYS * 86400000).length : null,
    };
}

/**
 * getInteractions as Total (consent rows, one per page load with a stored choice) and activeUsers
 * (distinct visitors). No data comes back as zeros, which means unknown here. Shares are of rows,
 * so a returning visitor counts more than once.
 */
export function summarizeConsents(body) {
    const records = Number(body?.Total) || null;
    const counts = body?.interactions_number;
    const share = (part, whole) => (part != null && whole >= MIN_RECORDS ? Math.round((Number(part) / whole) * 100) : null);
    const devices = body?.device_type;
    const knownDevices = (Number(devices?.mobile) || 0) + (Number(devices?.tablet) || 0) + (Number(devices?.desktop) || 0);
    const countries = list(body?.countryBreakdown).filter((c) => c?.num?.total > 0 && !["Unknown", "EU"].includes(c.country)).length;
    // euUsers and noneEUUsers count records, like Total; the rates are already percentages of them.
    const euRecords = Number(body?.euUsers) || null;
    const nonEuRecords = Number(body?.noneEUUsers) || null;
    const rate = (value, sample) => (sample >= MIN_RECORDS && Number.isFinite(Number(value)) && value !== null ? Math.round(Number(value)) : null);
    return {
        eu_records_30d: euRecords,
        non_eu_records_30d: nonEuRecords,
        eu_accept_pct: rate(body?.euAcceptedRate, euRecords),
        non_eu_accept_pct: rate(body?.noneEUAcceptedRate, nonEuRecords),
        visitors_30d: Number(body?.activeUsers) || null,
        consent_records_30d: records,
        accept_all_pct: share(counts?.accept, records),
        custom_choice_pct: share(counts?.partial, records),
        decline_all_pct: share(counts?.decline, records),
        mobile_pct: share(devices?.mobile, knownDevices),
        countries_30d: countries || null,
    };
}

/** An admin's own token when one is making the request, as the dashboard sends it. The nightly job only has the service key. */
function apiHeaders(authorization) {
    const headers = { "Content-Type": "application/json", Organisation: "1" };
    const token = authorization || (process.env.DOMAINS_API_KEY && `Bearer ${process.env.DOMAINS_API_KEY}`);
    if (token) headers.Authorization = token;
    return headers;
}

const unexpected = (name, body) => new Error(`${name} returned ${JSON.stringify(body)?.slice(0, 80)}`);

/** The API answers a refused login with 200 and a string such as "Err_Login_Expired", so the body has to be checked too. */
async function fetchInstalls(fetchImpl, authorization) {
    const response = await fetchImpl(process.env.DOMAINS_API_URL || `${GDPR_API}/getDomains`, { headers: apiHeaders(authorization) });
    if (!response.ok) throw new Error(`getDomains responded ${response.status}`);
    const body = await response.json();
    const sites = Array.isArray(body) ? body : body?.domains ?? body?.data;
    if (!Array.isArray(sites) || !sites.length) throw unexpected("getDomains", body);
    return sites;
}

/** The last 30 full days across every banner, from the MySQL consent tables behind the PHP API. Organisation 1's combined view covers all sites. */
async function fetchConsents(fetchImpl, authorization, now) {
    const day = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
    const response = await fetchImpl(`${GDPR_API}/getInteractions`, {
        method: "POST",
        // Nothing here uses the comparison period, so it's kept to one day instead of the default 30.
        headers: { ...apiHeaders(authorization), Domains: "combined view", FromDate: day(30), ToDate: day(1), "X-Compare-Start": day(31), "X-Compare-End": day(31) },
        body: "{}",
        signal: AbortSignal.timeout(CONSENT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`getInteractions responded ${response.status}`);
    const body = await response.json();
    if (body?.Total === undefined) throw unexpected("getInteractions", body);
    return body;
}

const latestScansSql = (scanFilter) => `
    SELECT DISTINCT ON (domain) domain, transfers, cookies
      FROM pre_consent_scans
     WHERE status = 'completed' AND ${scanFilter} AND scanned_at > NOW() - INTERVAL '90 days'
     ORDER BY domain, scanned_at DESC`;

/** A source that failed keeps its last known figures, and source_errors says why. `authorization` is the signed-in admin's header, if any. */
export async function calculateFigures(db, { fetchImpl = fetch, now = Date.now(), authorization } = {}) {
    await ensureScanColumns(db);
    const errors = [];
    const failedAs = (fallback) => (err) => {
        console.error("[platform-stats]", err.message);
        errors.push(err.message);
        return fallback;
    };
    const [accepted, firstVisits, installs, consents, earlier] = await Promise.all([
        db.query(latestScansSql(NOT_FIRST_VISIT)),
        db.query(latestScansSql(`${SCAN_TYPE} = '${FIRST_VISIT}'`)),
        fetchInstalls(fetchImpl, authorization).catch(failedAs(null)),
        fetchConsents(fetchImpl, authorization, now).catch(failedAs(null)),
        db.query(`SELECT figures FROM platform_stats_snapshots ORDER BY day DESC LIMIT 1`),
    ]);
    const known = (keys, failed, fresh) => {
        if (!failed) return fresh;
        return Object.fromEntries(keys.map((key) => [key, earlier.rows[0]?.figures?.[key] ?? fresh[key]]));
    };
    const installFigures = summarizeInstalls(installs, now);
    const consentFigures = summarizeConsents(consents);
    return {
        ...known(Object.keys(installFigures), installs === null, installFigures),
        ...known(Object.keys(consentFigures), consents === null, consentFigures),
        ...summarizeScans(accepted.rows),
        ...summarizeFirstVisits(firstVisits.rows),
        source_errors: errors,
    };
}

/** Only known figures with enough sites behind them and not switched off, so a new figure stays private until it's added here. */
export function publicFigures(figures, hidden = []) {
    const out = {};
    for (const key of PUBLIC_KEYS) if (figures?.[key] != null && !hidden.includes(key)) out[key] = figures[key];
    if (out.pre_consent_pct == null) delete out.pre_consent_sites;
    return out;
}

let tablesReady = false;
export async function ensureStatsTables(db) {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS platform_stats_snapshots (
            day         DATE        PRIMARY KEY,
            figures     JSONB       NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS platform_stats_published (
            id           SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            as_of        DATE        NOT NULL,
            figures      JSONB       NOT NULL,
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            published_by TEXT
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS platform_stats_settings (
            id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            hidden_keys JSONB    NOT NULL
        )
    `);
    tablesReady = true;
}

async function readHidden(db) {
    const { rows } = await db.query(`SELECT hidden_keys FROM platform_stats_settings WHERE id = 1`);
    return rows[0]?.hidden_keys ?? DEFAULT_HIDDEN;
}

/** Switches one figure on or off for the website. False for a key that can't be published. */
export async function setVisibility(db, key, visible) {
    if (!PUBLIC_KEYS.includes(key) || key === "pre_consent_sites" || typeof visible !== "boolean") return false;
    const hidden = new Set(await readHidden(db));
    if (visible) hidden.delete(key);
    else hidden.add(key);
    await db.query(
        `INSERT INTO platform_stats_settings (id, hidden_keys) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET hidden_keys = EXCLUDED.hidden_keys`,
        [JSON.stringify([...hidden])]
    );
    return true;
}

export async function saveSnapshot(db, figures, now = Date.now()) {
    await db.query(
        `INSERT INTO platform_stats_snapshots (day, figures) VALUES ($1, $2)
         ON CONFLICT (day) DO UPDATE SET figures = EXCLUDED.figures, computed_at = NOW()`,
        [new Date(now).toISOString().slice(0, 10), JSON.stringify(figures)]
    );
}

export async function readPublished(db) {
    const { rows } = await db.query(`SELECT as_of::text AS as_of, figures, published_at FROM platform_stats_published WHERE id = 1`);
    return rows[0] || null;
}

/** What the admin page shows: the newest snapshot, the one a month before it, and what is live. */
export async function adminView(db) {
    const { rows } = await db.query(`SELECT day::text AS day, figures, computed_at FROM platform_stats_snapshots ORDER BY day DESC LIMIT 1`);
    const latest = rows[0] || null;
    const earlier = latest && await db.query(
        `SELECT day::text AS day, figures FROM platform_stats_snapshots WHERE day <= $1::date - 30 ORDER BY day DESC LIMIT 1`,
        [latest.day]
    );
    const hidden = await readHidden(db);
    const history = await db.query(
        `SELECT day::text AS day, figures FROM platform_stats_snapshots WHERE day > CURRENT_DATE - ${HISTORY_DAYS} ORDER BY day`
    );
    return {
        latest,
        previous: earlier?.rows[0] || null,
        history: history.rows.map((row) => ({ day: row.day, ...Object.fromEntries(TREND_KEYS.map((key) => [key, row.figures?.[key] ?? null])) })),
        hidden,
        publishable: latest ? publicFigures(latest.figures, hidden) : null,
        published: await readPublished(db),
        min_sites: MIN_SITES,
        min_records: MIN_RECORDS,
    };
}

/** Freezes the newest snapshot as the website's copy. False when there is nothing to publish. */
export async function publishLatest(db, email) {
    const { rows } = await db.query(`SELECT day::text AS day, figures FROM platform_stats_snapshots ORDER BY day DESC LIMIT 1`);
    const figures = rows[0] ? publicFigures(rows[0].figures, await readHidden(db)) : {};
    if (!Object.keys(figures).length) return false;
    await db.query(
        `INSERT INTO platform_stats_published (id, as_of, figures, published_at, published_by) VALUES (1, $1, $2, NOW(), $3)
         ON CONFLICT (id) DO UPDATE SET as_of = EXCLUDED.as_of, figures = EXCLUDED.figures, published_at = NOW(), published_by = EXCLUDED.published_by`,
        [rows[0].day, JSON.stringify(figures), email]
    );
    return true;
}

export async function unpublish(db) {
    await db.query(`DELETE FROM platform_stats_published WHERE id = 1`);
}
