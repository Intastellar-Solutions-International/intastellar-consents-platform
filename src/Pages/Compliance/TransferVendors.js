import { Icon } from "../../Components/ui/icons.js";
import { Badge, RiskBadge, Card, Table, FilterBar, FilterSelect, FilterSearch, Drawer, Pagination } from "../../Components/ui";
import { ListTemplate } from "../../Components/templates";
import { formatNumber } from "../../Functions/format.js";

const { useState, useMemo, useEffect } = React;

const PAGE_SIZE = 25;
const RISK_RANK = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * Group scanned transfers (one per host) into vendors: every *.clarity.ms host
 * becomes one "Microsoft Clarity" row. Pure — exported for tests.
 * region: "eu" when all hosts are EU, "non-eu" when none are, else "mixed".
 */
export function groupTransfersByVendor(transfers, categoryMeta = {}) {
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
        const eu = v.hosts.filter((h) => (h.dataRegion || "non-eu") === "eu").length;
        const region = eu === v.hosts.length ? "eu" : eu === 0 ? "non-eu" : "mixed";
        const first = (field) => v.hosts.find((h) => h[field])?.[field] || null;
        return {
            ...v,
            category,
            risk: categoryMeta[category]?.risk || "medium",
            region,
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

const REGION_LABEL = { eu: "EU", "non-eu": "Non-EU", mixed: "EU + non-EU" };

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
 */
export default function TransferVendors({ transfers, categoryMeta, bannerMeta, resourceLabels, categoryOrder }) {
    const vendors = useMemo(() => groupTransfersByVendor(transfers, categoryMeta), [transfers, categoryMeta]);
    const [category, setCategory] = useState(null);
    const [region, setRegion] = useState("all");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState({ key: "risk", direction: "desc" });
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState(null);
    useEffect(() => setPage(0), [category, region, query, sort]);

    const byCategory = useMemo(() => {
        const acc = {};
        for (const v of vendors) acc[v.category] = (acc[v.category] || 0) + 1;
        return Object.entries(acc).sort(([a], [b]) => (categoryOrder[a] ?? 99) - (categoryOrder[b] ?? 99));
    }, [vendors, categoryOrder]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return vendors
            .filter((v) => !category || v.category === category)
            .filter((v) => region === "all" || (region === "eu" ? v.region === "eu" : v.region !== "eu"))
            .filter((v) => !q || v.vendor.toLowerCase().includes(q) || v.hosts.some((h) => h.host.toLowerCase().includes(q)))
            .sort((a, b) => {
                const dir = sort.direction === "asc" ? 1 : -1;
                if (sort.key === "hosts") return (a.hosts.length - b.hosts.length) * dir;
                if (sort.key === "risk") return (RISK_RANK[a.risk] - RISK_RANK[b.risk] || a.hosts.length - b.hosts.length) * dir;
                return a.vendor.localeCompare(b.vendor) * dir;
            });
    }, [vendors, category, region, query, sort]);

    const hostCount = vendors.reduce((n, v) => n + v.hosts.length, 0);
    const nonEu = vendors.filter((v) => v.region !== "eu").length;
    const activeFilters = (category ? 1 : 0) + (region !== "all" ? 1 : 0) + (query ? 1 : 0);
    const clear = () => { setCategory(null); setRegion("all"); setQuery(""); };
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
                    </span>
                );
            },
        },
        { key: "category", header: "Category", render: (v) => categoryMeta[v.category]?.label || v.category },
        { key: "risk", header: "Risk", sortable: true, render: (v) => <RiskBadge level={v.risk} /> },
        {
            key: "region", header: "Region",
            render: (v) => <Badge tone={v.region === "eu" ? "neutral" : "warning"} icon="globe">{REGION_LABEL[v.region]}</Badge>,
        },
        { key: "hosts", header: "Hosts", align: "right", sortable: true, render: (v) => formatNumber(v.hosts.length) },
    ];

    return (
        <ListTemplate
            summary={
                <span className="tw-text-text-secondary">
                    <strong className="tw-text-text-primary">{formatNumber(vendors.length)}</strong> vendors ·{" "}
                    <strong className="tw-text-text-primary">{formatNumber(hostCount)}</strong> hosts ·{" "}
                    <strong className="tw-text-text-primary">{formatNumber(nonEu)}</strong> outside the EU
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
                            options={[{ value: "all", label: "All regions" }, { value: "eu", label: "EU only" }, { value: "non-eu", label: "Outside the EU" }]}
                        />
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
                            </div>
                            <dl className="tw-m-0 tw-flex tw-flex-col tw-gap-2">
                                <Fact label="Category">{categoryMeta[selected.category]?.label || selected.category}</Fact>
                                <Fact label="Consent category">{selected.bannerCategory && (bannerMeta[selected.bannerCategory]?.label || selected.bannerCategory)}</Fact>
                                <Fact label="Data country">{selected.dataCountries.join(", ")}</Fact>
                                <Fact label="Legal basis">{selected.legalBasis}</Fact>
                                <Fact label="Transfer mechanism">{selected.transferMechanism}</Fact>
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
                                        { key: "region", header: "Region", render: (h) => REGION_LABEL[h.dataRegion === "eu" ? "eu" : "non-eu"] },
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
            <Card padding="none">
                <Table
                    caption="Vendors receiving data, grouped from the scanned hosts"
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
        </ListTemplate>
    );
}
