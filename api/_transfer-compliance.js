/**
 * GDPR Chapter V status of a vendor: which transfer mechanism it relies on and
 * whether a data processing agreement is in place.
 *
 * The scanner's catalogue suggests a mechanism for known vendors, but that is
 * only a starting point: certifications lapse and contracts differ, so it
 * counts as unconfirmed until the organisation records it. Whether a DPA
 * exists can only ever come from the organisation.
 */
export const MECHANISMS = [
    { id: "dpf", label: "EU-US Data Privacy Framework", short: "DPF" },
    { id: "sccs", label: "Standard Contractual Clauses", short: "SCCs" },
    { id: "adequacy", label: "Adequacy decision", short: "Adequacy" },
    { id: "bcr", label: "Binding Corporate Rules", short: "BCRs" },
    { id: "none", label: "None", short: "None" },
];
export const DPA_STATES = [
    { id: "signed", label: "In place" },
    { id: "missing", label: "Not in place" },
];

const CATALOGUE = { "EU-US Data Privacy Framework": "dpf", "Standard Contractual Clauses": "sccs", "Adequacy Decision": "adequacy" };
const mechanismById = (id) => MECHANISMS.find((m) => m.id === id) || null;

/**
 * status: "ok" confirmed mechanism · "unconfirmed" catalogue suggestion only ·
 *         "problem" a transfer with no mechanism · "not_required" stays in the EU
 * A vendor outside the EU never counts as not required, even if the catalogue
 * lists it as EEA, because the scan saw its data leave the EU.
 */
export function vendorChapterV(vendor, record) {
    const required = vendor.region !== "eu";
    const dpa = record?.dpa_status || null;
    const needsDpa = dpa !== "signed";
    const confirmed = mechanismById(record?.mechanism);
    const suggested = mechanismById(CATALOGUE[vendor.transferMechanism]);
    let transfer;
    if (confirmed && confirmed.id !== "none") transfer = { status: "ok", mechanism: confirmed };
    else if (confirmed) transfer = { status: required ? "problem" : "not_required", mechanism: confirmed };
    else if (!required) transfer = { status: "not_required", mechanism: null };
    else if (suggested) transfer = { status: "unconfirmed", mechanism: suggested };
    else transfer = { status: "problem", mechanism: null };
    return { ...transfer, required, suggested, dpa, needsDpa, needsAction: needsDpa || transfer.status === "problem" || transfer.status === "unconfirmed" };
}

export function chapterVSummary(vendors, records) {
    const rows = vendors.map((v) => vendorChapterV(v, records?.[v.vendor]));
    return {
        problem: rows.filter((r) => r.status === "problem").length,
        unconfirmed: rows.filter((r) => r.status === "unconfirmed").length,
        withoutDpa: rows.filter((r) => r.needsDpa).length,
    };
}

/** Plain-text values for the CSV export. */
export function chapterVLabels(vendor, record) {
    const c = vendorChapterV(vendor, record);
    const name = c.mechanism?.label || "";
    const transfer = c.status === "not_required" ? (name || "Not required (EU)") : c.status === "unconfirmed" ? `${name} (unconfirmed)` : c.status === "problem" ? "None documented" : name;
    return { transfer, dpa: DPA_STATES.find((d) => d.id === c.dpa)?.label || "Unknown" };
}
