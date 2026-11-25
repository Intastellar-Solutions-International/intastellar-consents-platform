// Goals for the Conversions page (api/analytics-goals.js): every headline
// conversion (tier lead / sale, _conversions.js) belongs to exactly one goal —
//   type:<Lead type>  a form submit whose form has a lead type ("type:Demo")
//   forms             any other form submit that counts as a lead
//   event:<name>      a registered lead / sale event ("event:purchase")
// Pure helpers here; the SQL runs in analytics-goals.js.
import { formLeadTypeSql } from "./_conversions.js";

/** SQL: the goal key of a conversion row (alias = analytics_custom_events). */
export function goalKeySql(alias) {
    return `(CASE
        WHEN ${formLeadTypeSql(alias)} IS NOT NULL THEN 'type:' || ${formLeadTypeSql(alias)}
        WHEN ${alias}.name = 'form_submit' THEN 'forms'
        ELSE 'event:' || ${alias}.name
    END)`;
}

/** Validated goal key from the query string: "all" or one of the three forms above. */
export function cleanGoalKey(raw) {
    const s = String(raw || "all").slice(0, 120);
    if (s === "all" || s === "forms") return s;
    if (/^type:.{1,60}$/.test(s)) return s;
    if (/^event:[a-z0-9_-]{1,64}$/i.test(s)) return s;
    return "all";
}

export function goalLabel(key, defLabels = new Map()) {
    if (key === "all") return "All conversions";
    if (key === "forms") return "Other forms";
    if (key.startsWith("type:")) return key.slice(5);
    const name = key.slice(6);
    return defLabels.get(name) || name;
}

const pct = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

/** Goal count rows (key, cur, prev) → chips, biggest first, plus the "All" total. */
export function shapeGoals(rows, defLabels) {
    const goals = rows
        .map((r) => ({ key: r.goal_key, cur: Number(r.cur) || 0, prev: Number(r.prev) || 0 }))
        .filter((g) => g.cur > 0 || g.prev > 0)
        .map((g) => ({ key: g.key, label: goalLabel(g.key, defLabels), count: g.cur, prevCount: g.prev, trend: pct(g.cur, g.prev) }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const cur = goals.reduce((s, g) => s + g.count, 0);
    const prev = goals.reduce((s, g) => s + g.prevCount, 0);
    return [{ key: "all", label: goalLabel("all"), count: cur, prevCount: prev, trend: pct(cur, prev) }, ...goals];
}

/** Path steps (sessions at each step) → steps with the drop from the step before. */
export function shapePath(steps) {
    return steps.map((s, i) => {
        const count = Number(s.count) || 0;
        const before = i ? Number(steps[i - 1].count) || 0 : null;
        return { key: s.key, count, dropPct: before ? Math.max(0, ((before - count) / before) * 100) : null };
    });
}

// Minutes from a session's first page view to the conversion.
export const TIME_BUCKETS = [
    { key: "under1m", max: 1 },
    { key: "1to5m", max: 5 },
    { key: "5to30m", max: 30 },
    { key: "30mto1d", max: 1440 },
    { key: "over1d", max: Infinity },
];

export function bucketMinutes(minutesList) {
    const out = TIME_BUCKETS.map((b) => ({ key: b.key, count: 0 }));
    for (const m of minutesList) {
        const v = Math.max(0, Number(m) || 0);
        out[TIME_BUCKETS.findIndex((b) => v < b.max)].count += 1;
    }
    return out;
}

export function median(values) {
    const v = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
