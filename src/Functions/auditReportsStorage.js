/**
 * Client-side index of generated audit PDFs (metadata only — not the file).
 * Replace with API list/register when backend storage exists; keep the same shapes.
 */

const KEY_PREFIX = "intastellar_audit_report_index_v1";

function key(orgId, domain) {
    const d = domain == null ? "" : String(domain);
    return `${KEY_PREFIX}_${orgId}_${encodeURIComponent(d)}`;
}

export function loadAuditReportIndex(orgId, domain) {
    if (orgId == null || domain == null || domain === "") return [];
    try {
        const raw = localStorage.getItem(key(orgId, domain));
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function persist(orgId, domain, entries) {
    localStorage.setItem(key(orgId, domain), JSON.stringify(entries));
}

export function addAuditReportEntry(orgId, domain, entry) {
    const list = loadAuditReportIndex(orgId, domain);
    list.unshift(entry);
    persist(orgId, domain, list);
    return list;
}

export function removeAuditReportEntry(orgId, domain, entryId) {
    const list = loadAuditReportIndex(orgId, domain).filter((e) => e.id !== entryId);
    persist(orgId, domain, list);
    return list;
}

export function replaceAuditReportIndex(orgId, domain, entries) {
    persist(orgId, domain, Array.isArray(entries) ? entries : []);
    return loadAuditReportIndex(orgId, domain);
}
