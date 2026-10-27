/**
 * Shared "is this referrer actually just our own site?" SQL fragment.
 *
 * Every query that buckets traffic into channels (organic / paid / referral
 * / direct) or lists top referrers was treating the site's own domain (and
 * its subdomains — e.g. www.asasoftware.aero, new.asasoftware.aero) and any
 * explicitly-approved cross-site domain (e.g. a booking widget on a
 * separate host) as ordinary third-party referrals. See
 * docs/analytics-audit-plan.md item 2.
 *
 * One escaped/validated implementation here, rather than each call site
 * re-deriving (and potentially mis-deriving) the same regex — reused by
 * api/analytics-report.js, api/analytics-report-detail.js,
 * api/analytics-user-flow.js, and api/_scheduled-report.js.
 */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function isValidHostname(h) {
    return typeof h === "string" && HOSTNAME_RE.test(h);
}

// Bare boolean SQL expression (already parenthesized) that a caller ANDs/ORs
// into its own WHERE clause — true when `referrer_host` equals one of
// `siteDomains` (a single site's own domain for most callers; a whole
// portfolio's domains for analytics-property-report.js's multi-site
// rollup), a subdomain of any of them, or one of the `approvedDomains`
// (explicitly-approved cross-site domains, e.g. a booking widget on a
// separate host). Returns the literal "false" (matches nothing) if nothing
// valid was passed in.
//
// `siteDomains` and every entry in `approvedDomains` are re-validated
// against a strict hostname shape before being interpolated as raw SQL
// text (not a bind parameter) — this fragment needs to be spliced into many
// different queries with differing positional-parameter counts, matching
// this codebase's existing segment-filter convention (see
// CHANNEL_SQL/segCountry in api/analytics-report.js) — so defense in depth
// matters here even though both inputs ultimately come from our own
// analytics_sites / analytics_foreign_domains tables.
export function selfReferralClause(siteDomains, approvedDomains = [], column = "referrer_host") {
    const checks = [];
    for (const raw of [].concat(siteDomains || [])) {
        const normSite = (raw || "").replace(/^www\./i, "").toLowerCase();
        if (isValidHostname(normSite)) {
            checks.push(`regexp_replace(lower(coalesce(${column},'')), '^www\\.', '') = '${normSite}'`);
            checks.push(`regexp_replace(lower(coalesce(${column},'')), '^www\\.', '') LIKE '%.${normSite}'`);
        }
    }
    for (const raw of approvedDomains) {
        const d = (raw || "").toLowerCase();
        if (isValidHostname(d)) {
            checks.push(`regexp_replace(lower(coalesce(${column},'')), '^www\\.', '') = '${d}'`);
        }
    }
    return checks.length ? `(${checks.join(" OR ")})` : "false";
}

// siteId -> its own approved cross-site domains, for the one-site-at-a-time
// callers above.
export async function getApprovedDomains(db, siteId) {
    const { rows } = await db.query(
        `SELECT domain FROM analytics_foreign_domains WHERE site_id = $1 AND approved = true`,
        [siteId]
    ).catch(() => ({ rows: [] }));
    return rows.map(r => r.domain);
}

// Same, for analytics-property-report.js's multi-site rollup — the combined
// approved-domains list across every site in the portfolio. Slightly
// coarser than per-site (a domain approved for site A would also be treated
// as "self" when it shows up as a referrer on site B's rows), which in
// practice only matters for traffic moving between a portfolio's own
// properties — arguably still not a "real" external referral either way.
export async function getApprovedDomainsForSites(db, siteIds) {
    const { rows } = await db.query(
        `SELECT DISTINCT domain FROM analytics_foreign_domains WHERE site_id = ANY($1) AND approved = true`,
        [siteIds]
    ).catch(() => ({ rows: [] }));
    return rows.map(r => r.domain);
}
