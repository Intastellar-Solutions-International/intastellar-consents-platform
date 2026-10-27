/**
 * Shared "is this referrer actually a real third-party site?" SQL
 * fragments — two related but distinct checks:
 *
 *  - selfReferralClause(): the site's own domain (and subdomains) or an
 *    explicitly-approved cross-site domain. See item 2.
 *  - noiseReferralClause(): dev/local hosts and known referrer-spam
 *    domains — the same for every site, not site-specific. See item 3.
 *
 * Every query that buckets traffic into channels (organic / paid / referral
 * / direct) or lists top referrers was treating both of the above as
 * ordinary third-party referrals. See docs/analytics-audit-plan.md.
 *
 * One escaped/validated implementation of each here, rather than every call
 * site re-deriving (and potentially mis-deriving) the same regex — reused
 * by api/analytics-report.js, api/analytics-report-detail.js,
 * api/analytics-user-flow.js, api/_scheduled-report.js, and
 * api/analytics-property-report.js.
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

/**
 * "Is this referrer dev/local/spam noise, not a real third-party site?"
 * See docs/analytics-audit-plan.md item 3. Unlike self-referral above, this
 * is the same check for every site (dev tooling and referrer-spam domains
 * aren't site-specific), so it's a plain static fragment, not a function
 * needing per-site params.
 *
 * Mirrors isDevOrLocalHost() in api/a.js, which applies the same
 * dev/local-host patterns to `page_host` at ingestion time (dropping that
 * traffic entirely, since a request FROM localhost is someone's own machine,
 * not a visitor). Deliberately kept as a separate, parallel implementation
 * rather than a shared import: api/a.js's version works on a JS string at
 * request time; this one needs to be valid Postgres regex syntax, spliced
 * into query text. The same patterns, expressed twice, is still simpler and
 * less error-prone than one implementation trying to serve both call shapes.
 * Covered by a test enumerating the same cases against both (see
 * test/self-referral.test.mjs and test/push-gate-scope.test.mjs's sibling
 * for the general pattern).
 *
 * GOOGLE_INFRA_HOSTS (api/a.js's gtm-msr.appspot.com carve-out) is
 * deliberately not mirrored here — that's about where the tracking script
 * itself ran (a GTM preview renderer), not a plausible referrer value.
 *
 * SPAM_REFERRER_DOMAINS is intentionally short — seeded only with the
 * domain actually observed in this audit's live data
 * (www.everydaydealsnow.com, see docs/analytics-audit-plan.md item 3),
 * not a guessed-at general spam list. Extend it here as new confirmed
 * cases turn up; a per-organisation editable version (surfaced in Settings)
 * is a reasonable follow-up but a separate, larger feature than this fix.
 */
export const SPAM_REFERRER_DOMAINS = ["everydaydealsnow.com"];

export function noiseReferralClause(column = "referrer_host") {
    const col = `lower(coalesce(${column},''))`;
    const spamChecks = SPAM_REFERRER_DOMAINS
        .filter(isValidHostname)
        .map(d => `${col} = '${d}' OR ${col} = 'www.${d}'`);
    return `(
        ${col} IN ('localhost','0.0.0.0','::1')
        OR ${col} LIKE '%.local'
        OR ${col} ~ '^127\\.'
        OR ${col} ~ '^10\\.'
        OR ${col} ~ '^192\\.168\\.'
        OR ${col} ~ '^172\\.(1[6-9]|2[0-9]|3[01])\\.'
        ${spamChecks.length ? "OR " + spamChecks.join(" OR ") : ""}
    )`;
}
