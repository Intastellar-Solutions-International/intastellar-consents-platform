import { EU_EEA_UK, FRAMEWORK_IDS } from "../Components/AuditSnapshotCard/complianceRegions.js";

const COUNTRY_FRAMEWORK_MAP = {
    BR: ["LGPD"],
    US: ["CCPA", "CDPA", "CPA", "UCPA", "CTDPA"],
    ZA: ["POPIA"],
    TH: ["PDPA"],
    SG: ["PDPA"],
    AU: ["APA"],
    SA: ["PDPL"],
    CA: ["PIPEDA", "LAW25"],
};

export const BANNER_TYPE_BY_FRAMEWORK = {
    GDPR:   "opt-in",
    LGPD:   "opt-in",
    PDPA:   "opt-in",
    POPIA:  "opt-in",
    CCPA:   "opt-out",
    CDPA:   "opt-out",
    CPA:    "opt-out",
    UCPA:   "opt-out",
    CTDPA:  "opt-out",
    APA:    "opt-out",
    PDPL:   "opt-in",
    PIPEDA: "opt-in",
    LAW25:  "opt-in",
};

export const FRAMEWORK_LABELS = {
    GDPR:   "GDPR (EU / EEA / UK)",
    LGPD:   "LGPD (Brazil)",
    CCPA:   "CCPA / CPRA (California, USA)",
    CDPA:   "CDPA (Virginia, USA)",
    CPA:    "CPA (Colorado, USA)",
    UCPA:   "UCPA (Utah, USA)",
    CTDPA:  "CTDPA (Connecticut, USA)",
    POPIA:  "POPIA (South Africa)",
    PDPA:   "PDPA (Thailand / Singapore)",
    APA:    "Privacy Act (Australia)",
    PDPL:   "PDPL (Saudi Arabia)",
    PIPEDA: "PIPEDA (Canada)",
    LAW25:  "Law 25 (Quebec, Canada)",
};

export const FRAMEWORK_DESCRIPTIONS = {
    GDPR:   "Applies to visitors from EU member states, EEA countries, and the United Kingdom.",
    LGPD:   "Brazil's Lei Geral de Proteção de Dados. Requires opt-in consent, similar to GDPR.",
    CCPA:   "California Consumer Privacy Act. Requires an opt-out of sale / share mechanism for US visitors.",
    CDPA:   "Virginia Consumer Data Protection Act. Applies to businesses processing data of Virginia residents. Requires opt-out of data sale and explicit consent for sensitive data.",
    CPA:    "Colorado Privacy Act. Applies to businesses processing data of Colorado residents. Requires opt-out rights and support for universal opt-out signals.",
    UCPA:   "Utah Consumer Privacy Act. Applies to businesses processing data of Utah residents. Requires opt-out of targeted advertising and sale of personal data.",
    CTDPA:  "Connecticut Data Privacy Act. Applies to businesses processing data of Connecticut residents. Requires opt-out and data minimisation obligations.",
    POPIA:  "South Africa's Protection of Personal Information Act. Requires lawful processing conditions.",
    PDPA:   "Data protection acts in Thailand and Singapore. Require opt-in consent from covered visitors.",
    APA:    "Australia's Privacy Act 1988 and Australian Privacy Principles. Applies to organisations handling personal information of Australian residents.",
    PDPL:   "Saudi Arabia's Personal Data Protection Law. Requires explicit consent for collection and processing of personal data of Saudi residents.",
    PIPEDA: "Canada's Personal Information Protection and Electronic Documents Act. Requires meaningful consent for collection, use, and disclosure of personal information.",
    LAW25:  "Quebec's Law 25 modernises privacy rules for businesses operating in Quebec, requiring explicit consent, privacy impact assessments, and transparency obligations.",
};

export const FRAMEWORK_COUNTRY_COUNTS = {
    GDPR:   33,
    LGPD:   1,
    CCPA:   1,
    CDPA:   1,
    CPA:    1,
    UCPA:   1,
    CTDPA:  1,
    POPIA:  1,
    PDPA:   2,
    APA:    1,
    PDPL:   1,
    PIPEDA: 1,
    LAW25:  1,
};

export const DSR_DEADLINES_DAYS = {
    GDPR:   30,
    LGPD:   15,
    PDPA:   30,
    POPIA:  30,
    CCPA:   45,
    CDPA:   45,
    CPA:    45,
    UCPA:   45,
    CTDPA:  45,
    APA:    30,
    PDPL:   30,
    PIPEDA: 30,
    LAW25:  30,
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
