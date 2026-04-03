/** EU member states + EEA (IS, LI, NO) + UK — for inferring GDPR-relevant traffic from country_code. */
const EU_EEA_UK = new Set([
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
    "IS",
    "LI",
    "NO",
    "GB",
    "GI",
    "IM",
]);

// ISO 3166-1 numeric codes for EU + EEA + UK
export const EU_EEA_UK_NUMERIC = [
    40,  // Austria
    56,  // Belgium
    100, // Bulgaria
    191, // Croatia
    196, // Cyprus
    203, // Czech Republic
    208, // Denmark
    233, // Estonia
    246, // Finland
    250, // France
    276, // Germany
    300, // Greece
    348, // Hungary
    372, // Ireland
    380, // Italy
    428, // Latvia
    440, // Lithuania
    442, // Luxembourg
    470, // Malta
    528, // Netherlands
    616, // Poland
    620, // Portugal
    642, // Romania
    703, // Slovakia
    705, // Slovenia
    724, // Spain
    752, // Sweden
    // EEA
    352, // Iceland
    438, // Liechtenstein
    578, // Norway
    // UK
    826, // United Kingdom
    292, // Gibraltar
    833, // Isle of Man
];

const FRAMEWORK_IDS = ["GDPR", "LGPD", "CCPA", "POPIA"];

/**
 * Which frameworks a single audit row suggests (regulation_applied first, then country inference).
 * @param {object} row
 * @returns {Set<string>}
 */
export function frameworksForAuditRow(row) {
    const reg = String(row?.regulation_applied ?? "").toUpperCase();
    const cc = String(row?.country_code ?? "").toUpperCase().trim();
    const out = new Set();
    if (reg.includes("GDPR")) out.add("GDPR");
    if (reg.includes("LGPD")) out.add("LGPD");
    if (reg.includes("CCPA") || reg.includes("CPRA")) out.add("CCPA");
    if (reg.includes("POPIA")) out.add("POPIA");
    if (out.size > 0) return out;
    if (cc === "BR") out.add("LGPD");
    else if (cc === "US") out.add("CCPA");
    else if (cc === "ZA") out.add("POPIA");
    else if (EU_EEA_UK.has(cc)) out.add("GDPR");
    return out;
}

/**
 * @param {object[]} rows — audit log rows for the selected period
 * @param {Record<string, 'ok'|'watch'|'risk'>|null|undefined} riskFromApi — optional backend overrides
 * @returns {Record<string, { status: 'observed'|'none'|'watch'|'risk', source: 'sample'|'api' }>}
 */
export function deriveComplianceRegionStatus(rows, riskFromApi) {
    const observed = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
        for (const f of frameworksForAuditRow(row)) observed.add(f);
    }
    /** @type {Record<string, { status: 'observed'|'none'|'watch'|'risk', source: 'sample'|'api' }>} */
    const result = {};
    for (const id of FRAMEWORK_IDS) {
        const api = riskFromApi?.[id];
        if (api === "risk" || api === "watch") {
            result[id] = { status: api, source: "api" };
        } else if (api === "ok") {
            result[id] = { status: "observed", source: "api" };
        } else {
            result[id] = {
                status: observed.has(id) ? "observed" : "none",
                source: "sample",
            };
        }
    }
    return result;
}

export { FRAMEWORK_IDS, EU_EEA_UK };
