/**
 * Turns the API's `dailyNum` into one point per chart position. The API only
 * returns days that had decisions, so a multi-day range is laid out against
 * every day in it: a missing day is 0 decisions and has no acceptance rate.
 */
const DAY_MS = 86400000;

function ymd(value) {
    return String(value ?? "").slice(0, 10);
}

function rateOf(value) {
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function toPoint(row, key) {
    return {
        key,
        num: Number(row?.num) || 0,
        prevNum: row?.previousPeriod?.num == null ? null : Number(row.previousPeriod.num),
        rate: rateOf(row?.accepted),
        prevRate: rateOf(row?.previousPeriod?.accepted),
    };
}

export function buildTrendPoints(daily, fromYmd, toYmd, granularity = "day") {
    const rows = Array.isArray(daily) ? daily : [];
    if (granularity === "hour") return rows.map((row) => toPoint(row, String(row.date)));

    const byDay = new Map(rows.map((row) => [ymd(row.date), row]));
    const end = Date.parse(`${toYmd}T00:00:00Z`);
    const points = [];
    for (let t = Date.parse(`${fromYmd}T00:00:00Z`); t <= end; t += DAY_MS) {
        const key = new Date(t).toISOString().slice(0, 10);
        points.push(byDay.has(key) ? toPoint(byDay.get(key), key) : { ...toPoint(null, key), prevNum: 0 });
    }
    return points;
}

/** SVG path through the values; a null breaks the line. x/y map index/value to the chart. */
export function linePath(values, x, y) {
    let d = "";
    let run = 0;
    values.forEach((v, i) => {
        if (v == null) {
            if (run === 1) d += ` L${x(i - 1).toFixed(2)} ${y(values[i - 1]).toFixed(2)}`;
            run = 0;
            return;
        }
        d += `${d ? " " : ""}${run ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`;
        run += 1;
    });
    if (run === 1) d += ` L${x(values.length - 1).toFixed(2)} ${y(values[values.length - 1]).toFixed(2)}`;
    return d;
}

/**
 * Accepted, custom and denied as shares of every decision. Custom is what is
 * left of the total, so the three always cover it.
 */
export function decisionSplit(consent) {
    const total = Number(consent?.Total) || 0;
    const accepted = Number(consent?.interactions_number?.accept) || 0;
    const denied = Number(consent?.interactions_number?.decline) || 0;
    const custom = Math.max(0, total - accepted - denied);
    const share = (n) => (total > 0 ? (n / total) * 100 : 0);
    return {
        total,
        segments: [
            { key: "accepted", label: "Accepted", count: accepted, percent: share(accepted) },
            { key: "custom", label: "Custom", count: custom, percent: share(custom) },
            { key: "denied", label: "Denied", count: denied, percent: share(denied) },
        ],
    };
}
