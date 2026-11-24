// Consent-banner A/B tests in the analytics data: the banner sets
// window.INTA.experiment.id / window.INTA.experimentVariant, the tracker
// sends both with every page view and event (consenting or not — a variant
// name identifies nobody), so consent rate and conversions can be compared
// per banner variant.

const REF_RE = /^[\w.:-]{1,64}$/;

/** A banner experiment id or variant id from the tracker → string or null. */
export function cleanBannerRef(raw) {
    const v = String(raw ?? "").trim();
    return REF_RE.test(v) ? v : null;
}

/** Variants under this many page views are flagged: too little traffic to trust a difference. */
export const SMALL_SAMPLE_PAGEVIEWS = 500;

const num = (v) => Number(v || 0);

/**
 * Conversions split by whether they can be attributed to a channel.
 * byLevel: [{ consent_level, conversions, revenue_cents, currency }]
 * pageviews: { full, total } — for the site's consent rate.
 *
 * "What if": attributable conversions move with the consent rate — at rate
 * c, a = attributable; at c + Δ about a × Δ / c more, never more than the
 * conversions that are currently unattributed.
 */
export function consentRevenue(byLevel, pageviews, { points = 5 } = {}) {
    const level = (l) => byLevel.find((r) => r.consent_level === l) || {};
    const full = level("full"), minimal = level("minimal");
    const attributable = num(full.conversions), unattributed = num(minimal.conversions);
    const total = attributable + unattributed;
    const revAttr = num(full.revenue_cents) / 100, revUnattr = num(minimal.revenue_cents) / 100;
    const consentRate = num(pageviews.total) ? num(pageviews.full) / num(pageviews.total) : null;
    const whatIf = consentRate && attributable
        ? {
            points,
            conversions: Math.min(unattributed, Math.round((attributable * points) / 100 / consentRate)),
            revenue: Math.min(revUnattr, Math.round(((revAttr * points) / 100 / consentRate) * 100) / 100),
        }
        : null;
    return {
        conversions: { total, attributable, unattributed, attributableShare: total ? attributable / total : null },
        revenue: { total: revAttr + revUnattr, attributable: revAttr, unattributed: revUnattr, currency: full.currency || minimal.currency || null },
        consentRate,
        whatIf,
    };
}

/**
 * Banner experiments, per variant: consent rate and conversions per 1,000
 * page views, compared with the control ("control" by name, otherwise the
 * variant with most traffic).
 * pvRows:   [{ banner_exp, banner_variant, total, full }]
 * convRows: [{ banner_exp, banner_variant, conversions, attributable, revenue_cents }]
 */
export function compareVariants(pvRows, convRows) {
    const byExp = new Map();
    const key = (r) => `${r.banner_exp}\u0000${r.banner_variant}`;
    const conv = new Map(convRows.map((r) => [key(r), r]));
    for (const r of pvRows) {
        const c = conv.get(key(r)) || {};
        const pv = num(r.total);
        const v = {
            variant: r.banner_variant,
            pageviews: pv,
            consentRate: pv ? num(r.full) / pv : null,
            conversions: num(c.conversions),
            attributable: num(c.attributable),
            attributableRevenue: num(c.revenue_cents) / 100,
            per1k: pv ? (num(c.conversions) / pv) * 1000 : null,
            attributablePer1k: pv ? (num(c.attributable) / pv) * 1000 : null,
            smallSample: pv < SMALL_SAMPLE_PAGEVIEWS,
        };
        if (!byExp.has(r.banner_exp)) byExp.set(r.banner_exp, []);
        byExp.get(r.banner_exp).push(v);
    }
    return [...byExp.entries()].map(([id, variants]) => {
        const control = variants.find((v) => v.variant.toLowerCase() === "control")
            || [...variants].sort((a, b) => b.pageviews - a.pageviews)[0];
        for (const v of variants) {
            v.isControl = v === control;
            v.vsControl = v.isControl ? null : {
                consentRatePoints: v.consentRate != null && control.consentRate != null ? (v.consentRate - control.consentRate) * 100 : null,
                attributablePer1kPct: control.attributablePer1k ? ((v.attributablePer1k - control.attributablePer1k) / control.attributablePer1k) * 100 : null,
            };
        }
        variants.sort((a, b) => (b.isControl - a.isControl) || a.variant.localeCompare(b.variant));
        return { id, variants, pageviews: variants.reduce((s, v) => s + v.pageviews, 0) };
    }).sort((a, b) => b.pageviews - a.pageviews);
}
