import StickyPageTitle from "../../Components/Header/Sticky";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../../Components/ui";
import { reportsPath } from "../../Functions/domainPathSegments.js";
import { latestExtension } from "../../Functions/dsr.js";
import { formatDate, formatDateTime } from "../../Functions/format.js";
import { FRAMEWORK_LABELS } from "../../Functions/jurisdictionEngine.js";
import { AREA, DsrStatusBadge, FIELD, LABEL, daysLeftLabel, fetchDsr, isClosed, postDsr, requesterName, typeLabel } from "./dsrShared.js";
import VendorChecklist from "./VendorChecklist.js";
import "./Style.css";

const { useState, useEffect } = React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;

const EVENT_LABEL = {
    created: "Request logged",
    start: "Marked in progress",
    verify_identity: "Identity verified",
    extend: "Deadline extended",
    complete: "Completed",
    reject: "Rejected",
    reopen: "Reopened",
    update: "Details edited",
    vendor_update: "Vendor status changed",
    vendor_deletion: "Deletion sent through vendor API",
    vendor_deletion_failed: "Vendor API deletion failed",
};
// Identity matters where data is handed over or changed; an opt-out or objection needs less.
const NEEDS_IDENTITY = new Set(["access", "rectification", "erasure", "portability"]);

function Fact({ label, children }) {
    return (
        <div className="tw-min-w-0">
            <dt className="tw-text-xs tw-text-text-muted">{label}</dt>
            <dd className="tw-m-0 tw-text-sm tw-text-text-primary tw-break-words">{children || "—"}</dd>
        </div>
    );
}

/** One closing or extending step: asks for the text the record needs, then confirms. */
function StepForm({ label, field, hint, submit, onCancel, onSubmit, children, saving }) {
    const [text, setText] = useState("");
    const [extra, setExtra] = useState("");
    return (
        <form className="tw-flex tw-flex-col tw-gap-3 tw-p-3 tw-bg-bg-sunken tw-rounded-lg" onSubmit={(e) => { e.preventDefault(); onSubmit({ [field]: text, extended_until: extra }); }}>
            {children && children(extra, setExtra)}
            <label className={LABEL}>{label}<textarea className={AREA} rows={3} required maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} style={{ resize: "vertical" }} /></label>
            {hint && <p className="tw-m-0 tw-text-xs tw-text-text-muted">{hint}</p>}
            <div className="tw-flex tw-gap-2">
                <Button type="submit" size="sm" variant="primary" loading={saving}>{submit}</Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
        </form>
    );
}

function DetailsForm({ request, onSave, saving }) {
    const initial = { requester_name: request.requester_name || "", requester_email: request.requester_email || "", consent_id: request.consent_id || "", assignee: request.assignee || "", notes: request.notes || "" };
    const [form, setForm] = useState(initial);
    const set = (key) => (e) => { const { value } = e.target; setForm((f) => ({ ...f, [key]: value })); };
    const dirty = Object.keys(form).some((k) => form[k] !== initial[k]);
    return (
        <form className="tw-flex tw-flex-col tw-gap-3" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
            <div className="dsr-form-grid">
                <label className={LABEL}>Name<input className={FIELD} maxLength={255} value={form.requester_name} onChange={set("requester_name")} /></label>
                <label className={LABEL}>Email<input type="email" className={FIELD} maxLength={255} value={form.requester_email} onChange={set("requester_email")} /></label>
                <label className={LABEL}>Consent ID<input className={FIELD} maxLength={255} value={form.consent_id} onChange={set("consent_id")} /></label>
                <label className={LABEL}>Assignee<input className={FIELD} maxLength={255} value={form.assignee} onChange={set("assignee")} /></label>
            </div>
            <label className={LABEL}>Internal notes<textarea className={AREA} rows={3} maxLength={4000} value={form.notes} onChange={set("notes")} style={{ resize: "vertical" }} /></label>
            <div><Button type="submit" size="sm" variant="secondary" loading={saving} disabled={!dirty}>Save details</Button></div>
        </form>
    );
}

export default function DSRDetail() {
    const { id, requestId } = useParams();
    const [data, setData] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [panel, setPanel] = useState(null); // null | "complete" | "reject" | "extend"
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [openVendors, setOpenVendors] = useState(null); // the outcome waiting on "complete anyway"

    useEffect(() => {
        let live = true;
        setLoadError(null);
        fetchDsr(`?id=${encodeURIComponent(requestId)}`)
            .then((d) => { if (live) setData(d); })
            .catch((e) => { if (live) setLoadError(e.message); });
        return () => { live = false; };
    }, [requestId, attempt]);

    async function run(action, values = {}) {
        setBusy(true);
        setError(null);
        try {
            setData(await postDsr({ action, id: requestId, ...values }));
            setPanel(null);
            setOpenVendors(null);
        } catch (e) {
            if (e.data?.open_vendors) { setOpenVendors({ names: e.data.open_vendors, values }); setPanel(null); }
            else setError(e.message);
        } finally {
            setBusy(false);
        }
    }

    const back = <Link to={`/${id}/reports/dsr`} className="dsr-back">All requests</Link>;
    const frame = (body) => (
        <>
            <StickyPageTitle title="Data subject request" />
            <div className="dashboard-content">{back}{body}</div>
        </>
    );

    if (loadError === "Request not found") return frame(<EmptyState title="Request not found" message="It may have been opened from another organisation." />);
    if (loadError) return frame(<ErrorState title="This request couldn't be loaded" message={loadError} onRetry={() => setAttempt((n) => n + 1)} />);
    if (!data) return frame(<Skeleton className="tw-h-64 tw-w-full" />);

    const { request, events } = data;
    document.title = `Data subject request | Reports | Intastellar Consents`;
    const closed = isClosed(request);
    const locked = Boolean(request.anonymized_at);
    const limit = latestExtension(request.due_at, request.regulation);
    const canExtend = !closed && !request.extended_until && limit;
    const consentPath = request.consent_id ? reportsPath(id, request.domain, `/user-consents/${encodeURIComponent(request.consent_id)}`) : null;
    const identityWarning = !closed && NEEDS_IDENTITY.has(request.type) && !request.identity_verified_at;

    return frame(
        <div className="dsr-detail">
            <div className="tw-flex tw-flex-col tw-gap-5 tw-min-w-0">
                <Card
                    title={requesterName(request)}
                    description={`${typeLabel(request.type)} request`}
                    actions={<DsrStatusBadge request={request} />}
                >
                    {locked && <p className="tw-m-0 tw-mb-4 tw-text-sm tw-text-text-muted">Personal details were removed {formatDate(request.anonymized_at)}, 3 years after this request closed.</p>}
                    <dl className="dsr-facts">
                        <Fact label="Email">{request.requester_email}</Fact>
                        <Fact label="Consent ID">{request.consent_id && <code className="tw-text-xs">{request.consent_id}</code>}</Fact>
                        <Fact label="Domain">{request.domain || "Not domain-specific"}</Fact>
                        <Fact label="Regulation">{FRAMEWORK_LABELS[request.regulation] || request.regulation}</Fact>
                        <Fact label="Assignee">{request.assignee || "Unassigned"}</Fact>
                        <Fact label="Identity verified">{request.identity_verified_at ? formatDate(request.identity_verified_at) : "Not yet"}</Fact>
                        {request.source === "public_form" && <Fact label="Received through">Public form, email confirmed</Fact>}
                        {request.outcome && <div className="dsr-facts__wide"><Fact label="How it was answered">{request.outcome}</Fact></div>}
                        {request.rejection_reason && <div className="dsr-facts__wide"><Fact label="Why it was rejected">{request.rejection_reason}</Fact></div>}
                        {request.notes && <div className="dsr-facts__wide"><Fact label="Internal notes">{request.notes}</Fact></div>}
                    </dl>
                    {consentPath && <Link to={consentPath} className="tw-inline-block tw-mt-4 tw-text-sm tw-font-semibold tw-text-accent-strong">View consent records</Link>}
                </Card>

                {!locked && (
                    <Card title="Handle this request">
                        <div className="tw-flex tw-flex-col tw-gap-3">
                            {identityWarning && <p className="tw-m-0 tw-text-sm tw-text-warning">Confirm who this person is before you hand over or change any data.</p>}
                            <div className="tw-flex tw-flex-wrap tw-gap-2">
                                {request.status === "pending" && <Button variant="primary" loading={busy} onClick={() => run("start")}>Mark in progress</Button>}
                                {!closed && !request.identity_verified_at && <Button variant="secondary" disabled={busy} onClick={() => run("verify_identity")}>Mark identity verified</Button>}
                                {!closed && <Button variant="secondary" disabled={busy} onClick={() => setPanel("complete")}>Complete</Button>}
                                {!closed && <Button variant="secondary" disabled={busy} onClick={() => setPanel("reject")}>Reject</Button>}
                                {canExtend && <Button variant="ghost" disabled={busy} onClick={() => setPanel("extend")}>Extend deadline</Button>}
                                {closed && <Button variant="secondary" loading={busy} onClick={() => run("reopen")}>Reopen</Button>}
                            </div>
                            {panel === "complete" && <StepForm key="complete" label="How was it answered?" field="outcome" hint="Kept as evidence, for example what was sent or deleted and when." submit="Complete request" saving={busy} onCancel={() => setPanel(null)} onSubmit={(v) => run("complete", { outcome: v.outcome })} />}
                            {panel === "reject" && <StepForm key="reject" label="Why is it being rejected?" field="reason" hint="The person must be told the reason and that they can complain to a supervisory authority." submit="Reject request" saving={busy} onCancel={() => setPanel(null)} onSubmit={(v) => run("reject", { reason: v.reason })} />}
                            {panel === "extend" && (
                                <StepForm key="extend" label="Why is more time needed?" field="reason" hint="The person must be told about the extension and why, within the original deadline." submit="Extend deadline" saving={busy} onCancel={() => setPanel(null)} onSubmit={(v) => run("extend", v)}>
                                    {(value, setValue) => (
                                        <label className={LABEL}>New deadline (latest {formatDate(limit)})
                                            <input type="date" className={FIELD} required value={value} max={limit.toISOString().slice(0, 10)} onChange={(e) => setValue(e.target.value)} style={{ colorScheme: "dark" }} />
                                        </label>
                                    )}
                                </StepForm>
                            )}
                            {openVendors && (
                                <div role="alert" className="tw-flex tw-flex-col tw-gap-2 tw-p-3 tw-bg-bg-sunken tw-rounded-lg tw-text-sm tw-text-text-secondary">
                                    <p className="tw-m-0">These vendors haven't been dealt with yet: {openVendors.names.join(", ")}. GDPR Art. 19 expects them to be told, unless that's impossible or disproportionate.</p>
                                    <div className="tw-flex tw-gap-2">
                                        <Button size="sm" variant="secondary" loading={busy} onClick={() => run("complete", { ...openVendors.values, confirm_open_vendors: true })}>Complete anyway</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setOpenVendors(null)}>Go back</Button>
                                    </div>
                                </div>
                            )}
                            {error && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{error}</p>}
                        </div>
                    </Card>
                )}

                {!locked && data.notice_required && <VendorChecklist request={request} vendors={data.vendors} onData={setData} />}

                {!locked && <Card title="Details"><DetailsForm key={request.updated_at} request={request} saving={busy} onSave={(form) => run("update", form)} /></Card>}
            </div>

            <div className="tw-flex tw-flex-col tw-gap-5 tw-min-w-0">
                <Card title="Deadline">
                    <dl className="tw-m-0 tw-flex tw-flex-col tw-gap-3">
                        <Fact label="Received">{formatDate(request.received_at)}</Fact>
                        <Fact label={request.extended_until ? "Original deadline" : "Due"}>{formatDate(request.due_at)}</Fact>
                        {request.extended_until && <Fact label="Extended to">{formatDate(request.extended_until)}</Fact>}
                        {request.extension_reason && <Fact label="Reason for extension">{request.extension_reason}</Fact>}
                        {closed ? <Fact label="Closed">{formatDate(request.closed_at)}</Fact> : <Fact label="Time left"><span className={request.overdue ? "tw-text-danger-text" : undefined}>{daysLeftLabel(request)}</span></Fact>}
                    </dl>
                </Card>
                <Card title="History">
                    <ol className="dsr-history">
                        {events.map((event, i) => (
                            <li key={i}>
                                <span className="tw-block tw-text-sm tw-text-text-primary">{EVENT_LABEL[event.action] || event.action}{event.detail?.vendor ? `: ${event.detail.vendor}` : ""}</span>
                                <span className="tw-block tw-text-xs tw-text-text-muted">{formatDateTime(event.created_at)}{event.actor ? ` · ${event.actor}` : ""}</span>
                            </li>
                        ))}
                    </ol>
                </Card>
            </div>
        </div>
    );
}
