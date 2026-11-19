// The two consent percentages the products show are different metrics, and
// used to have near-identical names ("Acceptance" in the CMP, "Consent rate"
// in Analytics) — so seeing 45% in one and 28% in the other looked like a
// bug. One definition each, used for every label, hint and tooltip.

export const BANNER_ACCEPTANCE = {
    label: "Banner acceptance rate",
    short: "Banner acceptance",
    hint: "Not the same as Analytics' statistics consent rate",
    description: "Share of cookie-banner decisions where the visitor accepted. Measured by the CMP for every visitor who answers the banner.",
};

export const STATISTICS_CONSENT = {
    label: "Statistics consent rate",
    short: "Statistics consent",
    hint: "Visitors who allowed statistics cookies — not the banner acceptance rate",
    description: "Share of Analytics events from visitors who allowed statistics cookies, so Analytics can follow them across pages. Usually lower than the banner acceptance rate: it only counts statistics consent, and weighs every page view.",
};
