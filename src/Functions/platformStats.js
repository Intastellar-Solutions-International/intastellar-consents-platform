/**
 * Figures for the admin Platform page, from getTotalNumber and getDomains.
 */
const DAY_MS = 86400000;
const QUIET_AFTER_DAYS = 7;
const INACTIVE_AFTER_DAYS = 30;

/** getDomains sends dates as "09. 11 2026". A missing database date comes back as 1970. */
export function parseSiteDate(value) {
    const match = /^(\d{2})\. (\d{2}) (\d{4})$/.exec(String(value ?? "").trim());
    if (!match || Number(match[3]) < 2000) return null;
    const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    return Number.isNaN(date.getTime()) ? null : date;
}

export function siteStatus(lastSeen, now = Date.now()) {
    if (!lastSeen) return "unknown";
    const days = (now - lastSeen.getTime()) / DAY_MS;
    return days <= QUIET_AFTER_DAYS ? "active" : days <= INACTIVE_AFTER_DAYS ? "quiet" : "inactive";
}

/** One row per domain; getDomains lists newest rows first, so the first one wins. */
export function toSites(rows, now = Date.now()) {
    const seen = new Set();
    const sites = [];
    for (const row of Array.isArray(rows) ? rows : []) {
        if (!row?.domain || seen.has(row.domain)) continue;
        seen.add(row.domain);
        const installed = parseSiteDate(row.installed);
        const lastSeen = parseSiteDate(row.lastedVisited);
        sites.push({ domain: row.domain, company: row.companyName || "", installed, lastSeen, status: siteStatus(lastSeen, now) });
    }
    return sites;
}

/** JavaScript and WordPress as sent, and whatever is left as Unknown. */
export function platformShares(stats) {
    const javascript = Number(stats?.JS) || 0;
    const wordpress = Number(stats?.WP) || 0;
    return { javascript, wordpress, unknown: Math.max(0, Math.round((100 - javascript - wordpress) * 100) / 100) };
}

/** New installs per calendar month, oldest first, ending with the current month. */
export function installsByMonth(sites, now = Date.now(), months = 12) {
    const today = new Date(now);
    const buckets = Array.from({ length: months }, (_, i) => {
        const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1 - i), 1));
        return { key: date.toISOString().slice(0, 7), date, count: 0 };
    });
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const site of sites) {
        const bucket = site.installed && byKey.get(site.installed.toISOString().slice(0, 7));
        if (bucket) bucket.count += 1;
    }
    return buckets;
}
