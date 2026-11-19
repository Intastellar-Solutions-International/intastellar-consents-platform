// Privacy statements shown in the product. Each one must stay literally
// true — change the wording here (not at call sites) if the facts change.
//
// DATA_RESIDENCY: everything that *stores* customer data is in the EU —
// Postgres (AWS eu-central-1, Frankfurt), the PHP consent-record backend
// (apis.intastellarsolutions.com) and the Vercel Blob store (fra1; the old
// US store was migrated, confirmed 2026-11-19). Some functions still *run*
// in the US (cookie scanners, the public banner-scan endpoint) without
// storing visitor data, so the claim is "stored", never "processed only".
export const DATA_RESIDENCY = {
    label: "Data stored in the EU",
    description: "Consent records, analytics data and uploaded files are stored on servers in the EU.",
};

// The analytics tracker sets no cookies until the visitor consents
// (since 2026-11-12); visits without consent are counted anonymously.
export const NO_COOKIES_BEFORE_CONSENT = "Analytics sets no tracking cookies before consent";
