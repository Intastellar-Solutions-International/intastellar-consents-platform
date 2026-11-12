/**
 * Printable documents for the audit log: the filtered report and the receipt
 * for one consent. They open in a new window and go through the browser's
 * print dialog, where "Save as PDF" makes the file. No imports, so
 * test/audit-log-format.test.mjs can evaluate this file on its own.
 */

export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const PRINT_CSS = `
    * { box-sizing: border-box; }
    body { font: 12px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p.meta { margin: 0 0 16px; color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid #ddd; word-break: break-word; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
    dl { display: grid; grid-template-columns: 12em 1fr; gap: 6px 16px; margin: 0; }
    dt { color: #555; }
    dd { margin: 0; word-break: break-word; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .note { margin-top: 20px; color: #555; font-size: 11px; }
    @page { margin: 14mm; }
    @media print { body { margin: 0; } thead { display: table-header-group; } tr { break-inside: avoid; } }
`;

const LABELS = {
    time_utc: "Time (UTC)",
    uid: "UID",
    domain: "Domain",
    country: "Country",
    state: "State / region",
    language: "Language",
    method: "Method",
    framework: "Framework applied",
    necessary: "Necessary",
    functional: "Functional",
    analytics: "Analytics",
    marketing: "Marketing",
    page: "Page",
    referrer: "Referrer",
    transfer: "Data transfer",
    banner_version: "Banner version",
    banner_config_version: "Banner config fingerprint",
    policy_schema: "Policy schema",
    tcf_cmp_version: "TCF CMP version",
    tcf_policy_version: "TCF policy version",
    tcf_vendor_list_version: "TCF vendor list version",
    shopify_consent_id: "Shopify consent ID",
    bot_check: "Bot check",
    bot_reason: "Bot reason",
};

function page(title, body) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${body}<script>window.addEventListener("load",function(){window.print();});</script></body></html>`;
}

/** Receipt for one consent: every recorded field, plus the fingerprint of the exported record. */
export function receiptHtml(record, { fingerprint = "", generatedAt = new Date().toISOString(), company = "" } = {}) {
    const rows = Object.entries(record)
        .filter(([, v]) => v !== "" && v != null)
        .map(([k, v]) => `<dt>${escapeHtml(LABELS[k] || k)}</dt><dd${k === "uid" ? ' class="mono"' : ""}>${escapeHtml(v)}</dd>`)
        .join("");
    return page(`Consent receipt ${record.uid || ""}`, `
        <h1>Consent receipt</h1>
        <p class="meta">${company ? `${escapeHtml(company)} · ` : ""}${escapeHtml(record.domain)} · generated ${escapeHtml(generatedAt)}</p>
        <dl>${rows}</dl>
        <p class="note">Record of a consent decision as stored by Intastellar Consents (GDPR Art. 7(1)).
        Times are UTC.${fingerprint ? ` SHA-256 of this record as exported: <span class="mono">${escapeHtml(fingerprint)}</span>.` : ""}</p>
    `);
}

const REPORT_COLUMNS = ["time_utc", "uid", "country", "method", "framework", "functional", "analytics", "marketing", "page", "banner_version", "bot_check"];

/** Report of the filtered records: a header with what was filtered, then one row per consent. */
export function reportHtml(records, { title = "Consent audit log", scope = "", generatedAt = new Date().toISOString(), total = records.length } = {}) {
    const head = REPORT_COLUMNS.map((k) => `<th>${escapeHtml(LABELS[k])}</th>`).join("");
    const body = records.map((r) => `<tr>${REPORT_COLUMNS.map((k) => `<td${k === "uid" ? ' class="mono"' : ""}>${escapeHtml(r[k])}</td>`).join("")}</tr>`).join("");
    const partial = total > records.length ? ` (the first ${records.length} of ${total})` : "";
    return page(title, `
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml(scope)}<br>${records.length} records${escapeHtml(partial)} · generated ${escapeHtml(generatedAt)} · times in UTC</p>
        <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    `);
}
