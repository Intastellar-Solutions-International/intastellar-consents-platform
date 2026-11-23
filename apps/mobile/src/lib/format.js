import { locale, t } from "./i18n.js";

const DASH = "—";
const ok = (n) => typeof n === "number" && Number.isFinite(n);

export function formatNumber(n, options) {
    return ok(n) ? new Intl.NumberFormat(locale, options).format(n) : DASH;
}

/** 42.5 → "42.5%" in the app locale. */
export function formatPercent(n, digits = 1) {
    return ok(n) ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(n / 100) : DASH;
}

export function formatMoney(n, currency) {
    if (!ok(n)) return DASH;
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR" }).format(n);
    } catch {
        return `${formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ""}`.trim();
    }
}

// Hermes (React Native's engine) has Intl.NumberFormat and date formatting
// but no Intl.RelativeTimeFormat — use it where it exists, else short
// translated texts.
const RelativeTimeFormat = typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function" ? Intl.RelativeTimeFormat : null;

/** "just now" / "5 min ago" / "2 h ago" for a past timestamp (ms). */
export function formatRelative(ms) {
    if (!ms) return "";
    const sec = Math.round((ms - Date.now()) / 1000);
    const abs = Math.abs(sec);
    const minutes = Math.round(abs / 60);
    const hours = Math.round(abs / 3600);
    if (RelativeTimeFormat) {
        const rtf = new RelativeTimeFormat(locale, { numeric: "auto" });
        if (abs < 45) return rtf.format(0, "second");
        if (abs < 3600) return rtf.format(-minutes, "minute");
        return rtf.format(-hours, "hour");
    }
    if (abs < 45) return t("just now");
    if (abs < 3600) return t("{count} min ago", { count: minutes });
    return t("{count} h ago", { count: hours });
}

/** YYYY-MM-DD in local time — what the API's from/to expect. */
export function ymd(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The last `days` days ending today, and the same-length period before. */
export function periodRange(days) {
    const to = new Date();
    const from = new Date(); from.setDate(to.getDate() - (days - 1));
    const prevTo = new Date(from); prevTo.setDate(from.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - (days - 1));
    return { from: ymd(from), to: ymd(to), prevFrom: ymd(prevFrom), prevTo: ymd(prevTo) };
}
