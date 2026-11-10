import StickyPageTitle from "../../Components/Header/Sticky";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "../../Components/ui";
import { reportsPath } from "../../Functions/domainPathSegments.js";
import { IDENTITY_METHODS, latestExtension } from "../../Functions/dsr.js";
import { formatDate, formatDateTime } from "../../Functions/format.js";
import { parseConsentTimestamp } from "../../Functions/consentTimestamp.js";
import { AREA, DsrStatusBadge, FIELD, LABEL, daysLeftLabel, fetchDsr, isClosed, legalDate, postDsr, regulationLabel, requesterName, typeLabel } from "./dsrShared.js";
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
    vendor_update: "Checklist item changed",
    email_confirmed: "Email address confirmed by the requester",
    mark_test: "Test flag changed",
    pause_clock: "Deadline paused, waiting for identity",
    resume_clock: "Deadline restarted",
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

const today = () => new Date().toISOString().slice(0, 10);

/** One step that has to leave a record: asks for what the record needs, then confirms. */
function StepForm({ label, field, hint, submit, onCancel, onSubmit, saving, initial = {}, extra, valid = () => true }) {
    const [text, setText] = useState("");
    const [values, setValues] = useState(initial);
    return (
        <form className="tw-flex tw-flex-col tw-gap-3 tw-p-3 tw-bg-bg-sunken tw-rounded-lg" onSubmit={(e) => { e.preventDefault(); onSubmit({ [field]: text, ...values }); }}>
            {extra && <div className="dsr-form-grid">{extra(values, (key, value) => setValues((v) => ({ ...v, [key]: value })))}</div>}
            <label className={LABEL}>{label}<textarea className={AREA} rows={3} required maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} style={{ resize: "vertical" }} /></label>
            {hint && <p className="tw-m-0 tw-text-xs tw-text-text-muted">{hint}</p>}
            <div className="tw-flex tw-gap-2">
                <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!valid(values)}>{submit}</Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
        </form>
    );
}

function ToldOn({ label, values, set }) {
    return <label className={LABEL}>{label}<input type="date" className={FIELD} required max={today()} value={values.notified_on || ""} onChange={(e) => set("notified_on", e.target.value)} style={{ colorScheme: "dark" }} /></label>;
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
    const [panel, setPanel] = useState(null); // null | "verify" | "pause" | "complete" | "reject" | "extend"
    const [consentMessage, setConsentMessage] = useState(null);
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
            const next = await postDsr({ action, id: requestId, ...values });
            setData(next);
            setConsentMessage(next.consent_message || null);
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
                    actions={<span className="tw-flex tw-items-center tw-gap-2">{request.is_test && <Badge tone="neutral">Test</Badge>}<DsrStatusBadge request={request} /></span>}
                >
                    {locked && <p className="tw-m-0 tw-mb-4 tw-text-sm tw-text-text-muted">Personal details were removed {formatDate(request.anonymized_at)}, 3 years after this request closed.</p>}
                    <dl className="dsr-facts">
                        <Fact label="Email">{request.requester_email}</Fact>
                        <Fact label="Consent ID">{request.consent_id && <code className="tw-text-xs">{request.consent_id}</code>}</Fact>
                        <Fact label="Domain">{request.domain || "Not domain-specific"}</Fact>
                        <Fact label="Regulation">{regulationLabel(request.regulation)}</Fact>
                        <Fact label="Assignee">{request.assignee || "Unassigned"}</Fact>
                        <Fact label="Identity verified">{request.identity_verified_at ? `${formatDate(request.identity_verified_at)} · ${IDENTITY_METHODS.find((m) => m.id === request.identity_method)?.label || "Method not recorded"}${request.identity_verified_by ? ` · ${request.identity_verified_by}` : ""}` : "Not yet"}</Fact>
                        {request.identity_note && <div className="dsr-facts__wide"><Fact label="What was checked">{request.identity_note}</Fact></div>}
                        {request.source === "public_form" && <Fact label="Received through">Public form, email confirmed. <Link to={`/${id}/reports/dsr?setup=form`} className="tw-text-accent-strong">Form settings</Link></Fact>}
                        {request.outcome && <div className="dsr-facts__wide"><Fact label="What was done">{request.outcome}</Fact></div>}
                        {request.rejection_reason && <div className="dsr-facts__wide"><Fact label="Why it was rejected">{request.rejection_reason}</Fact></div>}
                        {request.requester_notified_on && <Fact label="Requester told">{legalDate(request.requester_notified_on)}{request.complaint_notice_given ? ", including the right to complain" : ""}</Fact>}
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
                                {!closed && !request.identity_verified_at && <Button variant="secondary" disabled={busy} onClick={() => setPanel("verify")}>Mark identity verified</Button>}
                                {request.can_pause && <Button variant="ghost" disabled={busy} onClick={() => setPanel("pause")}>Pause for identity</Button>}
                                {request.paused && <Button variant="ghost" loading={busy} onClick={() => run("resume_clock")}>Restart the deadline</Button>}
                                {!closed && <Button variant="secondary" disabled={busy} onClick={() => setPanel("complete")}>Complete</Button>}
                                {!closed && <Button variant="secondary" disabled={busy} onClick={() => setPanel("reject")}>Reject</Button>}
                                {canExtend && <Button variant="ghost" disabled={busy} onClick={() => setPanel("extend")}>Extend deadline</Button>}
                                {closed && <Button variant="secondary" loading={busy} onClick={() => run("reopen")}>Reopen</Button>}
                            </div>
                            {panel === "verify" && (
                                <StepForm
                                    key="verify" label="What was checked?" field="note" submit="Record verification" saving={busy}
                                    hint="Keep only what's needed to show the check happened, not copies of documents."
                                    initial={{ method: "email" }} onCancel={() => setPanel(null)} onSubmit={(v) => run("verify_identity", v)}
                                    extra={(values, set) => (
                                        <label className={LABEL}>How identity was verified
                                            <select className={FIELD} value={values.method} onChange={(e) => set("method", e.target.value)} style={{ colorScheme: "dark" }}>
                                                {IDENTITY_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                                            </select>
                                        </label>
                                    )}
                                />
                            )}
                            {panel === "pause" && (
                                <StepForm
                                    key="pause" label="What did you ask them for?" field="reason" submit="Pause the deadline" saving={busy}
                                    hint="Only when you have real doubts about who this is, and ask without delay. The deadline moves by the days it was paused, and restarts when identity is verified."
                                    initial={{ notified_on: today() }} onCancel={() => setPanel(null)} onSubmit={(v) => run("pause_clock", v)}
                                    extra={(values, set) => <ToldOn label="Asked on" values={values} set={set} />}
                                />
                            )}
                            {panel === "complete" && (
                                <StepForm
                                    key="complete" label="What was done?" field="outcome" hint="Kept as evidence, for example what was sent, restricted or deleted." submit="Complete request" saving={busy}
                                    initial={{ notified_on: today() }} onCancel={() => setPanel(null)} onSubmit={(v) => run("complete", v)}
                                    extra={(values, set) => <ToldOn label="Requester told on" values={values} set={set} />}
                                />
                            )}
                            {panel === "reject" && (
                                <StepForm
                                    key="reject" label="Why is it being rejected?" field="reason" submit="Reject request" saving={busy}
                                    initial={{ notified_on: today(), complaint_notice: false }} valid={(v) => v.complaint_notice} onCancel={() => setPanel(null)} onSubmit={(v) => run("reject", v)}
                                    extra={(values, set) => (
                                        <>
                                            <ToldOn label="Requester told on" values={values} set={set} />
                                            <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-text-secondary">
                                                <input type="checkbox" required checked={values.complaint_notice} onChange={(e) => set("complaint_notice", e.target.checked)} />
                                                I told them the reason and that they can complain to a supervisory authority or go to court.
                                            </label>
                                        </>
                                    )}
                                />
                            )}
                            {panel === "extend" && (
                                <StepForm
                                    key="extend" label="Why is more time needed?" field="reason" hint="The person must be told about the extension and why, within the original deadline." submit="Extend deadline" saving={busy}
                                    initial={{ notified_on: today() }} onCancel={() => setPanel(null)} onSubmit={(v) => run("extend", v)}
                                    extra={(values, set) => (
                                        <>
                                            <label className={LABEL}>New deadline (latest {legalDate(limit)})
                                                <input type="date" className={FIELD} required value={values.extended_until || ""} max={limit.toISOString().slice(0, 10)} onChange={(e) => set("extended_until", e.target.value)} style={{ colorScheme: "dark" }} />
                                            </label>
                                            <ToldOn label="Requester told on" values={values} set={set} />
                                        </>
                                    )}
                                />
                            )}
                            {openVendors && (
                                <div role="alert" className="tw-flex tw-flex-col tw-gap-2 tw-p-3 tw-bg-bg-sunken tw-rounded-lg tw-text-sm tw-text-text-secondary">
                                    <p className="tw-m-0">These haven't been dealt with yet: {openVendors.names.join(", ")}.</p>
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

                {request.consent_id && data.consent && !locked && (
                    <Card title="Consent record" description="From your consent log, for this consent ID.">
                        {!data.consent.available && <p className="tw-m-0 tw-text-sm tw-text-text-muted">The consent log couldn't be reached.</p>}
                        {data.consent.available && !data.consent.found && <p className="tw-m-0 tw-text-sm tw-text-text-muted">No consent records were found for this ID{request.domain ? ` on ${request.domain}` : ""}.</p>}
                        {data.consent.found && (
                            <div className="tw-flex tw-flex-col tw-gap-3">
                                <dl className="dsr-facts">
                                    <Fact label="Records">{data.consent.count}</Fact>
                                    <Fact label="Latest">{data.consent.last_at ? formatDateTime(parseConsentTimestamp(data.consent.last_at)) : null}</Fact>
                                    <Fact label="Accepted at some point">{data.consent.accepted.join(", ") || "Nothing"}</Fact>
                                    <Fact label="Never accepted">{data.consent.declined.join(", ") || "Nothing shown"}</Fact>
                                </dl>
                                {data.consent.partial && <p className="tw-m-0 tw-text-xs tw-text-text-muted">Some records only name one category, so other categories may be missing here.</p>}
                                {data.notice_required && !closed && (
                                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                                        <Button size="sm" variant="secondary" loading={busy} onClick={() => run("apply_consent")}>Update vendor list from this</Button>
                                        {consentMessage && <span role="status" className="tw-text-sm tw-text-success">{consentMessage}</span>}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                )}

                {!locked && <VendorChecklist kind="system" request={request} vendors={data.vendors.filter((v) => v.kind === "system")} onData={setData} />}
                {!locked && data.notice_required && <VendorChecklist kind="vendor" request={request} vendors={data.vendors.filter((v) => v.kind !== "system")} onData={setData} />}

                {!locked && (
                    <Card title="Details">
                        <DetailsForm key={request.updated_at} request={request} saving={busy} onSave={(form) => run("update", form)} />
                        <label className="tw-flex tw-items-center tw-gap-2 tw-mt-4 tw-text-sm tw-text-text-secondary">
                            <input type="checkbox" disabled={busy} checked={Boolean(request.is_test)} onChange={(e) => run("mark_test", { is_test: e.target.checked })} />
                            This is a test request, so leave it out of counts and exports
                        </label>
                    </Card>
                )}
            </div>

            <div className="tw-flex tw-flex-col tw-gap-5 tw-min-w-0">
                <Card title="Deadline">
                    <dl className="tw-m-0 tw-flex tw-flex-col tw-gap-3">
                        <Fact label="Received">{legalDate(request.received_at)}</Fact>
                        <Fact label={request.extended_until ? "Original deadline" : "Due"}>{legalDate(request.due_at)}</Fact>
                        {request.extended_until && <Fact label="Extended to">{legalDate(request.extended_until)}</Fact>}
                        {request.extension_notified_on && <Fact label="Told about extension">{legalDate(request.extension_notified_on)}</Fact>}
                        {request.extension_reason && <Fact label="Reason for extension">{request.extension_reason}</Fact>}
                        {request.paused && <Fact label="Paused since">{legalDate(request.paused_at)}</Fact>}
                        {request.paused_reason && <Fact label="Asked them for">{request.paused_reason}</Fact>}
                        {request.paused_days > 0 && <Fact label="Added for pauses">{request.paused_days} day{request.paused_days === 1 ? "" : "s"}</Fact>}
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
