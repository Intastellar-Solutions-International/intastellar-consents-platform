// Building blocks for the Campaign consent page (index.js): the one-bar
// choice breakdown, KPI deltas and the paid-channel ↔ ad-platform mapping
// behind "cost per consent".
import { formatNumber, formatPercent } from "../../../Functions/format.js";
import { isLowDataCount, isLowDataRate } from "../../../Functions/smallSample.js";
import { t } from "../../../i18n/index.js";

// Paid channels only. The old source-prefix match also counted organic
// rows ("Google", "Facebook (Organic)") against ad spend, which made cost
// per consent look cheaper than it was.
export const PAID_CHANNELS_BY_PLATFORM = {
    google_ads: ["Google Ads"],
    meta_ads: ["Facebook Ads", "Instagram Ads"],
    microsoft_ads: ["Microsoft Ads"],
    linkedin_ads: ["LinkedIn Ads"],
};

export function platformForChannel(channel) {
    return Object.keys(PAID_CHANNELS_BY_PLATFORM).find((p) => PAID_CHANNELS_BY_PLATFORM[p].includes(channel)) || null;
}

/**
 * Per ad platform: spend, and the consents / accept-alls from its paid
 * channels. → { [platform]: { amount, currency, consents, acceptAll } }
 */
export function adCostByPlatform(platforms, channelOverview) {
    const out = {};
    for (const p of platforms || []) {
        const channels = PAID_CHANNELS_BY_PLATFORM[p.platform] || [];
        const matched = (channelOverview || []).filter((r) => channels.includes(r.channel));
        out[p.platform] = {
            amount: Number(p.amount) || 0,
            currency: p.currency || null,
            consents: matched.reduce((s, r) => s + (Number(r.consents) || 0), 0),
            acceptAll: matched.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0),
        };
    }
    return out;
}

/** KpiTile delta for a count: percent change, or "Too little data". */
export function countDelta(current, previous, goodWhen = "up") {
    if (previous == null || current == null) return null;
    if (isLowDataCount(current, previous)) {
        return { lowData: true, basis: t("{current} vs {previous} before", { current: formatNumber(current), previous: formatNumber(previous) }) };
    }
    if (!(previous > 0)) return null;
    const value = ((current - previous) / previous) * 100;
    return { value, formatted: formatPercent(Math.abs(value)), goodWhen, label: t("vs previous period") };
}

/** KpiTile delta for a rate: change in percentage points. */
export function rateDelta(current, previous, currentBase, previousBase, goodWhen = "up") {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
    if (isLowDataRate(currentBase, previousBase)) {
        return { lowData: true, basis: t("Based on {current} vs {previous} decisions", { current: formatNumber(currentBase), previous: formatNumber(previousBase) }) };
    }
    const value = Math.round((current - previous) * 10) / 10;
    return { value, formatted: t("{value} pts", { value: formatNumber(Math.abs(value), { maximumFractionDigits: 1 }) }), goodWhen, label: t("vs previous period") };
}

export const CHOICES = [
    { key: "acceptAll", label: "Accepted all", className: "cc-choice--all" },
    { key: "granular", label: "Chose some", className: "cc-choice--some" },
    { key: "essentialOnly", label: "Essential only", className: "cc-choice--essential" },
];

/**
 * How a row's visitors chose, as one stacked bar. Widths are shares of the
 * classified choices; the counts are in the tooltip and in screen-reader
 * text (never colour alone).
 */
export function ChoiceBar({ row }) {
    const parts = CHOICES.map((c) => ({ ...c, count: Number(row[c.key]) || 0 }));
    const classified = parts.reduce((s, p) => s + p.count, 0);
    if (!classified) return <span className="cc-muted">—</span>;
    const describe = parts.map((p) => `${t(p.label)}: ${formatPercent((p.count / classified) * 100, 0)} (${formatNumber(p.count)})`).join(" · ");
    return (
        <div className="cc-choice-bar" title={describe}>
            {parts.filter((p) => p.count > 0).map((p) => (
                <span key={p.key} className={`cc-choice-bar__seg ${p.className}`} style={{ width: `${(p.count / classified) * 100}%` }} />
            ))}
            <span className="tw-sr-only">{describe}</span>
        </div>
    );
}

export function ChoiceLegend() {
    return (
        <span className="cc-choice-legend" aria-hidden="true">
            {CHOICES.map((c) => (
                <span key={c.key} className="cc-choice-legend__item">
                    <span className={`cc-choice-legend__dot ${c.className}`} />{t(c.label)}
                </span>
            ))}
        </span>
    );
}
