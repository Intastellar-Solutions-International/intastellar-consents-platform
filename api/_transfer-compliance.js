/**
 * GDPR Chapter V status of a vendor: which transfer mechanism it relies on and
 * whether a data processing agreement is in place.
 *
 * The scanner's catalogue suggests a mechanism for known vendors, but that is
 * only a starting point: certifications lapse and contracts differ, so it
 * counts as unconfirmed until the organisation records it. Whether a DPA
 * exists can only ever come from the organisation.
 */
const CATEGORY_RISK = {
    fingerprinting: { risk: "high" }, advertising: { risk: "high" }, analytics: { risk: "medium" }, social: { risk: "medium" },
    functional: { risk: "low" }, cdn: { risk: "low" }, cmp: { risk: "none" }, "third-party": { risk: "medium" },
};
export const RISK_RANK = { high: 3, medium: 2, low: 1, none: 0 };

/** "eu-hosted": a non-EU company serving this host from the EU. */
export function hostRegion(host) {
    if ((host.dataRegion || "non-eu") === "eu") return "eu";
    return host.hostedInEU ? "eu-hosted" : "non-eu";
}

function vendorRegion(hosts) {
    const regions = new Set(hosts.map(hostRegion));
    if (regions.size === 1) return [...regions][0];
    return regions.has("non-eu") ? "mixed" : "eu-hosted";
}

/**
 * Group scanned transfers (one per host) into vendors: every *.clarity.ms host
 * becomes one "Microsoft Clarity" row.
 * region: "eu", "non-eu", "eu-hosted", or "mixed" when the hosts disagree.
 * consentPhase: "pre" when any host was contacted before the scanner granted
 * consent, "post" when all were after, null when the scan has no phase tags.
 */
export function groupTransfersByVendor(transfers, categoryMeta = CATEGORY_RISK) {
    const byVendor = new Map();
    for (const t of transfers || []) {
        const key = t.service || t.host;
        if (!byVendor.has(key)) byVendor.set(key, { vendor: key, hosts: [] });
        byVendor.get(key).hosts.push(t);
    }
    return [...byVendor.values()].map((v) => {
        // A vendor's category is its riskiest host's category (hosts of one vendor rarely differ).
        const category = v.hosts
            .map((h) => h.category || "third-party")
            .sort((a, b) => (RISK_RANK[categoryMeta[b]?.risk] ?? 2) - (RISK_RANK[categoryMeta[a]?.risk] ?? 2))[0];
        const phases = v.hosts.map((h) => h.consentPhase);
        const consentPhase = phases.includes("pre") ? "pre" : phases.every((p) => p === "post") ? "post" : null;
        const first = (field) => v.hosts.find((h) => h[field])?.[field] || null;
        return {
            ...v,
            category,
            risk: categoryMeta[category]?.risk || "medium",
            region: vendorRegion(v.hosts),
            consentPhase,
            dataCountries: [...new Set(v.hosts.map((h) => h.dataCountry).filter(Boolean))],
            description: first("description"),
            privacyUrl: first("privacyUrl"),
            bannerCategory: first("bannerCategory"),
            legalBasis: first("legalBasis"),
            transferMechanism: first("transferMechanism"),
            purposes: [...new Set(v.hosts.flatMap((h) => h.purposes || []))],
        };
    });
}

/** The counts above the vendor table, all from the same grouped list as the table. */
export function vendorTotals(vendors) {
    const byCategory = {};
    for (const v of vendors) byCategory[v.category] = (byCategory[v.category] || 0) + 1;
    return {
        vendors: vendors.length,
        hosts: vendors.reduce((n, v) => n + v.hosts.length, 0),
        outsideEu: vendors.filter((v) => v.region === "non-eu" || v.region === "mixed").length,
        preConsent: vendors.filter((v) => v.consentPhase === "pre").length,
        byCategory,
    };
}

export const MECHANISMS = [
    { id: "dpf", label: "EU-US Data Privacy Framework", short: "DPF" },
    { id: "sccs", label: "Standard Contractual Clauses", short: "SCCs" },
    { id: "adequacy", label: "Adequacy decision", short: "Adequacy" },
    { id: "bcr", label: "Binding Corporate Rules", short: "BCRs" },
    { id: "none", label: "None", short: "None" },
];
export const DPA_STATES = [
    { id: "unknown", label: "Unknown" },
    { id: "requested", label: "Requested" },
    { id: "signed", label: "Signed" },
    { id: "not_required", label: "Not required" },
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
    const needsDpa = dpa !== "signed" && dpa !== "not_required";
    const confirmed = mechanismById(record?.mechanism);
    const suggested = mechanismById(CATALOGUE[vendor.transferMechanism]);
    let transfer;
    // An EU vendor has no transfer to cover, whatever was once recorded for it.
    if (!required) transfer = { status: "not_required", mechanism: null };
    else if (confirmed && confirmed.id !== "none") transfer = { status: "ok", mechanism: confirmed };
    else if (confirmed) transfer = { status: "problem", mechanism: confirmed };
    else if (suggested) transfer = { status: "unconfirmed", mechanism: suggested };
    else transfer = { status: "problem", mechanism: null };
    // A mechanism only counts as confirmed once someone records when they checked it.
    const dateMissing = required && Boolean(confirmed) && confirmed.id !== "none" && !record?.mechanism_confirmed_at;
    return { ...transfer, required, suggested, dpa, needsDpa, dateMissing, needsAction: needsDpa || dateMissing || transfer.status === "problem" || transfer.status === "unconfirmed" };
}

export function chapterVSummary(vendors, records) {
    const rows = vendors.map((v) => vendorChapterV(v, records?.[v.vendor]));
    return {
        problem: rows.filter((r) => r.status === "problem").length,
        unconfirmed: rows.filter((r) => r.status === "unconfirmed" || r.dateMissing).length,
        withoutDpa: rows.filter((r) => r.needsDpa).length,
    };
}

// Advertising here is the same group the PDF reports use.
const CONSENT_RISK_CATEGORIES = ["advertising", "fingerprinting", "social", "analytics"];
const FINDING_RANK = { consent: 0, mechanism: 1, dpa: 2, unconfirmed: 3 };

/**
 * Open findings per vendor, highest impact first: tracking before consent,
 * then no transfer mechanism, then no confirmed DPA, then a mechanism that is
 * only a catalogue suggestion. Within a kind, the vendor with most hosts leads.
 * Consent findings need a scan with phase tags; older scans can't tell.
 */
export function complianceFindings(vendors, records, { phaseKnown = false } = {}) {
    const findings = [];
    for (const v of vendors) {
        const chapter = vendorChapterV(v, records?.[v.vendor]);
        const add = (kind, title, hosts = v.hosts.length) => findings.push({ kind, vendor: v.vendor, category: v.category, hosts, title });
        if (phaseKnown && v.consentPhase === "pre" && CONSENT_RISK_CATEGORIES.includes(v.category)) {
            const hosts = v.hosts.filter((h) => h.consentPhase === "pre").length;
            add("consent", `${v.vendor} loads ${hosts} host${hosts === 1 ? "" : "s"} before consent`, hosts);
        }
        // "None" is what someone recorded; otherwise we just have nothing on file,
        // which isn't the same as the transfer being unlawful.
        if (chapter.status === "problem") add("mechanism", chapter.mechanism?.id === "none" ? `${v.vendor} has no transfer mechanism` : `No transfer mechanism on record for ${v.vendor}`);
        if (chapter.needsDpa) add("dpa", `No confirmed DPA with ${v.vendor}`);
        if (chapter.status === "unconfirmed" || chapter.dateMissing) add("unconfirmed", `${v.vendor}'s transfer mechanism is not confirmed`);
    }
    return findings.sort((a, b) => FINDING_RANK[a.kind] - FINDING_RANK[b.kind] || b.hosts - a.hosts || a.vendor.localeCompare(b.vendor));
}

/**
 * level: "critical" tracking before consent · "attention" other open findings ·
 * "healthy" none · "unknown" no scan, or a scan too old to say what loaded
 * before consent. Healthy is never claimed on missing data.
 */
export function complianceStatus(findings, { scanned = true, phaseKnown = true } = {}) {
    const breakdown = { consent: 0, mechanism: 0, dpa: 0, unconfirmed: 0 };
    for (const f of findings) breakdown[f.kind] += 1;
    const count = findings.length;
    let level = "healthy";
    if (!scanned) level = "unknown";
    else if (breakdown.consent) level = "critical";
    else if (count) level = "attention";
    else if (!phaseKnown) level = "unknown";
    return { level, count, breakdown, scanned };
}

/** What an issue count is made of, for tooltips. Only tracking vendors count as a consent issue. */
export function issueBreakdownText(breakdown) {
    const parts = [
        [breakdown.consent, "tracking before consent"],
        [breakdown.mechanism, "no mechanism on record"],
        [breakdown.unconfirmed, "mechanism unconfirmed"],
        [breakdown.dpa, "no confirmed DPA"],
    ].filter(([n]) => n).map(([n, label]) => `${n} ${label}`);
    return parts.length ? `${parts.join(" + ")}. One vendor can have several issues.` : "No open issues in the latest scan.";
}

/** Status and findings for one scan response from /api/pre-consent-transfers. */
export function scanCompliance(scan, records) {
    const scanned = Boolean(scan && !scan.error && scan.scanned_at);
    const vendors = scanned ? groupTransfersByVendor(scan.pre_consent_transfers) : [];
    const phaseKnown = scan?.consent_phase_known === true;
    const findings = complianceFindings(vendors, records, { phaseKnown });
    return { ...complianceStatus(findings, { scanned, phaseKnown: phaseKnown || !vendors.length }), findings };
}

/** Plain-text values for the CSV export. */
export function chapterVLabels(vendor, record) {
    const c = vendorChapterV(vendor, record);
    const name = c.mechanism?.label || "";
    const transfer = c.status === "not_required" ? (name || "Not required (EU)") : c.status === "unconfirmed" ? `${name} (unconfirmed)` : c.status === "problem" ? (c.mechanism?.id === "none" ? "None" : "Not documented") : name;
    return { transfer, dpa: DPA_STATES.find((d) => d.id === c.dpa)?.label || "Unknown" };
}
