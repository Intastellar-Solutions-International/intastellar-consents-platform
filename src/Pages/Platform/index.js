import API from "../../API/api";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ListTemplate } from "../../Components/templates";
import { Badge, Card, FilterBar, FilterSearch, KpiTile, Pagination, Table, Tabs, TabPanel } from "../../Components/ui";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { appLocale, formatDate, formatNumber, formatPercent } from "../../Functions/format.js";
import { installsByMonth, platformShares, toSites } from "../../Functions/platformStats.js";
import { toUnicodeDomain } from "../../Functions/cachedDomains.js";
import appStorage from "../../Functions/storage.js";
import SalesFigures from "./SalesFigures.js";

const { useState, useEffect, useMemo } = React;
const useHistory = window.ReactRouterDOM.useHistory;
const useLocation = window.ReactRouterDOM.useLocation;

const PAGE_SIZE = 25;
const STATUS = {
    active: { tone: "success", icon: "check-circle", label: "Active" },
    quiet: { tone: "warning", icon: "alert-triangle", label: "Quiet" },
    inactive: { tone: "danger", icon: "alert-octagon", label: "Inactive" },
    unknown: { tone: "neutral", icon: "info", label: "Unknown" },
};
/** Each tab has its own address, so it can be linked to and survives a reload. */
const TABS = [
    { id: "sites", label: "Sites", path: "/platform", title: "Platform" },
    { id: "sales", label: "Sales figures", path: "/platform/sales", title: "Sales figures | Platform" },
];

const onLoginExpired = () => {
    appStorage.removeItem("globals");
    window.location.href = "/login";
};

function fetchEndpoint(endpoint, signal) {
    return fetchJsonWithTimeout(endpoint.url, { method: endpoint.method, headers: endpoint.headers }, { signal, onLoginExpired });
}

function InstallsChart({ months }) {
    const peak = Math.max(1, ...months.map((m) => m.count));
    if (!months.some((m) => m.count > 0)) return <p className="tw-m-0 tw-text-sm tw-text-text-muted">No installs in the last 12 months.</p>;
    const label = (date) => new Intl.DateTimeFormat(appLocale(), { month: "short", timeZone: "UTC" }).format(date);
    return (
        <div className="tw-flex tw-items-end tw-gap-2" style={{ height: 160 }} role="img" aria-label={months.map((m) => `${label(m.date)}: ${m.count}`).join(", ")}>
            {months.map((m) => (
                <div key={m.key} className="tw-flex-1 tw-min-w-0 tw-h-full tw-flex tw-flex-col tw-justify-end tw-items-center tw-gap-1">
                    <span className="tw-text-xs tw-text-text-secondary tw-tabular-nums">{m.count > 0 ? formatNumber(m.count) : ""}</span>
                    <div className={`tw-w-full tw-rounded-t-xs ${m.count > 0 ? "tw-bg-data" : "tw-bg-white/10"}`} style={{ height: m.count > 0 ? `${Math.max(4, (m.count / peak) * 70)}%` : 2 }} />
                    <span className="tw-text-xs tw-text-text-muted">{label(m.date)}</span>
                </div>
            ))}
        </div>
    );
}

/** Banner installs across every customer. */
function SitesOverview() {
    const [stats, setStats] = useState(null);
    const [statsError, setStatsError] = useState(null);
    const [rows, setRows] = useState(null);
    const [sitesError, setSitesError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState({ key: "installed", direction: "desc" });
    const [page, setPage] = useState(0);

    useEffect(() => {
        const ac = new AbortController();
        setStats(null); setStatsError(null); setRows(null); setSitesError(null);
        const failed = (setError) => (err) => { if (err.kind !== "aborted" && !ac.signal.aborted) setError(err.message); };
        fetchEndpoint(API.gdpr.getTotalNumber, ac.signal).then(setStats).catch(failed(setStatsError));
        fetchEndpoint(API.gdpr.getDomains, ac.signal)
            .then((data) => { if (Array.isArray(data)) setRows(data); else setSitesError("The server returned no sites."); })
            .catch(failed(setSitesError));
        return () => ac.abort();
    }, [attempt]);

    const sites = useMemo(() => toSites(rows), [rows]);
    const months = useMemo(() => installsByMonth(sites), [sites]);
    const inactive = sites.filter((s) => s.status === "inactive").length;

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        const value = (s) => (sort.key === "domain" ? s.domain : s[sort.key]?.getTime() ?? -1);
        const dir = sort.direction === "asc" ? 1 : -1;
        return sites
            .filter((s) => !term || s.domain.toLowerCase().includes(term) || s.company.toLowerCase().includes(term))
            .sort((a, b) => (value(a) > value(b) ? dir : value(a) < value(b) ? -dir : 0));
    }, [sites, search, sort]);

    const shares = platformShares(stats);
    const tileError = statsError ? { message: statsError, onRetry: () => setAttempt((n) => n + 1) } : undefined;
    const statsLoading = stats == null && !statsError;
    const dateCell = (d) => (d ? formatDate(d) : "—");
    const columns = [
        { key: "domain", header: "Site", sortable: true, render: (s) => <span className="tw-text-text-primary">{toUnicodeDomain(s.domain)}</span> },
        { key: "company", header: "Company", hideOnMobile: true, render: (s) => s.company || "—" },
        { key: "installed", header: "Installed", sortable: true, hideOnMobile: true, render: (s) => dateCell(s.installed) },
        { key: "lastSeen", header: "Last seen", sortable: true, render: (s) => dateCell(s.lastSeen) },
        { key: "status", header: "Status", render: (s) => <Badge tone={STATUS[s.status].tone} icon={STATUS[s.status].icon}>{STATUS[s.status].label}</Badge> },
    ];

    function changeSort(key) {
        setPage(0);
        setSort((s) => (s.key === key ? { key, direction: s.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "domain" ? "asc" : "desc" }));
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-5">
            <section aria-label="Install figures" className="tw-grid tw-gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <KpiTile label="Websites" loading={statsLoading} error={tileError} value={formatNumber(stats?.Total)} />
                <KpiTile label="JavaScript" loading={statsLoading} error={tileError} value={formatPercent(shares.javascript, 2)} />
                <KpiTile label="WordPress" loading={statsLoading} error={tileError} value={formatPercent(shares.wordpress, 2)} />
                <KpiTile label="Platform unknown" loading={statsLoading} error={tileError} value={formatPercent(shares.unknown, 2)} hint="No platform stored for these sites" />
            </section>
            <Card title="New installs per month">
                {rows == null && !sitesError ? <p className="tw-m-0 tw-text-sm tw-text-text-muted">Loading…</p> : <InstallsChart months={months} />}
            </Card>
            <ListTemplate
                summary={rows ? `${formatNumber(sites.length)} sites. ${formatNumber(inactive)} without activity for more than 30 days.` : null}
                filters={(
                    <FilterBar resultCount={rows ? formatNumber(visible.length) : null}>
                        <FilterSearch label="Site or company" value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Search" />
                    </FilterBar>
                )}
                pagination={visible.length > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} label="Site pages" /> : null}
            >
                <Card padding="none">
                    <Table
                        caption="Sites with the banner installed"
                        columns={columns}
                        rows={visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
                        getRowKey={(s) => s.domain}
                        sort={sort}
                        onSortChange={changeSort}
                        loading={rows == null && !sitesError}
                        error={sitesError ? { title: "Sites couldn't be loaded", message: sitesError, onRetry: () => setAttempt((n) => n + 1) } : undefined}
                        empty={{ title: "No sites found", message: "Nothing matches this search." }}
                    />
                </Card>
            </ListTemplate>
        </div>
    );
}

/** Admin-only pages about the whole platform, one tab each. */
export default function PlatformPage() {
    const history = useHistory();
    const { pathname } = useLocation();
    const tab = TABS.find((t) => t.path === pathname.replace(/\/$/, "")) || TABS[0];
    document.title = `${tab.title} | Intastellar Consents | CMP`;

    return (
        <>
            <StickyPageTitle title="Platform" />
            <div className="dashboard-content tw-flex tw-flex-col tw-gap-5">
                <Tabs label="Platform sections" idPrefix="platform" tabs={TABS} value={tab.id} onChange={(id) => history.push(TABS.find((t) => t.id === id).path)} />
                {TABS.map((t) => (
                    <TabPanel key={t.id} idPrefix="platform" id={t.id} active={t.id === tab.id}>
                        {t.id === "sales" ? <SalesFigures /> : <SitesOverview />}
                    </TabPanel>
                ))}
            </div>
        </>
    );
}
