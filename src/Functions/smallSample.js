// Honesty about small numbers: a change computed from a handful of visits
// ("▼ 66,7%" when 3 users became 1) looks alarming but means nothing. Both
// products use this one rule to show such changes as "Too little data"
// instead of a red/green arrow, with the real counts on hover.

export const MIN_BASE = 30;
export const LOW_DATA_LABEL = "Too little data";

// null/undefined mean "unknown", not 0 (Number(null) is 0).
const known = (values) => values.filter((v) => v != null && v !== "").map(Number).filter(Number.isFinite);

/**
 * Whether a period-over-period change rests on too few items to mean much.
 * Counts: pass both periods' values — the larger one is the base (3 → 1 is
 * noise, 300 → 100 is not). Rates: pass the denominators (sessions,
 * decisions) — the smaller one is the base, since that's what makes the
 * percentage shaky.
 */
export function isLowDataCount(current, previous, min = MIN_BASE) {
    const values = known([current, previous]);
    if (!values.length) return false;
    return Math.max(...values) < min;
}

export function isLowDataRate(currentBase, previousBase, min = MIN_BASE) {
    const values = known([currentBase, previousBase]);
    if (!values.length) return false;
    return Math.min(...values) < min;
}
