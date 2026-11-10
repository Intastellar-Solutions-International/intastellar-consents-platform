import { FIRST_VISIT, NOT_FIRST_VISIT, SCAN_TYPE, ensureScanColumns } from "./_scan-schema.js";

/**
 * Figures that promote the platform, calculated nightly from every site.
 * Snapshots hold counts only, never a domain or customer name. The website
 * reads a separate frozen copy that changes only when an admin publishes.
 */

/** A percentage on fewer sites says too little to quote, and could describe a single customer. */
export const MIN_SITES = 30;
const ACTIVE_DAYS = 30;
const GDPR_API = "https://apis.intastellarsolutions.com/analytics/gdpr";
// Short enough that the rest of the snapshot still saves when this query is slow.
const CONSENT_TIMEOUT_MS = 12000;
const TRACKING = new Set(["advertising", "analytics", "fingerprinting", "social"]);
const OWN_OR_TEST = /^localhost$|^[\d.]+$|\.(test|local)$|(^|\.)intastellar[a-z]*\.|\.vercel\.app$/i;

const PUBLIC_KEYS = [
    "visitors_30d", "consent_records_30d", "sites_installed", "sites_active", "sites_scanned", "tracking_services_found", "cookies_found",
    "median_tracking_services", "us_transfer_pct", "advertising_pct", "pre_consent_pct", "pre_consent_sites",
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
    let usTransfer = 0;
    let advertising = 0;
    const perSite = scans.map((scan) => {
        const found = new Set(trackers(scan.transfers).map(serviceName));
        found.forEach((name) => services.add(name));
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

/** getInteractions as Total (consent rows, one per page load with a stored choice) and activeUsers (distinct visitors). No data comes back as zeros, which means unknown here. */
export function summarizeConsents(body) {
    return { visitors_30d: Number(body?.activeUsers) || null, consent_records_30d: Number(body?.Total) || null };
}

function serviceHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (process.env.DOMAINS_API_KEY) headers.Authorization = `Bearer ${process.env.DOMAINS_API_KEY}`;
    return headers;
}

async function fetchInstalls(fetchImpl) {
    const response = await fetchImpl(process.env.DOMAINS_API_URL || `${GDPR_API}/getDomains`, { headers: serviceHeaders() });
    if (!response.ok) throw new Error(`getDomains responded ${response.status}`);
    const body = await response.json();
    return Array.isArray(body) ? body : body?.domains ?? body?.data ?? [];
}

/** The last 30 full days across every banner, from the MySQL consent tables behind the PHP API. Organisation 1's combined view covers all sites. */
async function fetchConsents(fetchImpl, now) {
    const day = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
    const response = await fetchImpl(`${GDPR_API}/getInteractions`, {
        method: "POST",
        headers: { ...serviceHeaders(), Organisation: "1", Domains: "combined view", FromDate: day(30), ToDate: day(1) },
        body: "{}",
        signal: AbortSignal.timeout(CONSENT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`getInteractions responded ${response.status}`);
    return response.json();
}

const latestScansSql = (scanFilter) => `
    SELECT DISTINCT ON (domain) domain, transfers, cookies
      FROM pre_consent_scans
     WHERE status = 'completed' AND ${scanFilter} AND scanned_at > NOW() - INTERVAL '90 days'
     ORDER BY domain, scanned_at DESC`;

export async function calculateFigures(db, { fetchImpl = fetch, now = Date.now() } = {}) {
    await ensureScanColumns(db);
    const failedAs = (fallback, what) => (err) => {
        console.error(`[platform-stats] ${what} failed:`, err.message);
        return fallback;
    };
    const [accepted, firstVisits, installs, consents] = await Promise.all([
        db.query(latestScansSql(NOT_FIRST_VISIT)),
        db.query(latestScansSql(`${SCAN_TYPE} = '${FIRST_VISIT}'`)),
        fetchInstalls(fetchImpl).catch(failedAs([], "site list")),
        fetchConsents(fetchImpl, now).catch(failedAs(null, "consent totals")),
    ]);
    return {
        ...summarizeInstalls(installs, now),
        ...summarizeConsents(consents),
        ...summarizeScans(accepted.rows),
        ...summarizeFirstVisits(firstVisits.rows),
    };
}

/** Only known figures with enough sites behind them, so a new figure stays private until it's added here. */
export function publicFigures(figures) {
    const out = {};
    for (const key of PUBLIC_KEYS) if (figures?.[key] != null) out[key] = figures[key];
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
    tablesReady = true;
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
    return {
        latest,
        previous: earlier?.rows[0] || null,
        publishable: latest ? publicFigures(latest.figures) : null,
        published: await readPublished(db),
        min_sites: MIN_SITES,
    };
}

/** Freezes the newest snapshot as the website's copy. False when there is nothing to publish. */
export async function publishLatest(db, email) {
    const { rows } = await db.query(`SELECT day::text AS day, figures FROM platform_stats_snapshots ORDER BY day DESC LIMIT 1`);
    const figures = rows[0] ? publicFigures(rows[0].figures) : {};
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
