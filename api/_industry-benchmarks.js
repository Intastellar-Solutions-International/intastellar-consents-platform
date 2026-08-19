/**
 * Static per-industry reference values for the "industry benchmark" shown
 * next to a domain's own consent rate (Analytics overview + Consent tab).
 *
 * These are indicative reference figures, NOT computed from real customer
 * traffic — this platform has no cross-tenant aggregation pipeline (see the
 * one other "industry benchmark" precedent in the product, the hardcoded
 * 65% figure in MarketingReconciliationPanel.js). Update the numbers below
 * as better research/industry-report data becomes available; the shape
 * (value → { label, consentRatePct }) is what the rest of the app depends
 * on, not these specific figures.
 */
export const INDUSTRY_BENCHMARKS = {
    aviation:    { label: "Aviation",              consentRatePct: 41 },
    tourism:     { label: "Tourism & Travel",       consentRatePct: 38 },
    hospitality: { label: "Hospitality",            consentRatePct: 36 },
    ecommerce:   { label: "E-commerce & Retail",    consentRatePct: 45 },
    finance:     { label: "Finance & Insurance",    consentRatePct: 52 },
    healthcare:  { label: "Healthcare",             consentRatePct: 49 },
    saas:        { label: "SaaS & Technology",      consentRatePct: 55 },
    media:       { label: "Media & Publishing",     consentRatePct: 33 },
    education:   { label: "Education",              consentRatePct: 47 },
    real_estate: { label: "Real Estate",            consentRatePct: 40 },
    automotive:  { label: "Automotive",             consentRatePct: 44 },
    other:       { label: "Other",                  consentRatePct: 42 },
};

export function isValidIndustry(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(INDUSTRY_BENCHMARKS, value);
}
