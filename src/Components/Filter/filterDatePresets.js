/** Local calendar date helpers for dashboard date filter (no UTC midnight shifts). */

export function ymdLocal(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (!Number.isFinite(x.getTime())) return "";
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function parseYmdLocal(s) {
    if (s == null || s === "") return new Date(NaN);
    const part = String(s).split("T")[0];
    const [y, m, d] = part.split("-").map(Number);
    if (!y || !m || !d) return new Date(NaN);
    return new Date(y, m - 1, d);
}

export function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}

/** Inclusive day count from start to end (local dates). */
export function inclusiveDayCount(start, end) {
    const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/** Monday of the week containing `d` (local). */
export function mondayOfWeekContaining(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7;
    return addDays(x, -dow);
}

/** "Yesterday" for analytics (last complete day). */
export function yesterdayLocal() {
    const t = new Date();
    return addDays(new Date(t.getFullYear(), t.getMonth(), t.getDate()), -1);
}

/** Last calendar week Mon–Sun, capped end at `yesterday` if that week is still partial. */
export function rangeLastWeek() {
    const y = yesterdayLocal();
    const thisMon = mondayOfWeekContaining(y);
    const start = addDays(thisMon, -7);
    const endRaw = addDays(start, 6);
    const end = endRaw > y ? y : endRaw;
    return { start, end };
}

/** This calendar week Mon–`yesterday`. */
export function rangeThisWeek() {
    const y = yesterdayLocal();
    const start = mondayOfWeekContaining(y);
    const end = y < start ? start : y;
    return { start, end };
}

/** Quarter containing `d`: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. */
export function startOfQuarter(d) {
    const m = d.getMonth();
    const q = Math.floor(m / 3);
    return new Date(d.getFullYear(), q * 3, 1);
}

/** Quarter to date through yesterday. */
export function rangeQuarterToDate() {
    const y = yesterdayLocal();
    const start = startOfQuarter(y);
    return { start, end: y };
}

/** Jan 1 this year through yesterday. */
export function rangeThisYearToDate() {
    const y = yesterdayLocal();
    const start = new Date(y.getFullYear(), 0, 1);
    return { start, end: y };
}

/**
 * Comparison window for KPI / UI (chronological: start ≤ end).
 * @param {Date} primaryStart
 * @param {Date} primaryEnd
 * @param {"Previous period"|"Preceding period"|"Previous quarter"|"Last 180 days"|"Same period last year"} mode
 * @param {number|string} [compareHint] legacy span from preset buttons
 */
export function computeCompareWindow(primaryStart, primaryEnd, mode, compareHint) {
    const ps = new Date(primaryStart.getFullYear(), primaryStart.getMonth(), primaryStart.getDate());
    const pe = new Date(primaryEnd.getFullYear(), primaryEnd.getMonth(), primaryEnd.getDate());
    const days = Math.max(1, inclusiveDayCount(ps, pe));

    if (mode === "Same period last year") {
        const start = addDays(ps, -365);
        const end = addDays(pe, -365);
        return { start, end };
    }

    if (mode === "Previous quarter") {
        const span = 90;
        const end = addDays(ps, -1);
        const start = addDays(end, -(span - 1));
        return { start, end };
    }

    if (mode === "Last 180 days") {
        const span = 180;
        const end = addDays(ps, -1);
        const start = addDays(end, -(span - 1));
        return { start, end };
    }

    if (mode === "Preceding period") {
        const prevEnd = addDays(ps, -1);
        const prevStart = addDays(prevEnd, -(days - 1));
        const compEnd = addDays(prevStart, -1);
        const compStart = addDays(compEnd, -(days - 1));
        return { start: compStart, end: compEnd };
    }

    // "Previous period" — same length, immediately before primary
    const end = addDays(ps, -1);
    const start = addDays(end, -(days - 1));
    return { start, end };
}

/** Default “previous period” window for KPIs when compare mode is off (same length, immediately before primary). */
export function defaultCompareWindowForPrimary(primaryStart, primaryEnd) {
    return computeCompareWindow(primaryStart, primaryEnd, "Previous period", 0);
}
