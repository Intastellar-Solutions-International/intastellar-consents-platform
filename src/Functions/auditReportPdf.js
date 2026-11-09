import API from "../API/api";
import appStorage from "./storage.js";

export const REPORTS = {
    audit: { name: "Consent audit", filename: "Consent_Audit" },
    summary: { name: "Consent summary", filename: "Consent_Summary" },
    snapshot: { name: "Compliance snapshot", filename: "Compliance_Snapshot" },
};

// History entries from before the report types were added say "portfolio_audit".
export function reportTypeOf(entry) {
    return REPORTS[entry?.reportType] ? entry.reportType : "audit";
}

export function isAuditEntry(entry) {
    return reportTypeOf(entry) === "audit";
}

export function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

export function reportFilename(type, domain, fromYmd, toYmd) {
    return `${REPORTS[type].filename}_${domain}_${fromYmd}_to_${toYmd}.pdf`;
}

/** Index entry for a generated report (see auditReportsStorage). */
export function newReportEntry(type, domain, fromYmd, toYmd) {
    const id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return {
        id,
        domain,
        fromDate: fromYmd,
        toDate: toYmd,
        createdAt: new Date().toISOString(),
        reportType: type,
        title: `${REPORTS[type].name} · ${domain}`,
    };
}

/** Resolves { ok: true, blob } or { ok: false, error }; an expired login redirects. */
export async function requestReportPdf(platformId, type, domain, fromYmd, toYmd) {
    if (!API[platformId]?.reportPdf) throw new Error("Export not configured");

    const response = await fetch(API[platformId].reportPdf.url, {
        method: API[platformId].reportPdf.method,
        headers: { ...API[platformId].reportPdf.headers },
        body: JSON.stringify({ reportType: type, domain, fromDate: fromYmd, toDate: toYmd }),
    });

    if (response.status === 401 || response.status === 403) {
        appStorage.removeItem("globals");
        window.location.href = "/login";
        return { ok: false };
    }

    if (response.headers.get("content-type")?.includes("application/pdf")) {
        const blob = await response.blob();
        return { ok: true, blob };
    }

    // A failing server can answer with an HTML page; never show that to the user.
    let msg = `the server responded with an error (${response.status})`;
    try {
        const data = JSON.parse(await response.text());
        if (data?.error) msg = data.error;
    } catch {
        /* not JSON: keep the status message */
    }
    return { ok: false, error: msg };
}
