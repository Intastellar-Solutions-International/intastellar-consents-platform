// "Why did it change?" — splits the change of a metric between two periods
// into the channels, devices, countries, pages and channel × device
// combinations it came from, and names the main cause.

/** A change smaller than this (and under 5 % of the previous value) isn't worth explaining. */
export const MIN_ABS_CHANGE = 20;
// A channel × device combination is named instead of its broader parent when
// it explains at least this share of what the best single dimension explains.
const COMBO_PREFERENCE = 0.8;

/**
 * totals: { current, previous }
 * groups: { [dimension]: [{ value, current, previous }] }
 * → { current, previous, delta, pct, meaningful, headline, offset, drivers }
 */
export function explainChange(totals, groups) {
    const current = Number(totals.current || 0), previous = Number(totals.previous || 0);
    const delta = current - previous;
    const pct = previous ? (delta / previous) * 100 : null;
    const meaningful = Math.abs(delta) >= MIN_ABS_CHANGE && (previous === 0 || Math.abs(delta) / previous >= 0.05);
    const direction = Math.sign(delta);

    const drivers = {};
    const all = [];
    for (const [dimension, rows] of Object.entries(groups)) {
        drivers[dimension] = rows
            .map((r) => {
                const d = Number(r.current || 0) - Number(r.previous || 0);
                return { dimension, value: r.value, current: Number(r.current || 0), previous: Number(r.previous || 0), delta: d, share: delta ? d / delta : null };
            })
            .filter((r) => r.delta !== 0)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 5);
        all.push(...drivers[dimension]);
    }

    let headline = null, offset = null;
    if (meaningful && direction) {
        const along = all.filter((r) => Math.sign(r.delta) === direction).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        const singles = along.filter((r) => r.dimension !== "channel_device");
        const bestSingle = singles[0] || null;
        const bestCombo = along.find((r) => r.dimension === "channel_device") || null;
        headline = bestCombo && bestSingle && Math.abs(bestCombo.delta) >= COMBO_PREFERENCE * Math.abs(bestSingle.delta)
            ? bestCombo
            : bestSingle || bestCombo;
        // The largest movement the other way, among the broad dimensions.
        offset = all
            .filter((r) => Math.sign(r.delta) === -direction && r.dimension !== "channel_device" && r.dimension !== "page")
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;
    }
    return { current, previous, delta, pct, meaningful, headline, offset, drivers };
}

/** The previous period of the same length: [from, to] (inclusive days) → { prevFrom, from, toExclusive }. */
export function periods(from, to) {
    const day = 864e5;
    const start = Date.parse(from), end = Date.parse(to);
    const length = Math.round((end - start) / day) + 1;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    return { prevFrom: iso(start - length * day), from: iso(start), toExclusive: iso(end + day), days: length };
}
