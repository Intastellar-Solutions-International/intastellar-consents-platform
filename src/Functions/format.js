/**
 * The one place numbers, percentages, dates and times are formatted in the
 * CMP dashboard. Everything goes through Intl with the user's locale
 * (Settings → Preferences, else the browser language — see userLocale.js),
 * so "9,959" / "92.1%" / "3 Nov 2026" follow the user instead of being
 * hard-coded to de-DE.
 *
 * Missing values (null, undefined, NaN, invalid dates) render as "—".
 */
import { getUserLocale } from "./userLocale.js";

const DASH = "—";
const cache = new Map();
function cached(kind, locale, options, make) {
    const key = kind + "|" + locale + "|" + JSON.stringify(options || {});
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
}

/** The active formatting locale — use it wherever a locale argument is needed. */
export function appLocale() {
    return getUserLocale();
}

function toNumber(n) {
    const v = typeof n === "string" && n.trim() !== "" ? Number(n) : n;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function formatNumber(n, options) {
    const v = toNumber(n);
    if (v === null) return DASH;
    const locale = appLocale();
    return cached("n", locale, options, () => new Intl.NumberFormat(locale, options)).format(v);
}

/** value is already a percentage (92.1 → "92.1%"). digits: max fraction digits. */
export function formatPercent(value, digits = 1) {
    const v = toNumber(value);
    if (v === null) return DASH;
    const locale = appLocale();
    const opts = { style: "percent", maximumFractionDigits: digits };
    return cached("p", locale, opts, () => new Intl.NumberFormat(locale, opts)).format(v / 100);
}

/** 12,345 → "12K" in compact contexts (map labels, chart axes). */
export function formatCompact(n) {
    return formatNumber(n, { notation: "compact", maximumFractionDigits: 1 });
}

function toDate(d) {
    if (d == null || d === "") return null;
    const date = d instanceof Date ? d : new Date(d);
    return Number.isFinite(date.getTime()) ? date : null;
}

/** One date format everywhere: Intl "medium" — "3 Nov 2026" (en-GB), "Nov 3, 2026" (en-US). */
export function formatDate(d, options = { dateStyle: "medium" }) {
    const date = toDate(d);
    if (!date) return DASH;
    const locale = appLocale();
    return cached("d", locale, options, () => new Intl.DateTimeFormat(locale, options)).format(date);
}

/** "14:30" — add { withZone: true } to show the time zone ("14:30 CET"). */
export function formatTime(d, { withZone = false, seconds = false } = {}) {
    const date = toDate(d);
    if (!date) return DASH;
    const locale = appLocale();
    const opts = { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), ...(withZone ? { timeZoneName: "short" } : {}) };
    return cached("t", locale, opts, () => new Intl.DateTimeFormat(locale, opts)).format(date);
}

/** "3 Nov 2026, 14:30 CET" — timestamps always carry their time zone. */
export function formatDateTime(d) {
    const date = toDate(d);
    if (!date) return DASH;
    const locale = appLocale();
    const opts = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
    return cached("dt", locale, opts, () => new Intl.DateTimeFormat(locale, opts)).format(date);
}

/** "4 Oct – 3 Nov 2026" */
export function formatDateRange(from, to) {
    const a = toDate(from), b = toDate(to);
    if (!a || !b) return DASH;
    const locale = appLocale();
    const fmt = cached("d", locale, { dateStyle: "medium" }, () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }));
    return typeof fmt.formatRange === "function" ? fmt.formatRange(a, b) : `${fmt.format(a)} – ${fmt.format(b)}`;
}
