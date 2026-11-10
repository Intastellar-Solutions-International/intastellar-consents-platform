import StickyPageTitle from "../../Components/Header/Sticky";
import { ListTemplate } from "../../Components/templates";
import { Badge, Button, Card, Drawer, FilterBar, FilterSearch, FilterSelect, KpiTile, Pagination, Table } from "../../Components/ui";
import { readCachedDomains } from "../../Functions/cachedDomains.js";
import { DEADLINE_RULES, REQUEST_TYPES, dueDate } from "../../Functions/dsr.js";
import { dsrSummary } from "../../Functions/dsrSummary.js";
import { formatNumber } from "../../Functions/format.js";
import { AREA, DsrStatusBadge, FIELD, LABEL, daysLeftLabel, fetchDsr, isClosed, legalDate, postDsr, regulationLabel, requesterName, typeLabel } from "./dsrShared.js";
import DsrSetup from "./DsrSetup.js";
import "./Style.css";

const { useState, useEffect, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
const useLocation = window.ReactRouterDOM.useLocation;
const SETUP_SECTIONS = ["form", "connections"];

const PAGE_SIZE = 25;
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ requester_name: "", requester_email: "", consent_id: "", type: "access", regulation: "GDPR", received_at: today(), domain: "", assignee: "", notes: "" });

const STATUS_FILTER = {
    new: (r) => r.is_new,
    open: (r) => !isClosed(r),
    overdue: (r) => r.overdue,
    pending: (r) => r.status === "pending",
    in_progress: (r) => r.status === "in_progress",
    completed: (r) => r.status === "completed",
    rejected: (r) => r.status === "rejected",
};

const sourceLabel = (r) => (r.source === "public_form" ? "Public form" : "Logged by hand");

function downloadCsv(rows) {
    const header = ["Requester", "Email", "Consent ID", "Domain", "Source", "Type", "Regulation", "Status", "Received", "Due", "Extended until", "Assignee", "Identity verified", "Closed"];
    const day = (v) => (v ? String(v).slice(0, 10) : "");
    const lines = rows.map((r) => [r.requester_name, r.requester_email, r.consent_id, r.domain, sourceLabel(r), typeLabel(r.type), r.regulation, r.overdue ? "overdue" : r.status, day(r.received_at), day(r.due_at), day(r.extended_until), r.assignee, day(r.identity_verified_at), day(r.closed_at)]);
    const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-subject-requests.csv";
    a.click();
    URL.revokeObjectURL(url);
}

/** Logs a request that reached the organisation by email, post or phone. */
function NewRequestForm({ onCreated }) {
    const [form, setForm] = useState(emptyForm);
    const [state, setState] = useState(null); // null | "saving" | error text
    const set = (key) => (e) => { const { value } = e.target; setForm((f) => ({ ...f, [key]: value })); };
    const domains = useMemo(readCachedDomains, []);
    const due = form.received_at ? dueDate(`${form.received_at}T00:00:00Z`, form.regulation) : null;
    const identified = form.requester_name.trim() || form.requester_email.trim() || form.consent_id.trim();

    async function submit(e) {
        e.preventDefault();
        setState("saving");
        try {
            const { request } = await postDsr({ action: "create", ...form });
            onCreated(request);
        } catch (err) {
            setState(err.message);
        }
    }

    return (
        <form onSubmit={submit} className="tw-flex tw-flex-col tw-gap-4">
            <p className="tw-m-0 tw-text-sm tw-text-text-muted">Add at least one way to identify the person.</p>
            <div className="dsr-form-grid">
                <label className={LABEL}>Name<input className={FIELD} maxLength={255} value={form.requester_name} onChange={set("requester_name")} /></label>
                <label className={LABEL}>Email<input type="email" className={FIELD} maxLength={255} value={form.requester_email} onChange={set("requester_email")} /></label>
                <label className={LABEL}>Consent ID<input className={FIELD} maxLength={255} value={form.consent_id} onChange={set("consent_id")} /></label>
                <label className={LABEL}>Domain
                    <select className={FIELD} value={form.domain} onChange={set("domain")} style={{ colorScheme: "dark" }}>
                        <option value="">Not domain-specific</option>
                        {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <label className={LABEL}>Request type
                    <select className={FIELD} value={form.type} onChange={set("type")} style={{ colorScheme: "dark" }}>
                        {REQUEST_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </label>
                <label className={LABEL}>Regulation
                    <select className={FIELD} value={form.regulation} onChange={set("regulation")} style={{ colorScheme: "dark" }}>
                        {Object.keys(DEADLINE_RULES).map((r) => <option key={r} value={r}>{regulationLabel(r)}</option>)}
                    </select>
                </label>
                <label className={LABEL}>Received on<input type="date" className={FIELD} max={today()} required value={form.received_at} onChange={set("received_at")} style={{ colorScheme: "dark" }} /></label>
                <label className={LABEL}>Assignee<input className={FIELD} maxLength={255} value={form.assignee} onChange={set("assignee")} /></label>
            </div>
            {due && <p className="tw-m-0 tw-text-sm tw-text-text-secondary">Response due by <strong className="tw-text-text-primary">{legalDate(due)}</strong>.</p>}
            <label className={LABEL}>Internal notes<textarea className={AREA} rows={3} maxLength={4000} value={form.notes} onChange={set("notes")} style={{ resize: "vertical" }} /></label>
            {state && state !== "saving" && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{state}</p>}
            <div><Button type="submit" variant="primary" loading={state === "saving"} disabled={!identified}>Log request</Button></div>
        </form>
    );
}

/** The organisation's data subject requests. */
export default function DSR() {
    document.title = "Data subject requests | Reports | Intastellar Consents";
    const { id } = useParams();
    const history = useHistory();
    const [requests, setRequests] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [drawer, setDrawer] = useState(false);
    const location = useLocation();
    // In the address so other pages can link straight to these settings.
    const requested = new URLSearchParams(location.search).get("setup");
    const setup = SETUP_SECTIONS.includes(requested) ? requested : null; // null | "form" | "connections"
    const setSetup = (section) => history.replace({ pathname: location.pathname, search: section ? `?setup=${section}` : "" });
    const [status, setStatus] = useState("all");
    const [type, setType] = useState("all");
    const [source, setSource] = useState("all");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState({ key: "received", direction: "desc" });
    const [page, setPage] = useState(0);

    useEffect(() => {
        let live = true;
        setError(null);
        fetchDsr()
            .then((data) => { if (live) setRequests(data.requests || []); })
            .catch((e) => { if (live) setError(e.message); });
        return () => { live = false; };
    }, [attempt]);
    useEffect(() => setPage(0), [status, type, source, query, sort]);

    const summary = useMemo(() => dsrSummary(requests || []), [requests]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const dir = sort.direction === "asc" ? 1 : -1;
        const when = (r) => new Date(sort.key === "due" ? r.effective_due_at : r.received_at).getTime();
        return (requests || [])
            .filter((r) => status === "all" || STATUS_FILTER[status](r))
            .filter((r) => type === "all" || r.type === type)
            .filter((r) => source === "all" || (source === "public_form") === (r.source === "public_form"))
            .filter((r) => !q || [r.requester_name, r.requester_email, r.consent_id, r.domain, r.assignee].some((v) => String(v || "").toLowerCase().includes(q)))
            .sort((a, b) => (when(a) - when(b)) * dir);
    }, [requests, status, type, source, query, sort]);
    const activeFilters = (status !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0) + (source !== "all" ? 1 : 0) + (query ? 1 : 0);
    const clear = () => { setStatus("all"); setType("all"); setSource("all"); setQuery(""); };

    const columns = [
        {
            key: "requester", header: "Requester",
            render: (r) => (
                <span className="tw-block tw-min-w-0">
                    <span className="tw-flex tw-items-center tw-gap-2 tw-font-semibold tw-text-text-primary">
                        <span className="tw-truncate">{requesterName(r)}</span>
                        {r.is_new && <Badge tone="info">New</Badge>}
                        {r.is_test && <Badge tone="neutral">Test</Badge>}
                    </span>
                    {r.requester_name && r.requester_email && <span className="tw-block tw-text-xs tw-text-text-muted tw-truncate">{r.requester_email}</span>}
                </span>
            ),
        },
        { key: "type", header: "Type", hideOnMobile: true, render: (r) => typeLabel(r.type) },
        { key: "domain", header: "Domain", hideOnMobile: true, render: (r) => r.domain || <span className="tw-text-text-muted">All</span> },
        { key: "source", header: "Source", hideOnMobile: true, render: sourceLabel },
        { key: "regulation", header: "Regulation", hideOnMobile: true, render: (r) => String(r.regulation).replace("_", " ") },
        { key: "received", header: "Received", sortable: true, hideOnMobile: true, render: (r) => legalDate(r.received_at) },
        {
            key: "due", header: "Due", sortable: true,
            render: (r) => (
                <span className="tw-block">
                    <span className="tw-block">{legalDate(r.effective_due_at)}</span>
                    {!isClosed(r) && <span className={`tw-block tw-text-xs ${r.overdue ? "tw-text-danger-text" : "tw-text-text-muted"}`}>{daysLeftLabel(r)}</span>}
                </span>
            ),
        },
        { key: "assignee", header: "Assignee", hideOnMobile: true, render: (r) => r.assignee || <span className="tw-text-text-muted">Unassigned</span> },
        { key: "status", header: "Status", render: (r) => <DsrStatusBadge request={r} /> },
    ];

    return (
        <>
            <StickyPageTitle title="Data subject requests" />
            <div className="dashboard-content">
                <section aria-label="Key figures" className="dsr-kpis">
                    <KpiTile label="Open" loading={!requests && !error} value={formatNumber(summary.open)} hint="Not yet completed or rejected" />
                    <KpiTile label="Due within 7 days" loading={!requests && !error} value={formatNumber(summary.dueSoon)} hint={summary.dueSoon ? <Badge tone="warning" icon="alert-triangle">Due soon</Badge> : "Nothing due this week"} />
                    <KpiTile label="Overdue" loading={!requests && !error} value={formatNumber(summary.overdue)} hint={summary.overdue ? <Badge tone="danger" icon="alert-octagon">Past deadline</Badge> : "None past deadline"} />
                </section>
                <ListTemplate
                    summary={(
                        <span className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                            <span>Requests from people exercising their privacy rights. Log one when it arrives so its legal deadline starts from the right date.</span>
                            <span className="tw-flex tw-gap-2">
                                <Button variant="ghost" onClick={() => setSetup("connections")}>Vendor connections</Button>
                                <Button variant="ghost" onClick={() => setSetup("form")}>Public form</Button>
                                {filtered.some((r) => !r.is_test) && <Button variant="secondary" onClick={() => downloadCsv(filtered.filter((r) => !r.is_test))}>Export CSV</Button>}
                                <Button variant="primary" onClick={() => setDrawer(true)}>Log request</Button>
                            </span>
                        </span>
                    )}
                    filters={(
                        <FilterBar activeCount={activeFilters} onClear={clear} resultCount={requests ? filtered.length : null}>
                            <FilterSearch label="Search" value={query} onChange={setQuery} placeholder="Name, email, consent ID, domain" />
                            <FilterSelect
                                label="Status"
                                value={status}
                                onChange={setStatus}
                                options={[{ value: "all", label: "All statuses" }, { value: "new", label: "New" }, { value: "open", label: "Open" }, { value: "overdue", label: "Overdue" }, { value: "pending", label: "Pending" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }, { value: "rejected", label: "Rejected" }]}
                            />
                            <FilterSelect label="Source" value={source} onChange={setSource} options={[{ value: "all", label: "All sources" }, { value: "public_form", label: "Public form" }, { value: "manual", label: "Logged by hand" }]} />
                            <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...REQUEST_TYPES.map((t) => ({ value: t.id, label: t.label }))]} />
                        </FilterBar>
                    )}
                    pagination={filtered.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} label="Request pages" />}
                    drawer={(
                        <>
                        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Log a data subject request" width="md">
                            {drawer && <NewRequestForm onCreated={(request) => history.push(`/${id}/reports/dsr/${request.id}`)} />}
                        </Drawer>
                        <Drawer open={Boolean(setup)} onClose={() => setSetup(null)} title={setup === "form" ? "Public request form" : "Vendor connections"} width="md">
                            {setup && <DsrSetup section={setup} />}
                        </Drawer>
                        </>
                    )}
                >
                    <Card padding="none">
                        <Table
                            caption="Data subject requests"
                            columns={columns}
                            rows={filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
                            getRowKey={(r) => r.id}
                            sort={sort}
                            onSortChange={(key) => setSort((s) => ({ key, direction: s.key === key && s.direction === "desc" ? "asc" : "desc" }))}
                            onRowClick={(r) => history.push(`/${id}/reports/dsr/${r.id}`)}
                            loading={!requests && !error}
                            error={error ? { title: "Requests couldn't be loaded", message: error, onRetry: () => setAttempt((n) => n + 1) } : undefined}
                            empty={activeFilters
                                ? { title: "No requests match", message: "No request matches the current filters.", action: { label: "Clear filters", onClick: clear } }
                                : { title: "No requests yet", message: "Log the first one when someone asks to see, correct or delete their data.", action: { label: "Log request", onClick: () => setDrawer(true) } }}
                        />
                    </Card>
                </ListTemplate>
            </div>
        </>
    );
}
