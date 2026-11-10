/**
 * Compliance across every domain in the organisation, from one scanCompliance()
 * result per domain (the same status the header shows for a single domain).
 */
const LEVEL_RANK = { critical: 0, attention: 1, unknown: 2, healthy: 3, failed: 4 };
const FINDING_RANK = { consent: 0, mechanism: 1, dpa: 2, unconfirmed: 3 };
const ISSUE_TITLE = {
    consent: (vendor) => `${vendor} loads before consent`,
    mechanism: (vendor) => `No transfer mechanism on record for ${vendor}`,
    dpa: (vendor) => `No confirmed DPA with ${vendor}`,
    unconfirmed: (vendor) => `${vendor}'s transfer mechanism is not confirmed`,
};

/**
 * rows: [{ domain, status, scannedAt, preConsentCookies }], status null when the domain couldn't be checked.
 * Issues are grouped by kind and vendor. Transfer and DPA records belong to the organisation,
 * so one of those issues is fixed once for every domain it appears on.
 */
export function combineDomainCompliance(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const domains = list
        .map((r) => ({
            domain: r.domain,
            level: r.status ? r.status.level : "failed",
            count: r.status ? r.status.count : null,
            breakdown: r.status ? r.status.breakdown : null,
            scannedAt: r.scannedAt || null,
        }))
        .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (b.count || 0) - (a.count || 0) || a.domain.localeCompare(b.domain));

    const byIssue = new Map();
    for (const r of list) {
        for (const f of (r.status && r.status.findings) || []) {
            const key = `${f.kind}|${f.vendor}`;
            if (!byIssue.has(key)) byIssue.set(key, { key, kind: f.kind, vendor: f.vendor, title: ISSUE_TITLE[f.kind](f.vendor), domains: [] });
            if (!byIssue.get(key).domains.includes(r.domain)) byIssue.get(key).domains.push(r.domain);
        }
    }
    const issues = [...byIssue.values()].sort((a, b) => FINDING_RANK[a.kind] - FINDING_RANK[b.kind] || b.domains.length - a.domains.length || a.vendor.localeCompare(b.vendor));

    const levels = { critical: 0, attention: 0, healthy: 0, unknown: 0, failed: 0 };
    for (const d of domains) levels[d.level] += 1;
    const counted = list.filter((r) => r.preConsentCookies != null);
    return {
        domains,
        issues,
        levels,
        preConsentCookies: counted.length ? counted.reduce((sum, r) => sum + r.preConsentCookies, 0) : null,
        domainsWithCookieCount: counted.length,
    };
}

const NOT_CHECKED = new Set(["unknown", "failed"]);

/**
 * level: "all" | "critical" | "attention" | "healthy" | "not_checked"; query matches part of a domain.
 * Issues keep only the domains still shown, and drop out when none are left.
 */
export function filterDomainCompliance(summary, { level = "all", query = "" } = {}) {
    const q = String(query).trim().toLowerCase();
    const matches = (d) => (level === "all" || (level === "not_checked" ? NOT_CHECKED.has(d.level) : d.level === level))
        && (!q || d.domain.toLowerCase().includes(q));
    const domains = summary.domains.filter(matches);
    const shown = new Set(domains.map((d) => d.domain));
    const issues = summary.issues
        .map((issue) => ({ ...issue, domains: issue.domains.filter((d) => shown.has(d)) }))
        .filter((issue) => issue.domains.length);
    return { domains, issues };
}

const SORT_VALUE = { count: (d) => d.count, scannedAt: (d) => (d.scannedAt ? Date.parse(d.scannedAt) : null) };

/** key: "domain" | "level" (worst first when ascending) | "count" | "scannedAt". Missing counts and dates go last either way. */
export function sortDomains(domains, { key = "level", direction = "asc" } = {}) {
    const dir = direction === "desc" ? -1 : 1;
    const byName = (a, b) => a.domain.localeCompare(b.domain);
    const compare = (a, b) => {
        if (key === "domain") return byName(a, b) * dir;
        if (key === "level") return (LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (b.count || 0) - (a.count || 0)) * dir || byName(a, b);
        const va = SORT_VALUE[key](a);
        const vb = SORT_VALUE[key](b);
        if (va == null || vb == null) return va == null && vb == null ? byName(a, b) : va == null ? 1 : -1;
        return (va - vb) * dir || byName(a, b);
    };
    return [...domains].sort(compare);
}

/** Runs fn over items with at most `limit` running at once, in order of the input. */
export async function mapWithLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
