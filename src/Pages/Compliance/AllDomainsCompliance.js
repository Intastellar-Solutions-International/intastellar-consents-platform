import API from "../../API/api";
import { Badge, Button, Card, FilterBar, FilterSearch, FilterSelect, KpiTile, Table } from "../../Components/ui";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { formatDate, formatNumber } from "../../Functions/format.js";
import { readCachedDomains, toUnicodeDomain } from "../../Functions/cachedDomains.js";
import { reportsPath } from "../../Functions/domainPathSegments.js";
import { issueBreakdownText, scanCompliance } from "../../Functions/transferCompliance.js";
import { preConsentCookieStat } from "../../Functions/cookieStats.js";
import { combineDomainCompliance, filterDomainCompliance, mapWithLimit, sortDomains } from "../../Functions/allDomainsCompliance.js";
import appStorage from "../../Functions/storage.js";

const { useState, useEffect, useMemo } = React;
const Link = window.ReactRouterDOM.Link;

const PARALLEL_CHECKS = 6;
const ISSUES_SHOWN = 10;
const DOMAINS_PER_ISSUE = 3;
const LEVEL = {
    critical: { tone: "danger", icon: "alert-octagon", label: "Critical" },
    attention: { tone: "warning", icon: "alert-triangle", label: "Needs attention" },
    healthy: { tone: "success", icon: "check-circle", label: "Healthy" },
    unknown: { tone: "neutral", icon: "info", label: "No usable scan" },
    failed: { tone: "neutral", icon: "info", label: "Couldn't check" },
};
const LEVEL_FILTERS = [
    { value: "all", label: "All statuses" },
    { value: "critical", label: "Critical" },
    { value: "attention", label: "Needs attention" },
    { value: "healthy", label: "Healthy" },
    { value: "not_checked", label: "Not checked" },
];
/** The direction a column starts in when first clicked. */
const FIRST_DIRECTION = { domain: "asc", level: "asc", count: "desc", scannedAt: "desc" };
const KIND = {
    consent: { tone: "danger", label: "Consent issue" },
    mechanism: { tone: "warning", label: "Chapter V transfer" },
    dpa: { tone: "warning", label: "DPA" },
    unconfirmed: { tone: "warning", label: "Chapter V transfer" },
};

const onLoginExpired = () => {
    appStorage.removeItem("globals");
    window.location.href = "/login";
};

/** One scanCompliance() per domain, from the same request the header status uses. */
async function checkDomain(api, domain, records, signal) {
    try {
        const scan = await fetchJsonWithTimeout(`${api.getPreConsentTransfers.url}?domain=${encodeURIComponent(domain)}`, { headers: { ...api.getPreConsentTransfers.headers } }, { signal, onLoginExpired });
        return { domain, status: scanCompliance(scan, records), scannedAt: scan?.scanned_at || null, preConsentCookies: preConsentCookieStat(scan).count };
    } catch (err) {
        if (err.kind === "aborted") throw err;
        return { domain, status: null };
    }
}

/** Compliance for every domain at once, shown when "All domains" is selected. */
export default function AllDomainsCompliance({ platformId, workspace, onSummary }) {
    const [rows, setRows] = useState(null);
    const [checked, setChecked] = useState(0);
    const [error, setError] = useState(null);
    const [showAllIssues, setShowAllIssues] = useState(false);
    const [level, setLevel] = useState("all");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState({ key: "level", direction: "asc" });
    const domains = useMemo(
        () => (workspace?.domains?.length ? workspace.domains.map((d) => toUnicodeDomain(d.domain)) : readCachedDomains()),
        [workspace]
    );

    useEffect(() => {
        const api = API[platformId];
        if (!api?.getPreConsentTransfers || !api?.vendorCompliance) return undefined;
        const ac = new AbortController();
        setRows(null); setChecked(0); setError(null);
        (async () => {
            // Without the organisation's vendor records every vendor would look like a missing DPA.
            const data = await fetchJsonWithTimeout(api.vendorCompliance.url, { headers: { ...api.vendorCompliance.headers } }, { signal: ac.signal, onLoginExpired });
            const results = await mapWithLimit(domains, PARALLEL_CHECKS, async (domain) => {
                const row = await checkDomain(api, domain, data?.records || {}, ac.signal);
                if (!ac.signal.aborted) setChecked((n) => n + 1);
                return row;
            });
            if (!ac.signal.aborted) setRows(results);
        })().catch((err) => { if (err.kind !== "aborted" && !ac.signal.aborted) setError(err.message); });
        return () => ac.abort();
    }, [platformId, domains]);

    const summary = useMemo(() => (rows ? combineDomainCompliance(rows) : null), [rows]);
    useEffect(() => { onSummary?.(summary); }, [summary]);
    const filtered = useMemo(() => (summary ? filterDomainCompliance(summary, { level, query }) : null), [summary, level, query]);
    const shownDomains = useMemo(() => (filtered ? sortDomains(filtered.domains, sort) : []), [filtered, sort]);
    const changeSort = (key) => setSort((s) => (s.key === key ? { key, direction: s.direction === "asc" ? "desc" : "asc" } : { key, direction: FIRST_DIRECTION[key] }));
    const filtering = level !== "all" || query.trim() !== "";

    const compliancePath = (domain) => `${reportsPath(platformId, domain, "/compliance")}#open-issues`;
    const domainLink = (domain) => (
        <Link to={compliancePath(domain)} className="tw-text-accent-strong tw-font-semibold tw-no-underline hover:tw-underline focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm">{domain}</Link>
    );

    if (!domains.length) {
        return <Card title="All domains"><p className="tw-m-0 tw-text-sm tw-text-text-muted">There are no domains in this organisation yet.</p></Card>;
    }
    if (error) {
        return <Card title="All domains"><p className="tw-m-0 tw-text-sm tw-text-danger-text">The domains couldn't be checked: {error}</p></Card>;
    }

    const loading = summary == null;
    const allIssues = filtered?.issues || [];
    const issues = showAllIssues ? allIssues : allIssues.slice(0, ISSUES_SHOWN);
    const columns = [
        { key: "domain", header: "Domain", sortable: true, render: (d) => domainLink(d.domain) },
        { key: "level", header: "Status", sortable: true, render: (d) => <Badge tone={LEVEL[d.level].tone} icon={LEVEL[d.level].icon}>{LEVEL[d.level].label}</Badge> },
        { key: "count", header: "Issues", sortable: true, render: (d) => (d.count == null ? "—" : formatNumber(d.count)) },
        { key: "breakdown", header: "What's open", hideOnMobile: true, render: (d) => (d.breakdown ? issueBreakdownText(d.breakdown) : "—") },
        { key: "scannedAt", header: "Last scan", sortable: true, hideOnMobile: true, render: (d) => (d.scannedAt ? formatDate(d.scannedAt) : "—") },
    ];

    return (
        <div className="dashboard-section tw-flex tw-flex-col tw-gap-5">
            <section aria-label="Domains by status" className="tw-grid tw-gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <KpiTile label="Critical" loading={loading} value={formatNumber(summary?.levels.critical)} hint="Tracking before consent" />
                <KpiTile label="Needs attention" loading={loading} value={formatNumber(summary?.levels.attention)} hint="Transfer or DPA issues" />
                <KpiTile label="Healthy" loading={loading} value={formatNumber(summary?.levels.healthy)} hint="No open issues" />
                <KpiTile label="Not checked" loading={loading} value={formatNumber((summary?.levels.unknown || 0) + (summary?.levels.failed || 0))} hint="No usable scan, or the check failed" />
            </section>

            <FilterBar
                activeCount={(level !== "all" ? 1 : 0) + (query.trim() ? 1 : 0)}
                onClear={() => { setLevel("all"); setQuery(""); setShowAllIssues(false); }}
                resultCount={filtered ? filtered.domains.length : null}>
                <FilterSelect label="Status" value={level} options={LEVEL_FILTERS} onChange={(v) => { setLevel(v); setShowAllIssues(false); }} />
                <FilterSearch label="Domain" value={query} onChange={setQuery} placeholder="Search domains" />
            </FilterBar>

            <Card
                title={filtering ? "Issues on the domains shown" : "Issues across all domains"}
                description="Grouped by vendor. Transfer and DPA records are kept for the whole organisation, so fixing one fixes it on every domain listed."
            >
                {loading && <p className="tw-m-0 tw-text-sm tw-text-text-muted">Checking {formatNumber(checked)} of {formatNumber(domains.length)} domains…</p>}
                {summary && !allIssues.length && <p className="tw-m-0 tw-text-sm tw-text-text-muted">{filtering ? "No open issues on the domains shown." : "No open issues in the latest scans."}</p>}
                {issues.length > 0 && (
                    <ul className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                        {issues.map((issue) => (
                            <li key={issue.key} className="tw-grid tw-gap-3 tw-items-start" style={{ gridTemplateColumns: "minmax(0, 9rem) minmax(0, 1fr)" }}>
                                <Badge tone={KIND[issue.kind].tone}>{KIND[issue.kind].label}</Badge>
                                <div className="tw-min-w-0">
                                    <p className="tw-m-0 tw-text-sm tw-text-text-primary">{issue.title}</p>
                                    <p className="tw-m-0 tw-mt-1 tw-text-xs tw-text-text-muted">
                                        On {formatNumber(issue.domains.length)} {issue.domains.length === 1 ? "domain" : "domains"}:{" "}
                                        {issue.domains.slice(0, DOMAINS_PER_ISSUE).map((d, i) => <span key={d}>{i > 0 && ", "}{domainLink(d)}</span>)}
                                        {issue.domains.length > DOMAINS_PER_ISSUE && ` and ${formatNumber(issue.domains.length - DOMAINS_PER_ISSUE)} more`}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {allIssues.length > ISSUES_SHOWN && (
                    <Button size="sm" variant="ghost" className="tw-mt-3" onClick={() => setShowAllIssues((v) => !v)}>
                        {showAllIssues ? "Show fewer" : `Show all ${formatNumber(allIssues.length)} issues`}
                    </Button>
                )}
            </Card>

            <Card title="Domains" description="Open a domain to see and fix its issues." padding="none">
                <Table
                    caption="Compliance status per domain"
                    columns={columns}
                    rows={shownDomains}
                    getRowKey={(d) => d.domain}
                    sort={sort}
                    onSortChange={changeSort}
                    loading={loading}
                    empty={filtering
                        ? { title: "No domains match", message: "Try another status or search." }
                        : { title: "No domains", message: "There are no domains to check." }}
                />
            </Card>
        </div>
    );
}
