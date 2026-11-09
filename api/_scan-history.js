/**
 * Comparing a domain's stored scans. A scan where the banner was accepted sees
 * far more than one where it wasn't, and sites behave differently by region, so
 * only scans of the same type, region and accept step are compared.
 */
const DAY_MS = 86400000;
const REGION_LABEL = { iad1: "US East", fra1: "EU (Frankfurt)", sin1: "Singapore" };

export const scanRegionLabel = (region) => REGION_LABEL[region] || region || "region not recorded";

const comparable = (a, b) => a.consent_step === b.consent_step && a.scan_type === b.scan_type && a.scan_region === b.scan_region;

/** scans: newest first. Adds `delta` against the next older comparable scan, or null. */
export function addScanDeltas(scans) {
    return scans.map((scan, i) => {
        const previous = scans.slice(i + 1).find((s) => comparable(s, scan));
        return {
            ...scan,
            delta: previous ? { vendors: scan.vendors_found - previous.vendors_found, cookies: scan.cookies_found - previous.cookies_found } : null,
        };
    });
}

export function formatScanDelta(delta) {
    if (!delta) return "No comparable earlier scan";
    const part = (n, noun) => `${n > 0 ? "+" : "-"}${Math.abs(n)} ${noun}${Math.abs(n) === 1 ? "" : "s"}`;
    const parts = [];
    if (delta.vendors) parts.push(part(delta.vendors, "vendor"));
    if (delta.cookies) parts.push(part(delta.cookies, "cookie"));
    return parts.length ? parts.join(", ") : "No change";
}

/** Age in whole days when a 30-day-or-longer report rests on a scan over 3 days old, else null. */
export function staleScanDays(scannedAt, rangeDays, now = Date.now()) {
    const age = now - new Date(scannedAt).getTime();
    if (!(rangeDays >= 30) || !(age > 3 * DAY_MS)) return null;
    return Math.floor(age / DAY_MS);
}
