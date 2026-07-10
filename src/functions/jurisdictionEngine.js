import { EU_EEA_UK, FRAMEWORK_IDS } from "../components/AuditSnapshotCard/complianceRegions.js";

const COUNTRY_FRAMEWORK_MAP = {
    BR: ["LGPD"],
    US: ["CCPA"],
    ZA: ["POPIA"],
    TH: ["PDPA"],
    SG: ["PDPA"],
};

export const BANNER_TYPE_BY_FRAMEWORK = {
    GDPR:  "opt-in",
    LGPD:  "opt-in",
    PDPA:  "opt-in",
    POPIA: "opt-in",
    CCPA:  "opt-out",
};

export const FRAMEWORK_LABELS = {
    GDPR:  "GDPR (EU / EEA / UK)",
    LGPD:  "LGPD (Brazil)",
    CCPA:  "CCPA / CPRA (California, USA)",
    POPIA: "POPIA (South Africa)",
    PDPA:  "PDPA (Thailand / Singapore)",
};

export const FRAMEWORK_DESCRIPTIONS = {
    GDPR:  "Applies to visitors from EU member states, EEA countries, and the United Kingdom.",
    LGPD:  "Brazil's Lei Geral de Proteção de Dados. Requires opt-in consent, similar to GDPR.",
    CCPA:  "California Consumer Privacy Act. Requires an opt-out of sale / share mechanism for US visitors.",
    POPIA: "South Africa's Protection of Personal Information Act. Requires lawful processing conditions.",
    PDPA:  "Data protection acts in Thailand and Singapore. Require opt-in consent from covered visitors.",
};

export const FRAMEWORK_COUNTRY_COUNTS = {
    GDPR:  33,
    LGPD:  1,
    CCPA:  1,
    POPIA: 1,
    PDPA:  2,
};

export const DSR_DEADLINES_DAYS = {
    GDPR:  30,
    LGPD:  15,
    PDPA:  30,
    POPIA: 30,
    CCPA:  45,
};

/**
 * Returns frameworks and default banner type for a given ISO alpha-2 country code.
 * @param {string} alpha2
 * @returns {{ frameworks: string[], bannerType: "opt-in"|"opt-out"|"notice-only" }}
 */
export function getFrameworksForCountry(alpha2) {
    const code = String(alpha2 || "").toUpperCase().trim();
    if (!code) return { frameworks: [], bannerType: "notice-only" };

    const explicit = COUNTRY_FRAMEWORK_MAP[code];
    if (explicit) {
        const bannerType = explicit.reduce((acc, fw) => {
            const t = BANNER_TYPE_BY_FRAMEWORK[fw] || "notice-only";
            if (t === "opt-in") return "opt-in";
            if (acc === "notice-only" && t === "opt-out") return "opt-out";
            return acc;
        }, "notice-only");
        return { frameworks: explicit, bannerType };
    }

    if (EU_EEA_UK.has(code)) {
        return { frameworks: ["GDPR"], bannerType: "opt-in" };
    }

    return { frameworks: [], bannerType: "notice-only" };
}

export { FRAMEWORK_IDS };
