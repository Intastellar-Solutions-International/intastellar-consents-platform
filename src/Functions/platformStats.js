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

/** Sales figures, strongest selling point first. `text` finishes a sentence after the number. */
export const SALES_FIGURES = [
    { key: "banner_compliant_pct", label: "Clean before consent, with Intastellar", unit: "percent", sample: "banner_sites_tested", text: "of websites running Intastellar Consents load no trackers before the visitor agrees" },
    { key: "other_compliant_pct", label: "Clean before consent, without", unit: "percent", sample: "other_sites_tested", text: "of websites tested without Intastellar Consents load no trackers before the visitor agrees" },
    { key: "pre_consent_pct", label: "Trackers before consent", unit: "percent", sample: "pre_consent_sites", text: "of websites tested load trackers before the visitor has agreed" },
    { key: "us_transfer_pct", label: "Data sent to the US", unit: "percent", sample: "sites_scanned", text: "of websites scanned send visitor data to the US once cookies are accepted" },
    { key: "advertising_pct", label: "Advertising services", unit: "percent", sample: "sites_scanned", text: "of websites scanned load advertising services" },
    { key: "median_tracking_services", label: "Trackers per site (median)", unit: "count", text: "tracking services on the typical website" },
    { key: "visitors_30d", label: "Visitors (30 days)", unit: "count", trend: true, text: "visitors with a recorded consent choice in the last 30 days" },
    { key: "consent_records_30d", label: "Consent records (30 days)", unit: "count", trend: true, text: "consent records stored in the last 30 days" },
    { key: "accept_all_pct", label: "Accepted all", unit: "percent", sample: "consent_records_30d", sampleUnit: "records", text: "of consent records accepted all cookies" },
    { key: "custom_choice_pct", label: "Chose categories", unit: "percent", sample: "consent_records_30d", sampleUnit: "records", text: "of consent records chose specific categories" },
    { key: "decline_all_pct", label: "Declined all", unit: "percent", sample: "consent_records_30d", sampleUnit: "records", text: "of consent records declined all optional cookies" },
    { key: "eu_accept_pct", label: "Accepted all (EU)", unit: "percent", sample: "eu_records_30d", sampleUnit: "records", text: "of consent records from EU visitors accepted all cookies" },
    { key: "non_eu_accept_pct", label: "Accepted all (outside EU)", unit: "percent", sample: "non_eu_records_30d", sampleUnit: "records", text: "of consent records from visitors outside the EU accepted all cookies" },
    { key: "mobile_pct", label: "Choices on mobile", unit: "percent", sample: "consent_records_30d", sampleUnit: "records", text: "of consent choices with a known device were made on mobile" },
    { key: "countries_30d", label: "Countries (30 days)", unit: "count", trend: true, text: "countries with recorded consent choices in the last 30 days" },
    { key: "sites_installed", label: "Websites with the banner", unit: "count", trend: true, text: "websites have installed Intastellar Consents" },
    { key: "sites_active", label: "Active in 30 days", unit: "count", trend: true, text: "of those were active in the last 30 days" },
    { key: "sites_scanned", label: "Websites scanned (90 days)", unit: "count", trend: true, text: "websites scanned in the last 90 days" },
    { key: "tracking_services_found", label: "Tracking services found", unit: "count", text: "different tracking services identified" },
    { key: "cookies_found", label: "Cookies found", unit: "count", text: "different cookies identified" },
];

/** Why a figure has no value: a percentage needs a big enough sample, anything else can only be unavailable. */
export function missingFigureReason(figure, figures, minSites, minRecords) {
    const sample = figure.sample ? figures?.[figure.sample] : null;
    if (sample == null) return "Not available";
    return figure.sampleUnit === "records" ? `${sample} of ${minRecords} records needed` : `${sample} of ${minSites} sites needed`;
}

/** Change against an earlier snapshot in percent, or null without something to compare. */
export function figureChange(current, previous) {
    const now = Number(current);
    const then = Number(previous);
    if (current == null || previous == null || !then) return null;
    return Math.round(((now - then) / then) * 1000) / 10;
}

const canonical = (value) => JSON.stringify(value, (_, v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v));

/** Whether two sets of figures match. The database reorders object keys, so order is ignored. */
export function sameFigures(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    return [...keys].every((key) => canonical(a?.[key]) === canonical(b?.[key]));
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A one-page document to print or save as PDF. Takes only figures cleared for publishing. */
export function salesSheetHtml(figures, asOf) {
    const number = new Intl.NumberFormat("en");
    const value = (f) => (f.unit === "percent" ? `${number.format(figures[f.key])}%` : number.format(figures[f.key]));
    const shown = SALES_FIGURES.filter((f) => figures?.[f.key] != null);
    const date = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${asOf}T00:00:00Z`));
    const tiles = shown.map((f) => `<div class="tile"><strong>${escapeHtml(value(f))}</strong><span>${escapeHtml(f.text)}</span></div>`).join("");
    const trackers = Array.isArray(figures?.top_trackers) && figures.top_trackers.length
        ? `<h2>Most common trackers on scanned websites</h2><ol class="trackers">${figures.top_trackers.slice(0, 5)
            .map((t) => `<li><span>${escapeHtml(t.name)}</span><strong>${escapeHtml(t.pct)}%</strong></li>`).join("")}</ol>`
        : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Intastellar Consents in numbers</title><style>
@page{margin:18mm}
body{font-family:Helvetica,Arial,sans-serif;color:#1b1b1b;margin:0 auto;max-width:760px;padding:32px}
h1{font-size:30px;margin:0 0 8px}
p{color:#555;line-height:1.5;margin:0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:32px 0}
.tile{border-top:3px solid #c09f53;padding-top:12px;break-inside:avoid}
.tile strong{display:block;font-size:28px;margin-bottom:6px}
h2{font-size:18px;margin:0 0 12px}
.trackers{list-style:none;padding:0;margin:0 0 32px;break-inside:avoid}
.trackers li{display:flex;justify-content:space-between;border-bottom:1px solid #e5e5e5;padding:8px 0;font-size:14px}
.tile span{color:#555;font-size:14px;line-height:1.4}
.note{font-size:12px}
</style></head><body><h1>What websites really do with visitor data</h1>
<p>Figures from Intastellar Consents, the consent banner that shows you what your website loads and when.</p>
<div class="grid">${tiles}</div>
${trackers}
<p class="note">Measured by automated scans, banner installs and consent records as of ${escapeHtml(date)}. Percentages are shown only when at least 30 websites or 1,000 consent records were measured. A returning visitor can add more than one consent record. No individual website or customer is identified.</p>
</body></html>`;
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
