/** Deterministic 0..1 pseudo-random from index (stable across re-renders). */
export function demoRandom01(seed) {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
}

export const DEMO_REGULATIONS = ["GDPR", "CCPA", "LGPD", "POPIA"];

/** Plausible country pools per regulation for demo display. */
export const DEMO_REGULATION_COUNTRIES = {
    GDPR: ["DE", "FR", "NL", "SE", "DK", "IE", "ES", "IT"],
    CCPA: ["US"],
    LGPD: ["BR"],
    POPIA: ["ZA"],
};

const CONSENT_TYPES = ["necessary", "functional", "statics", "marketing"];

function pick(arr, seed) {
    if (!arr?.length) return "—";
    const i = Math.floor(demoRandom01(seed) * arr.length) % arr.length;
    return arr[i];
}

/**
 * @param {number} index
 * @param {object|null} base - optional API row to preserve url, timestamps, ids, etc.
 */
export function buildDemoConsentRecord(index, base = null) {
    const regulation = pick(DEMO_REGULATIONS, index * 17 + 3);
    const pool = DEMO_REGULATION_COUNTRIES[regulation] || ["EU"];
    const country_code = pick(pool, index * 23 + 5);

    const consent = CONSENT_TYPES.map((type, j) => {
        if (type === "necessary") {
            return { type, checked: "checked" };
        }
        const accepted = demoRandom01(index * 31 + j * 7 + 11) > 0.42;
        return { type, checked: accepted ? "checked" : "" };
    });

    const hoursAgo = (index * 3 + Math.floor(demoRandom01(index + 99) * 12)) % 168;
    const ts = new Date();
    ts.setHours(ts.getHours() - hoursAgo);

    const b = base && typeof base === "object" ? base : {};

    return {
        ...b,
        regulation_applied: regulation,
        country_code,
        consent,
        uid: b.uid != null && b.uid !== "" ? b.uid : `demo-${100000 + index}`,
        url: b.url || `https://demo-shop-${(index % 4) + 1}.example${["/product", "/blog", "/checkout", "/"][index % 4]}`,
        referrer: b.referrer || ["https://www.google.com/", "https://duckduckgo.com/", "https://news.example/"][index % 3],
        consents_timestamp: b.consents_timestamp || ts.toISOString(),
        domain: b.domain || "demo.example",
        banner_policy_id: b.banner_policy_id != null ? b.banner_policy_id : 9000 + (index % 40),
        code_version: b.code_version || "2.4.0",
        github_link: b.github_link || null,
    };
}

export function buildDemoConsentList(count = 28) {
    return Array.from({ length: count }, (_, i) => buildDemoConsentRecord(i, null));
}
