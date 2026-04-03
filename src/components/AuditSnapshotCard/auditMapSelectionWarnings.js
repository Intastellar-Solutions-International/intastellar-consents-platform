import { EU_EEA_UK, FRAMEWORK_IDS, frameworksForAuditRow } from "./complianceRegions.js";

/**
 * @param {string} code
 * @param {string} [locale]
 */
export function auditMapCountryDisplayName(code, locale) {
    const c = String(code || "").toUpperCase();
    if (c.length !== 2) return code;
    try {
        const loc =
            typeof locale === "string" && locale.trim().length > 1 ? locale.trim().replace(/_/g, "-") : "en";
        const dn = new Intl.DisplayNames([loc], { type: "region" });
        return dn.of(c) || c;
    } catch {
        return c;
    }
}

function frameworkAppliesToCountry(framework, countryCode) {
    const cc = String(countryCode || "").toUpperCase();
    if (framework === "CCPA") return cc === "US";
    if (framework === "LGPD") return cc === "BR";
    if (framework === "POPIA") return cc === "ZA";
    if (framework === "GDPR") return EU_EEA_UK.has(cc);
    return false;
}

/**
 * @param {null | { kind: 'country', code: string } | { kind: 'framework', fw: string }} selection
 * @param {{ regionStatus: Record<string, { status: string, source?: string }>, issues?: object[], locale?: string }} ctx
 * @returns {Array<{ severity: string, code: string, text: string }>}
 */
export function buildMapDetailWarnings(selection, ctx) {
    const { regionStatus, issues = [], locale } = ctx;
    const list = [];
    const seen = new Set();
    const add = (severity, code, text) => {
        const k = `${code}|${text}`;
        if (seen.has(k)) return;
        seen.add(k);
        list.push({ severity, code, text });
    };

    if (!selection) return list;

    if (selection.kind === "country") {
        const code = String(selection.code).toUpperCase();
        for (const issue of issues) {
            if (!issue || typeof issue !== "object") continue;
            const icc = issue.country_code != null ? String(issue.country_code).toUpperCase() : "";
            if (icc && icc === code) {
                add(
                    String(issue.severity || "watch"),
                    String(issue.code || "ISSUE"),
                    String(issue.detail || "Review suggested.")
                );
                continue;
            }
            if (issue.code === "LOGGING_GAP" && issue.framework && frameworkAppliesToCountry(issue.framework, code)) {
                add(
                    String(issue.severity || "watch"),
                    "LOGGING_GAP",
                    String(
                        issue.detail ||
                            `Traffic may reach ${issue.framework} jurisdictions, but no consent rows in the audit sample implied ${issue.framework} for this period.`
                    )
                );
            }
        }

        const geoRow = { country_code: code, regulation_applied: "" };
        for (const fw of frameworksForAuditRow(geoRow)) {
            const st = regionStatus?.[fw];
            if (!st) continue;
            if (st.status === "none") {
                add(
                    "info",
                    "NO_SAMPLE",
                    `${fw}: this country falls under ${fw} — no matching consent rows appeared in the audit sample for the selected period.`
                );
            } else if (st.status === "watch") {
                add(
                    "watch",
                    "WATCH",
                    `${fw}: review suggested (${st.source === "api" ? "compliance snapshot" : "coverage analysis"}).`
                );
            } else if (st.status === "risk") {
                add(
                    "risk",
                    "RISK",
                    `${fw}: elevated attention (${st.source === "api" ? "compliance snapshot" : "coverage analysis"}).`
                );
            } else if (st.status === "observed") {
                add(
                    "info",
                    "OBSERVED",
                    `${fw}: audit sample includes consent activity tied to this framework.`
                );
            }
        }
        return list;
    }

    if (selection.kind === "framework") {
        const fw = selection.fw;
        if (!FRAMEWORK_IDS.includes(fw)) return list;

        for (const issue of issues) {
            if (!issue || typeof issue !== "object") continue;
            if (String(issue.framework || "") === fw) {
                add(
                    String(issue.severity || "watch"),
                    String(issue.code || "ISSUE"),
                    String(issue.detail || "Review suggested.")
                );
            }
        }

        const st = regionStatus?.[fw];
        if (st) {
            if (st.status === "none") {
                add(
                    "info",
                    "NO_SAMPLE",
                    `No audit rows in this period implied ${fw}. If you have traffic from ${fw} regions, verify banner and logging.`
                );
            } else if (st.status === "watch") {
                add(
                    "watch",
                    "WATCH",
                    `${fw}: review suggested (${st.source === "api" ? "compliance snapshot" : "coverage analysis"}).`
                );
            } else if (st.status === "risk") {
                add(
                    "risk",
                    "RISK",
                    `${fw}: elevated attention (${st.source === "api" ? "compliance snapshot" : "coverage analysis"}).`
                );
            } else if (st.status === "observed") {
                add("info", "OBSERVED", `${fw}: consent sample indicates logging for this framework.`);
            }
        }
    }

    return list;
}
