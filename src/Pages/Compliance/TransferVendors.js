import { Icon } from "../../Components/ui/icons.js";
import { Badge, Button, RiskBadge, Card, Table, FilterBar, FilterSelect, FilterSearch, Drawer, Pagination } from "../../Components/ui";
import { ListTemplate } from "../../Components/templates";
import VendorDocuments from "../../Components/Evidence/VendorDocuments.js";
import { vendorDocuments } from "../../Functions/evidenceClient.js";
import { formatNumber } from "../../Functions/format.js";
import { MECHANISMS, DPA_STATES, RISK_RANK, isTrackingCategory, hostRegion, groupTransfersByVendor, vendorTotals, vendorChapterV, chapterVSummary, complianceFindings, complianceStatus, issueBreakdownText } from "../../Functions/transferCompliance.js";

const { useState, useMemo, useEffect, useRef } = React;

const PAGE_SIZE = 25;

const REGION_LABEL = { eu: "EU", "non-eu": "Non-EU", mixed: "EU + non-EU", "eu-hosted": "EU-hosted" };
const REGION_TITLE = { "eu-hosted": "Served from the EU by a company based outside the EU, so a transfer mechanism is still expected." };
const PHASE_LABEL = { pre: "Before consent", post: "After consent" };

/** Red only for tracking: a CMP or font loading early isn't the same kind of problem. */
function PhaseBadge({ phase, category }) {
    if (!PHASE_LABEL[phase]) return null;
    const tracking = phase === "pre" && isTrackingCategory(category);
    return <Badge tone={tracking ? "danger" : "neutral"} icon={tracking ? "alert-triangle" : phase === "pre" ? "info" : "check-circle"}>{PHASE_LABEL[phase]}</Badge>;
}

const DPF_LIST_URL = "https://www.dataprivacyframework.gov/list";
const SELECT = "tw-h-10 tw-w-full tw-px-2 tw-bg-bg-sunken tw-text-text-primary tw-border tw-border-solid tw-border-border-strong tw-rounded-md tw-font-sans tw-text-sm focus-visible:tw-outline-none focus-visible:tw-shadow-focus";
const FIELD_LABEL = "tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-text-text-muted tw-min-w-0";

function TransferBadge({ chapter }) {
    const short = chapter.mechanism?.short;
    if (chapter.status === "ok" && chapter.dateMissing) return <Badge tone="warning" icon="alert-triangle">{short} · no date</Badge>;
    if (chapter.status === "ok") return <Badge tone="success" icon="check-circle">{short}</Badge>;
    if (chapter.status === "unconfirmed") return <Badge tone="warning" icon="alert-triangle">{short} · unconfirmed</Badge>;
    if (chapter.status === "problem" && short === "None") return <Badge tone="danger" icon="alert-octagon">None</Badge>;
    if (chapter.status === "problem") return <span title="Nothing on record yet. This doesn't mean the vendor has no safeguard, so check and record it."><Badge tone="warning" icon="alert-triangle">Not documented</Badge></span>;
    return <Badge tone="neutral">Not required</Badge>;
}

function DpaBadge({ status }) {
    if (status === "signed") return <Badge tone="success" icon="check-circle">Signed</Badge>;
    if (status === "not_required") return <Badge tone="neutral">Not required</Badge>;
    if (status === "requested") return <Badge tone="warning" icon="clock">Requested</Badge>;
    return <Badge tone="warning" icon="alert-triangle">Unknown</Badge>;
}

/** Records the vendor's transfer mechanism and DPA for this organisation. */
function ChapterVForm({ vendor, record, onSave }) {
    const chapter = vendorChapterV(vendor, record);
    const [mechanism, setMechanism] = useState(record?.mechanism || "");
    const [confirmedAt, setConfirmedAt] = useState(record?.mechanism_confirmed_at || "");
    const [dpa, setDpa] = useState(record?.dpa_status || "unknown");
    const [owner, setOwner] = useState(record?.owner || "");
    const [notes, setNotes] = useState(record?.notes || "");
    const [evidenceUrl, setEvidenceUrl] = useState(record?.evidence_url || "");
    const [state, setState] = useState(null); // null | "saving" | "saved" | "error"

    async function save() {
        setState("saving");
        try {
            await onSave(vendor.vendor, { mechanism, mechanism_confirmed_at: confirmedAt, dpa_status: dpa, owner, notes, evidence_url: evidenceUrl });
            setState("saved");
        } catch {
            setState("error");
        }
    }

    const changed = (setter) => (e) => { setter(e.target.value); setState(null); };

    return (
        <section aria-labelledby="vendor-chapter-v" className="tw-flex tw-flex-col tw-gap-3 tw-p-4 tw-bg-bg-sunken tw-rounded-lg">
            <div>
                <h3 id="vendor-chapter-v" className="tw-m-0 tw-text-sm tw-font-semibold tw-text-text-primary">GDPR Chapter V</h3>
                <p className="tw-m-0 tw-text-xs tw-text-text-muted">{vendor.region === "eu-hosted" ? "This vendor serves this data from the EU but is based outside it, so a transfer mechanism is still expected." : chapter.required ? "This vendor receives data outside the EU, so it needs a transfer mechanism." : "This vendor stays in the EU, so no transfer mechanism is needed. It may still need a DPA."}</p>
            </div>
            <div className="tw-flex tw-flex-wrap tw-gap-2"><TransferBadge chapter={chapter} /><span className="tw-flex tw-items-center tw-gap-1 tw-text-xs tw-text-text-muted">DPA <DpaBadge status={chapter.dpa} /></span></div>
            {chapter.status === "unconfirmed" && (
                <p className="tw-m-0 tw-text-xs tw-text-text-secondary">
                    Our catalogue suggests {chapter.suggested.label}. Check it applies to this vendor, then select it below.
                    {chapter.suggested.id === "dpf" && <> <a href={DPF_LIST_URL} target="_blank" rel="noopener noreferrer" className="tw-text-accent-strong">Search the DPF list</a></>}
                </p>
            )}
            <div className="tw-grid tw-gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <label className={FIELD_LABEL}>
                    Transfer mechanism
                    <select className={SELECT} value={mechanism} onChange={(e) => { setMechanism(e.target.value); if (e.target.value && !confirmedAt) setConfirmedAt(new Date().toISOString().slice(0, 10)); setState(null); }} style={{ colorScheme: "dark" }}>
                        <option value="">Not confirmed</option>
                        {MECHANISMS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                </label>
                <label className={FIELD_LABEL}>
                    Mechanism confirmed on
                    <input type="date" className={SELECT} value={confirmedAt} onChange={changed(setConfirmedAt)} style={{ colorScheme: "dark" }} />
                </label>
                <label className={FIELD_LABEL}>
                    Data processing agreement
                    <select className={SELECT} value={dpa} onChange={changed(setDpa)} style={{ colorScheme: "dark" }}>
                        {DPA_STATES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                </label>
                <label className={FIELD_LABEL}>
                    Owner
                    <input type="text" className={SELECT} maxLength={255} placeholder="Who follows this up" value={owner} onChange={changed(setOwner)} />
                </label>
            </div>
            <label className={FIELD_LABEL}>
                Notes, such as where the signed DPA is kept
                <textarea className={`${SELECT} tw-h-auto tw-py-2`} rows={2} maxLength={1000} value={notes} onChange={changed(setNotes)} style={{ colorScheme: "dark", resize: "vertical" }} />
            </label>
            <label className={FIELD_LABEL}>
                Evidence link
                <input type="url" className={SELECT} maxLength={2000} placeholder="https://" value={evidenceUrl} onChange={changed(setEvidenceUrl)} />
            </label>
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                <Button variant="primary" size="sm" loading={state === "saving"} onClick={save}>Save</Button>
                {state === "saved" && <span role="status" className="tw-text-xs tw-text-success">Saved for your organisation</span>}
                {state === "error" && <span role="alert" className="tw-text-xs tw-text-danger-text">That couldn't be saved. Please try again.</span>}
            </div>
        </section>
    );
}

function evidenceLabel(record, documents, vendor) {
    const { dpa, other } = vendorDocuments(documents, vendor);
    const parts = [dpa && "DPA", other.length > 0 && `${other.length} other`, record?.evidence_url && "Link"].filter(Boolean);
    return parts.length ? parts.join(" + ") : <span className="tw-text-text-muted">None</span>;
}

const CHAPTER_FILTER = {
    action: (c) => c.needsAction,
    no_mechanism: (c) => c.status === "problem",
    no_dpa: (c) => c.needsDpa,
    unconfirmed: (c) => c.status === "unconfirmed" || c.dateMissing,
};
const FIX_KIND = {
    consent: { tone: "danger", icon: "alert-octagon", label: "Consent issue", chapter: "all", phase: "tracking" },
    mechanism: { tone: "warning", icon: "alert-triangle", label: "Chapter V transfer", chapter: "no_mechanism" },
    dpa: { tone: "warning", icon: "alert-triangle", label: "DPA", chapter: "no_dpa" },
    unconfirmed: { tone: "warning", icon: "alert-triangle", label: "Chapter V transfer", chapter: "unconfirmed" },
};

/** The three findings to fix first; each button narrows the table to that finding. */
function TopFixes({ findings, breakdown, onApply }) {
    if (!findings.length) return null;
    const makeup = issueBreakdownText(breakdown);
    return (
        <section id="open-issues" aria-labelledby="top-fixes-title" className="compliance-top-fixes tw-flex tw-flex-col tw-gap-3 tw-mb-4">
            <div className="tw-flex tw-flex-wrap tw-items-baseline tw-gap-2">
                <h3 id="top-fixes-title" className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">Top fixes</h3>
                <span className="tw-inline-flex tw-items-center tw-gap-1 tw-text-sm tw-text-text-muted" title={makeup} tabIndex={0} aria-label={`${formatNumber(findings.length)} open issues: ${makeup}`}>
                    {Math.min(3, findings.length)} of {formatNumber(findings.length)} open issue{findings.length === 1 ? "" : "s"}
                    <Icon name="info" size={14} />
                </span>
            </div>
            <ol className="tw-m-0 tw-p-0 tw-list-none tw-grid tw-gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
                {findings.slice(0, 3).map((f) => {
                    const kind = FIX_KIND[f.kind];
                    return (
                        <li key={f.kind + f.vendor} className="tw-flex tw-flex-col tw-items-start tw-gap-2 tw-p-4 tw-bg-bg-raised tw-border tw-border-solid tw-border-border-subtle tw-rounded-lg">
                            <Badge tone={kind.tone} icon={kind.icon}>{kind.label}</Badge>
                            <p className="tw-m-0 tw-text-sm tw-font-semibold tw-text-text-primary">{f.title}</p>
                            <p className="tw-m-0 tw-text-xs tw-text-text-muted">Vendor: {f.vendor}</p>
                            <Button size="sm" variant="secondary" className="tw-mt-auto" onClick={() => onApply(f)}>Show in table</Button>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

function Fact({ label, children }) {
    if (children == null || children === "" || (Array.isArray(children) && !children.length)) return null;
    return (
        <div className="tw-grid tw-gap-2" style={{ gridTemplateColumns: "140px minmax(0, 1fr)" }}>
            <dt className="tw-text-text-muted">{label}</dt>
            <dd className="tw-m-0 tw-text-text-primary tw-break-words">{children}</dd>
        </div>
    );
}

/**
 * Compliance → Data transfers, grouped by vendor (List template).
 * Category tiles and the region filter narrow the table; a row opens a
 * drawer with the vendor's details and full host list. Pure presentation —
 * the scan data comes in unchanged from the page.
 * phaseKnown: the scan tagged each host pre/post consent, so the
 * "Loaded" column and filter are shown (older scans can't tell).
 */
export default function TransferVendors({ transfers, categoryMeta, bannerMeta, resourceLabels, categoryOrder, phaseKnown = false, records = {}, onSaveRecord, evidence }) {
    const vendors = useMemo(() => groupTransfersByVendor(transfers, categoryMeta), [transfers, categoryMeta]);
    const [category, setCategory] = useState(null);
    const [region, setRegion] = useState("all");
    const [phase, setPhase] = useState("all");
    const [chapter, setChapter] = useState("all");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState({ key: "risk", direction: "desc" });
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState(null);
    useEffect(() => setPage(0), [category, region, phase, chapter, query, sort]);

    const totals = useMemo(() => vendorTotals(vendors), [vendors]);
    const byCategory = useMemo(
        () => Object.entries(totals.byCategory).sort(([a], [b]) => (categoryOrder[a] ?? 99) - (categoryOrder[b] ?? 99)),
        [totals, categoryOrder]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return vendors
            .filter((v) => !category || v.category === category)
            .filter((v) => region === "all" || (region === "non-eu" ? v.region === "non-eu" || v.region === "mixed" : v.region === region))
            .filter((v) => !phaseKnown || phase === "all" || (phase === "tracking" ? v.consentPhase === "pre" && isTrackingCategory(v.category) : v.consentPhase === phase))
            .filter((v) => chapter === "all" || CHAPTER_FILTER[chapter](vendorChapterV(v, records[v.vendor])))
            .filter((v) => !q || v.vendor.toLowerCase().includes(q) || v.hosts.some((h) => h.host.toLowerCase().includes(q)))
            .sort((a, b) => {
                const dir = sort.direction === "asc" ? 1 : -1;
                if (sort.key === "hosts") return (a.hosts.length - b.hosts.length) * dir;
                if (sort.key === "risk") return (RISK_RANK[a.risk] - RISK_RANK[b.risk] || a.hosts.length - b.hosts.length) * dir;
                return a.vendor.localeCompare(b.vendor) * dir;
            });
    }, [vendors, category, region, phase, chapter, records, phaseKnown, query, sort]);

    const chapterCounts = useMemo(() => chapterVSummary(vendors, records), [vendors, records]);
    const activeFilters = (category ? 1 : 0) + (region !== "all" ? 1 : 0) + (phaseKnown && phase !== "all" ? 1 : 0) + (chapter !== "all" ? 1 : 0) + (query ? 1 : 0);
    const clear = () => { setCategory(null); setRegion("all"); setPhase("all"); setChapter("all"); setQuery(""); };
    const findings = useMemo(() => complianceFindings(vendors, records, { phaseKnown }), [vendors, records, phaseKnown]);
    const breakdown = useMemo(() => complianceStatus(findings).breakdown, [findings]);
    const tableRef = useRef(null);
    const applyFix = (finding) => {
        clear();
        setChapter(FIX_KIND[finding.kind].chapter);
        if (FIX_KIND[finding.kind].phase) setPhase(FIX_KIND[finding.kind].phase);
        setQuery(finding.vendor);
        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const columns = [
        {
            key: "vendor", header: "Vendor", sortable: true,
            render: (v) => {
                const meta = categoryMeta[v.category] || {};
                return (
                    <span className="tw-flex tw-items-center tw-gap-2 tw-min-w-0">
                        <span style={{ color: meta.color }}><Icon name={meta.icon || "link"} size={16} /></span>
                        <span className="tw-min-w-0">
                            <span className="tw-block tw-font-semibold tw-text-text-primary tw-truncate">{v.vendor}</span>
                            <span className="tw-block tw-text-xs tw-text-text-muted tw-truncate">
                                {v.hosts[0].host}{v.hosts.length > 1 ? ` +${v.hosts.length - 1} more` : ""}
                            </span>
                        </span>
                        {/* The row's click opens the drawer; this makes that discoverable. */}
                        {onSaveRecord && <Button size="sm" variant="ghost" className="tw-ml-auto tw-flex-shrink-0" aria-label={`Edit ${v.vendor}`}>Edit</Button>}
                    </span>
                );
            },
        },
        { key: "transfer", header: "Transfer mechanism", render: (v) => <TransferBadge chapter={vendorChapterV(v, records[v.vendor])} /> },
        { key: "dpa", header: "DPA", render: (v) => <DpaBadge status={records[v.vendor]?.dpa_status} /> },
        { key: "owner", header: "Owner", hideOnMobile: true, render: (v) => records[v.vendor]?.owner || <span className="tw-text-text-muted">Unassigned</span> },
        { key: "evidence", header: "Evidence", hideOnMobile: true, render: (v) => evidenceLabel(records[v.vendor], evidence?.documents, v.vendor) },
        { key: "category", header: "Category", hideOnMobile: true, render: (v) => categoryMeta[v.category]?.label || v.category },
        { key: "risk", header: "Risk", sortable: true, hideOnMobile: true, render: (v) => <RiskBadge level={v.risk} /> },
        {
            key: "region", header: "Region", hideOnMobile: true,
            render: (v) => <span title={REGION_TITLE[v.region]}><Badge tone={v.region === "eu" ? "neutral" : "warning"} icon="globe">{REGION_LABEL[v.region]}</Badge></span>,
        },
        ...(phaseKnown ? [{ key: "phase", header: "Loaded", hideOnMobile: true, render: (v) => <PhaseBadge phase={v.consentPhase} category={v.category} /> }] : []),
        { key: "hosts", header: "Hosts", align: "right", sortable: true, hideOnMobile: true, render: (v) => formatNumber(v.hosts.length) },
    ];

    return (
        <>
        <TopFixes findings={findings} breakdown={breakdown} onApply={applyFix} />
        <ListTemplate
            summary={
                <span className="tw-text-text-secondary">
                    <strong className="tw-text-text-primary">{formatNumber(totals.vendors)}</strong> vendors ·{" "}
                    <strong className="tw-text-text-primary">{formatNumber(totals.hosts)}</strong> hosts ·{" "}
                    <strong className="tw-text-text-primary">{formatNumber(totals.outsideEu)}</strong> outside the EU
                    {phaseKnown && <> · <strong className="tw-text-text-primary">{formatNumber(totals.preConsentTracking)}</strong> tracking before consent</>}
                    {phaseKnown && totals.preConsent > totals.preConsentTracking && <span title="CMPs, fonts, CDNs and other non-tracking services. They load early without being a consent issue in the way ads and analytics are."> · <strong className="tw-text-text-primary">{formatNumber(totals.preConsent - totals.preConsentTracking)}</strong> other services before consent</span>}
                    {" · "}<strong className="tw-text-text-primary">{formatNumber(chapterCounts.problem)}</strong> with no mechanism on record
                    {" · "}<strong className="tw-text-text-primary">{formatNumber(chapterCounts.unconfirmed)}</strong> unconfirmed
                    {" · "}<strong className="tw-text-text-primary">{formatNumber(chapterCounts.withoutDpa)}</strong> without a confirmed DPA
                    {onSaveRecord && <span className="tw-block tw-mt-1 tw-text-text-muted">Select Edit on a vendor to set its DPA status, mechanism date, owner and notes, and to upload its DPA and other evidence.</span>}
                </span>
            }
            filters={
                <>
                    {/* Category tiles: one click filters the table by that category. */}
                    <div role="group" aria-label="Filter by category" className="transfers-summary">
                        {byCategory.map(([cat, count]) => {
                            const meta = categoryMeta[cat] || { label: cat, risk: "medium", icon: "link", color: "#909090" };
                            const active = category === cat;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    className={"transfers-summary__card" + (active ? " --active" : "")}
                                    style={{ "--cat-color": meta.color }}
                                    aria-pressed={active}
                                    aria-label={`${meta.label}: ${count} vendor${count === 1 ? "" : "s"}${meta.risk !== "none" ? `, ${meta.risk} risk` : ""}. Filter by this category.`}
                                    onClick={() => setCategory(active ? null : cat)}
                                >
                                    <span className="transfers-summary__card-icon"><Icon name={meta.icon} size={18} /></span>
                                    <span className="transfers-summary__card-count">{count}</span>
                                    <span className="transfers-summary__card-label">{meta.label}</span>
                                    {meta.risk !== "none" && <RiskBadge level={meta.risk} label={meta.risk === "high" ? "High" : meta.risk === "medium" ? "Medium" : "Low"} />}
                                </button>
                            );
                        })}
                    </div>
                    <FilterBar activeCount={activeFilters} onClear={clear} resultCount={filtered.length}>
                        <FilterSearch label="Vendor or host" value={query} onChange={setQuery} placeholder="e.g. clarity" />
                        <FilterSelect
                            label="Region"
                            value={region}
                            onChange={setRegion}
                            options={[{ value: "all", label: "All regions" }, { value: "eu", label: "EU only" }, { value: "eu-hosted", label: "EU-hosted, non-EU company" }, { value: "non-eu", label: "Outside the EU" }]}
                        />
                        {phaseKnown && (
                            <FilterSelect
                                label="Loaded"
                                value={phase}
                                onChange={setPhase}
                                options={[{ value: "all", label: "Before or after consent" }, { value: "tracking", label: "Tracking before consent" }, { value: "pre", label: "Anything before consent" }, { value: "post", label: "After consent only" }]}
                            />
                        )}
                        <FilterSelect label="Chapter V" value={chapter} onChange={setChapter} options={[{ value: "all", label: "All vendors" }, { value: "action", label: "Needs action" }, { value: "no_mechanism", label: "No mechanism on record" }, { value: "unconfirmed", label: "Mechanism unconfirmed" }, { value: "no_dpa", label: "No confirmed DPA" }]} />
                    </FilterBar>
                </>
            }
            pagination={filtered.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} label="Vendor pages" />}
            drawer={
                <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.vendor || ""} width="md">
                    {selected && (
                        <div className="tw-flex tw-flex-col tw-gap-5">
                            <div className="tw-flex tw-flex-wrap tw-gap-2">
                                <RiskBadge level={selected.risk} />
                                <Badge icon="globe" tone={selected.region === "eu" ? "neutral" : "warning"}>{REGION_LABEL[selected.region]}</Badge>
                                {phaseKnown && <PhaseBadge phase={selected.consentPhase} category={selected.category} />}
                            </div>
                            {onSaveRecord && <ChapterVForm key={selected.vendor} vendor={selected} record={records[selected.vendor]} onSave={onSaveRecord} />}
                            {onSaveRecord && evidence && <VendorDocuments vendor={selected.vendor} documents={evidence.documents} onChange={evidence.onChange} />}
                            <dl className="tw-m-0 tw-flex tw-flex-col tw-gap-2">
                                <Fact label="Category">{categoryMeta[selected.category]?.label || selected.category}</Fact>
                                <Fact label="Consent category">{selected.bannerCategory && (bannerMeta[selected.bannerCategory]?.label || selected.bannerCategory)}</Fact>
                                <Fact label="Data country">{selected.dataCountries.join(", ")}</Fact>
                                <Fact label="Legal basis">{selected.legalBasis}</Fact>
                                <Fact label="Purposes">{selected.purposes.join(", ")}</Fact>
                                <Fact label="About">{selected.description}</Fact>
                                <Fact label="Privacy policy">
                                    {selected.privacyUrl && (
                                        <a href={selected.privacyUrl} target="_blank" rel="noopener noreferrer" className="tw-inline-flex tw-items-center tw-gap-1 tw-text-accent-strong focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm">
                                            Open <Icon name="external-link" size={13} /><span className="tw-sr-only"> (opens in a new tab)</span>
                                        </a>
                                    )}
                                </Fact>
                            </dl>
                            <section aria-labelledby="vendor-hosts-title">
                                <h3 id="vendor-hosts-title" className="tw-m-0 tw-mb-2 tw-text-sm tw-font-semibold tw-text-text-primary">Hosts ({selected.hosts.length})</h3>
                                <Table
                                    caption={`Hosts contacted for ${selected.vendor}`}
                                    stickyHeader={false}
                                    columns={[
                                        { key: "host", header: "Host", render: (h) => <code className="tw-text-xs">{h.host}</code> },
                                        { key: "type", header: "Type", render: (h) => resourceLabels[h.resourceType] || h.resourceType || "Other" },
                                        { key: "region", header: "Region", render: (h) => REGION_LABEL[hostRegion(h)] },
                                        ...(phaseKnown ? [{ key: "phase", header: "Loaded", render: (h) => PHASE_LABEL[h.consentPhase] || "—" }] : []),
                                    ]}
                                    rows={selected.hosts}
                                    getRowKey={(h) => h.host}
                                />
                                {selected.hosts.some((h) => h.url || h.initiator) && (
                                    <dl className="tw-m-0 tw-mt-3 tw-flex tw-flex-col tw-gap-2">
                                        {selected.hosts.filter((h) => h.url || h.initiator).map((h) => (
                                            <div key={h.host} className="tw-flex tw-flex-col tw-gap-1">
                                                {h.url && <Fact label={`URL (${h.host})`}><code className="tw-text-xs">{h.url}</code></Fact>}
                                                {h.initiator && <Fact label="Initiator"><code className="tw-text-xs">{h.initiator}</code></Fact>}
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </section>
                        </div>
                    )}
                </Drawer>
            }
        >
            <div ref={tableRef} className="tw-min-w-0">
            <Card padding="none">
                <Table
                    caption="Vendors receiving data, grouped from the scanned hosts"
                    className="transfers-table"
                    columns={columns}
                    rows={pageRows}
                    getRowKey={(v) => v.vendor}
                    sort={sort}
                    onSortChange={(key) => setSort((s) => ({ key, direction: s.key === key && s.direction === "desc" ? "asc" : "desc" }))}
                    onRowClick={setSelected}
                    selectedKey={selected?.vendor}
                    empty={{ title: "No vendors match", message: "No vendor matches the current filters.", action: activeFilters ? { label: "Clear filters", onClick: clear } : undefined }}
                />
            </Card>
            </div>
        </ListTemplate>
        </>
    );
}
