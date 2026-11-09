import StickyPageTitle from "../../Components/Header/Sticky";
import { WorkspaceContext } from "../../App.js";
import API from "../../API/api";
import { ListTemplate } from "../../Components/templates";
import { Badge, Card, FilterBar, FilterSearch, Pagination, Table } from "../../Components/ui";
import { readCachedDomains, toUnicodeDomain } from "../../Functions/cachedDomains.js";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { reportsPath } from "../../Functions/domainPathSegments.js";
import { formatDateTime, formatNumber } from "../../Functions/format.js";
import appStorage from "../../Functions/storage.js";

const { useState, useEffect, useMemo, useContext } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;

function TrackerBadge({ scan }) {
    if (scan.trackers === 0) return <Badge tone="success" icon="check-circle">None</Badge>;
    const label = `${formatNumber(scan.trackers)} vendor${scan.trackers === 1 ? "" : "s"}`;
    return scan.phase_known
        ? <Badge tone="danger" icon="alert-octagon">{label}</Badge>
        : <Badge tone="warning" icon="alert-triangle">{label}</Badge>;
}

/** Every stored cookie scan across the organisation's domains. */
export default function ScanHistory() {
    document.title = "Cookie scans | Intastellar Consents | CMP";
    const { id } = useParams();
    const history = useHistory();
    const [activeWorkspace] = useContext(WorkspaceContext);
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [sort, setSort] = useState({ key: "scanned_at", direction: "desc" });
    const [page, setPage] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    const domains = useMemo(
        () => (activeWorkspace?.domains?.length ? activeWorkspace.domains.map((d) => d.domain) : readCachedDomains()),
        [activeWorkspace]
    );

    useEffect(() => {
        const timer = setTimeout(() => { setAppliedSearch(search); setPage(0); }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        const ac = new AbortController();
        setResult(null);
        setError(null);
        fetchJsonWithTimeout(API[id].listPreConsentScans.url, {
            method: API[id].listPreConsentScans.method,
            headers: API[id].listPreConsentScans.headers,
            body: JSON.stringify({ domains, page, pageSize: PAGE_SIZE, search: appliedSearch, sort: sort.key, direction: sort.direction }),
        }, {
            signal: ac.signal,
            onLoginExpired: () => { appStorage.removeItem("globals"); window.location.href = "/login"; },
        })
            .then((data) => {
                if (ac.signal.aborted) return;
                if (data?.error) setError(data.error); else setResult(data);
            })
            .catch((err) => {
                if (err.kind !== "aborted" && !ac.signal.aborted) setError(err.message);
            });
        return () => ac.abort();
    }, [id, domains, page, appliedSearch, sort, attempt]);

    function changeSort(key) {
        setPage(0);
        setSort((s) => (s.key === key ? { key, direction: s.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "domain" ? "asc" : "desc" }));
    }

    const columns = [
        { key: "domain", header: "Domain", sortable: true, render: (s) => <span className="tw-text-text-primary">{toUnicodeDomain(s.domain)}</span> },
        { key: "scanned_at", header: "Scanned", sortable: true, render: (s) => formatDateTime(new Date(s.scanned_at)) },
        { key: "trackers", header: "Advertising and analytics", render: (s) => <TrackerBadge scan={s} /> },
        { key: "transfers", header: "Transfers", align: "right", render: (s) => formatNumber(s.transfers) },
        { key: "cookies", header: "Cookies", align: "right", render: (s) => formatNumber(s.cookies) },
    ];

    return (
        <div className="dashboard-content">
            <StickyPageTitle title="Cookie scans" />
            <ListTemplate
                summary="The most recent scans for each of your domains. Counts show what loaded before consent where the scan can tell."
                filters={(
                    <FilterBar resultCount={result ? `${formatNumber(result.total)} scans` : null}>
                        <FilterSearch label="Domain" value={search} onChange={setSearch} placeholder="Search domains" />
                    </FilterBar>
                )}
                pagination={result && result.total > PAGE_SIZE
                    ? <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} label="Scan pages" />
                    : null}
            >
                <Card padding="none">
                    <Table
                        caption="Cookie scans"
                        columns={columns}
                        rows={result?.scans || []}
                        getRowKey={(s) => s.id}
                        sort={sort}
                        onSortChange={changeSort}
                        onRowClick={(s) => history.push(`${reportsPath(id, toUnicodeDomain(s.domain), "/compliance")}?scan=${encodeURIComponent(s.id)}`)}
                        loading={!result && !error}
                        error={error ? { title: "Scans couldn't be loaded", message: error, onRetry: () => setAttempt((n) => n + 1) } : undefined}
                        empty={{ title: "No scans found", message: appliedSearch ? "No scan matches this domain." : "Run a scan from Home or Compliance to see it here." }}
                    />
                </Card>
            </ListTemplate>
        </div>
    );
}
