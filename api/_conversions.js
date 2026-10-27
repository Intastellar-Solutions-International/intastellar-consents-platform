/**
 * Shared conversion-tier classification. See docs/analytics-audit-plan.md
 * item 5 — before this, `kind` (purchase/click/custom/...) was purely
 * cosmetic (picked a UI icon/snippet) and every tab invented its own ad hoc
 * rule for what counts as a "conversion," producing wildly different totals
 * for the same underlying data (Overview: 1, Attribution: 3, Forms: 9,
 * Conversions: 76/576, trend chart: 20,070).
 *
 * Four tiers, in priority order (checked top to bottom):
 *   - Sale:   a purchase or e-commerce-funnel step (kind IN SALE_KINDS) —
 *             an actual sale or a step directly toward one, not a lead.
 *   - Lead:   kind = 'lead' (a site owner explicitly registered their
 *             booking/demo-request/signup confirmation event this way), OR
 *             the name is 'form_submit' — the one auto-collected event
 *             promoted to Lead regardless of registration, since a real
 *             visitor submitting any form is a lead by definition. A CTA
 *             click toward a form/booking (e.g. "Book a demo" button) is
 *             Intent, not Lead — it hasn't converted yet.
 *   - Intent: kind = 'click' — a registered CTA click. Counts separately,
 *             never folded into the headline "Conversions" total.
 *   - Micro:  everything else — unregistered custom events (kind='custom'
 *             and not 'form_submit') and the rest of AUTO_EVENT_NAMES
 *             (scroll_depth, rage_click, page_perf, etc.).
 *
 * `kind` lives only on analytics_event_defs, not on analytics_custom_events
 * itself, so every SQL consumer needs a LEFT JOIN — tierCaseSql() below
 * assumes one named `d` (or whatever alias you pass) is already joined
 * ON d.site_id = <events alias>.site_id AND d.name = <events alias>.name.
 *
 * AUTO_EVENT_NAMES mirrors the one in src/Pages/Analytics/Conversions.js —
 * api/ and src/ aren't cross-imported in this project, so this is kept in
 * sync by hand (same convention as NON_CONVERSION_AUTO_EVENTS in api/a.js).
 */

export const SALE_KINDS = Object.freeze([
    "purchase", "view_item", "add_to_cart", "remove_from_cart", "wishlist_add",
    "view_basket", "begin_checkout", "checkout", "payment_info", "refund", "apply_coupon",
]);
export const LEAD_KINDS = Object.freeze(["lead"]);
export const INTENT_KINDS = Object.freeze(["click"]);

// The one auto-collected (no registration needed) event name promoted to
// Lead tier regardless of `kind` — see the module doc comment above.
export const LEAD_EVENT_NAMES = Object.freeze(["form_submit"]);

export const AUTO_EVENT_NAMES = new Set([
    "outbound_click", "scroll_depth", "form_submit", "form_started", "form_step",
    "file_download", "video_play", "video_complete", "video_50pct",
    "phone_click", "email_click", "content_copy", "page_print",
    "rage_click", "video_pause", "page_perf", "page_load", "form_error",
    "form_success", "form_field_focus", "network_connection",
]);

const SALE_KINDS_SET = new Set(SALE_KINDS);
const LEAD_KINDS_SET = new Set(LEAD_KINDS);
const INTENT_KINDS_SET = new Set(INTENT_KINDS);
const LEAD_EVENT_NAMES_SET = new Set(LEAD_EVENT_NAMES);

// Pure JS classifier — `kind` may be undefined/null for an unregistered
// custom event (defaults to the DB's own 'custom' default, but a caller
// that hasn't joined analytics_event_defs at all would pass undefined).
export function classifyTier(name, kind) {
    if (LEAD_EVENT_NAMES_SET.has(name)) return "lead";
    if (SALE_KINDS_SET.has(kind)) return "sale";
    if (LEAD_KINDS_SET.has(kind)) return "lead";
    if (INTENT_KINDS_SET.has(kind)) return "intent";
    return "micro";
}

function sqlList(values) {
    return values.map(v => `'${v}'`).join(",");
}

// SQL CASE expression (no trailing alias) classifying a row into one of the
// four tiers. `eventsAlias` is the table carrying `name` (and `site_id`);
// `defsAlias` is the analytics_event_defs join carrying `kind` — pass null
// if the caller hasn't joined analytics_event_defs (kind-based tiers will
// then never match, which is the correct degraded behavior: an unjoined
// query simply can't see Sale/Intent/kind='lead', only the Lead event-name
// promotion and Micro).
export function tierCaseSql(eventsAlias, defsAlias) {
    const name = `${eventsAlias}.name`;
    const kind = defsAlias ? `${defsAlias}.kind` : "NULL";
    return `(
        CASE
            WHEN ${name} IN (${sqlList(LEAD_EVENT_NAMES)}) THEN 'lead'
            WHEN ${kind} IN (${sqlList(SALE_KINDS)}) THEN 'sale'
            WHEN ${kind} IN (${sqlList(LEAD_KINDS)}) THEN 'lead'
            WHEN ${kind} IN (${sqlList(INTENT_KINDS)}) THEN 'intent'
            ELSE 'micro'
        END
    )`;
}

// Bare boolean SQL expression — true when a row is tier 'lead' or 'sale',
// the two tiers that should count toward a headline "Conversions" total.
// (Not currently used to gate anything by itself — tierCaseSql() is the
// primary export — kept for call sites that only need the yes/no check.)
export function isHeadlineConversionSql(eventsAlias, defsAlias) {
    return `(${tierCaseSql(eventsAlias, defsAlias)} IN ('lead','sale'))`;
}
