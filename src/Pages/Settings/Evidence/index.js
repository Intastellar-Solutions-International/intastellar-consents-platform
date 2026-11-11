import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import appStorage from "../../../Functions/storage.js";
import { Badge, Button, Card, Table, Tabs, TabPanel, FilterBar, FilterSelect, FilterSearch, FilterChip, FileDropzone } from "../../../Components/ui";
import DocumentPreview from "../../../Components/Evidence/DocumentPreview.js";
import {
    loadEvidence, uploadEvidence, deleteEvidence, inviteControlPerson, resendInvite, revokeInvite, downloadEvidence,
    formatDay, formatBytes, EVIDENCE_ACCEPT, EVIDENCE_MAX_BYTES,
} from "../../../Functions/evidenceClient.js";
import "../Style.css";

const { useState, useEffect, useMemo } = React;

const FIELD = "tw-h-10 tw-w-full tw-px-2 tw-bg-bg-sunken tw-text-text-primary tw-border tw-border-solid tw-border-border-strong tw-rounded-md tw-font-sans tw-text-sm focus-visible:tw-outline-none focus-visible:tw-shadow-focus";
const LABEL = "tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-text-text-muted tw-min-w-0";
const GRID = { gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" };
const ORGANISATION = "__organisation";
const ACTIONS = { sign_in: "Signed in", view: "Opened", download: "Downloaded" };

const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const organisationName = () => { try { return JSON.parse(appStorage.getItem("organisation"))?.name || ""; } catch { return ""; } };

function inviteStatus(invite) {
    if (invite.revoked_at) return <Badge tone="neutral" icon="x-circle">Revoked</Badge>;
    if (new Date(invite.expires_at) < new Date()) return <Badge tone="neutral" icon="clock">Expired</Badge>;
    return <Badge tone="success" icon="check-circle">Active</Badge>;
}

function UploadCard({ types, vendors, onUploaded }) {
    const [scope, setScope] = useState(ORGANISATION);
    const [vendor, setVendor] = useState("");
    const [docType, setDocType] = useState("privacy_policy");
    const [title, setTitle] = useState("");
    const [state, setState] = useState(null); // null | "busy" | error text
    const forVendor = scope !== ORGANISATION;
    const typeOptions = forVendor ? types.vendor : types.organisation;

    function changeScope(value) {
        setScope(value);
        setDocType(value === ORGANISATION ? "privacy_policy" : "dpa");
    }

    async function upload(file) {
        const name = forVendor ? vendor.trim() : null;
        if (forVendor && !name) { setState("Enter the vendor this document belongs to."); return; }
        setState("busy");
        try {
            onUploaded(await uploadEvidence({ vendor: name, docType, title, file }));
            setTitle("");
            setState(null);
        } catch (e) {
            setState(e.message);
        }
    }

    return (
        <Card title="Upload a document" description="A vendor holds one current DPA: uploading a new one keeps the old one as history. Everything else can have as many documents as you need.">
            <div className="tw-grid tw-gap-3 tw-mb-3" style={GRID}>
                <label className={LABEL}>
                    Applies to
                    <select className={FIELD} value={scope} onChange={(e) => changeScope(e.target.value)} style={{ colorScheme: "dark" }}>
                        <option value={ORGANISATION}>The organisation</option>
                        <option value="vendor">A vendor</option>
                    </select>
                </label>
                {forVendor && (
                    <label className={LABEL}>
                        Vendor
                        <input className={FIELD} list="evidence-vendors" value={vendor} maxLength={255} placeholder="HubSpot" onChange={(e) => setVendor(e.target.value)} />
                        <datalist id="evidence-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
                    </label>
                )}
                <label className={LABEL}>
                    Type
                    <select className={FIELD} value={docType} onChange={(e) => setDocType(e.target.value)} style={{ colorScheme: "dark" }}>
                        {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </label>
                <label className={LABEL}>
                    Title <span className="tw-text-text-muted">(optional)</span>
                    <input className={FIELD} value={title} maxLength={160} placeholder={typeOptions.find((t) => t.id === docType)?.label} onChange={(e) => setTitle(e.target.value)} />
                </label>
            </div>
            <FileDropzone
                title="Drag and drop the document"
                hint="PDF, PNG or JPEG, up to 3 MB"
                accept={EVIDENCE_ACCEPT}
                maxBytes={EVIDENCE_MAX_BYTES}
                busy={state === "busy"}
                error={state && state !== "busy" ? state : null}
                onFile={upload}
            />
        </Card>
    );
}

function DocumentsTab({ catalog, setCatalog, vendors }) {
    const [search, setSearch] = useState("");
    const [scope, setScope] = useState("all");
    const [type, setType] = useState("all");
    const [showReplaced, setShowReplaced] = useState(false);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const allTypes = [...catalog.types.vendor, ...catalog.types.organisation];
    const labelOf = (doc) => (doc.vendor ? catalog.types.vendor : catalog.types.organisation).find((t) => t.id === doc.doc_type)?.label || doc.doc_type;

    const rows = useMemo(() => catalog.documents.filter((d) => {
        if (!showReplaced && d.superseded_at) return false;
        if (scope === ORGANISATION && d.vendor) return false;
        if (scope !== "all" && scope !== ORGANISATION && d.vendor !== scope) return false;
        if (type !== "all" && d.doc_type !== type) return false;
        const q = search.trim().toLowerCase();
        return !q || [d.title, d.filename, d.vendor].some((v) => String(v || "").toLowerCase().includes(q));
    }), [catalog.documents, search, scope, type, showReplaced]);
    const docVendors = [...new Set(catalog.documents.map((d) => d.vendor).filter(Boolean))].sort();
    const active = [search, scope !== "all", type !== "all", showReplaced].filter(Boolean).length;

    async function remove(doc) {
        if (!window.confirm(`Remove “${doc.title}”? Control persons won't see it any more.`)) return;
        try { setCatalog(await deleteEvidence(doc.id)); } catch (e) { setError(e.message); }
    }

    const columns = [
        { key: "title", header: "Document", render: (d) => (
            <span className="tw-flex tw-flex-col">
                <span className="tw-text-text-primary tw-font-medium">{d.title}</span>
                <span className="tw-text-xs tw-text-text-muted">{d.filename} {formatBytes(d.size_bytes)}</span>
            </span>
        ) },
        { key: "vendor", header: "Applies to", render: (d) => d.vendor || <span className="tw-text-text-muted">Organisation</span> },
        { key: "type", header: "Type", render: (d) => <Badge tone="neutral" icon="file-text">{labelOf(d)}</Badge> },
        { key: "uploaded", header: "Uploaded", hideOnMobile: true, render: (d) => formatDay(d.uploaded_at) },
        { key: "status", header: "Status", hideOnMobile: true, render: (d) => (d.superseded_at ? <Badge tone="neutral" icon="clock">Replaced {formatDay(d.superseded_at)}</Badge> : <Badge tone="success" icon="check-circle">Current</Badge>) },
        { key: "actions", header: <span className="tw-sr-only">Actions</span>, align: "right", render: (d) => (
            <span className="tw-inline-flex tw-gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" onClick={() => downloadEvidence(d).catch((e) => setError(e.message))}>Download</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(d)}>Remove</Button>
            </span>
        ) },
    ];

    return (
        <div className="tw-flex tw-flex-col tw-gap-5">
            <UploadCard types={catalog.types} vendors={vendors} onUploaded={setCatalog} />
            <Card title="Catalog" description="Select a document to preview it.">
                <FilterBar activeCount={active} resultCount={rows.length} onClear={() => { setSearch(""); setScope("all"); setType("all"); setShowReplaced(false); }}>
                    <FilterSearch label="Search" value={search} onChange={setSearch} placeholder="Title, file or vendor" />
                    <FilterSelect label="Applies to" value={scope} onChange={setScope}
                        options={[{ value: "all", label: "Everything" }, { value: ORGANISATION, label: "Organisation" }, ...docVendors.map((v) => ({ value: v, label: v }))]} />
                    <FilterSelect label="Type" value={type} onChange={setType}
                        options={[{ value: "all", label: "All types" }, ...[...new Map(allTypes.map((t) => [t.id, t])).values()].map((t) => ({ value: t.id, label: t.label }))]} />
                    <FilterChip label="Show replaced DPAs" pressed={showReplaced} onToggle={() => setShowReplaced((v) => !v)} />
                </FilterBar>
                {error && <p role="alert" className="tw-mt-3 tw-mb-0 tw-text-sm tw-text-danger-text">{error}</p>}
                <Table
                    className="tw-mt-3"
                    caption="Evidence documents"
                    columns={columns}
                    rows={rows}
                    getRowKey={(d) => d.id}
                    onRowClick={setPreview}
                    selectedKey={preview?.id}
                    empty={{ title: catalog.documents.length ? "No matching documents" : "No documents yet", message: catalog.documents.length ? "Nothing matches the current filters." : "Upload a DPA or policy above to start the catalog." }}
                />
            </Card>
            <DocumentPreview doc={preview} typeLabel={preview ? labelOf(preview) : ""} onClose={() => setPreview(null)} />
        </div>
    );
}

function ControlPersonsTab({ catalog, setCatalog }) {
    const [form, setForm] = useState({ name: "", email: "", expires_on: inDays(30), note: "" });
    const [state, setState] = useState(null); // null | "busy" | { ok | error }
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    async function act(action, success) {
        setState("busy");
        try {
            const result = await action();
            setCatalog(result);
            setState(result.sent === false ? { error: "Saved, but the email couldn't be sent. Use Send again." } : { ok: success });
            return true;
        } catch (e) {
            setState({ error: e.message });
            return false;
        }
    }

    async function invite(e) {
        e.preventDefault();
        if (await act(() => inviteControlPerson({ ...form, organisation_name: organisationName() }), `Invitation sent to ${form.email}.`)) {
            setForm({ name: "", email: "", expires_on: inDays(30), note: "" });
        }
    }

    const inviteColumns = [
        { key: "person", header: "Control person", render: (i) => (
            <span className="tw-flex tw-flex-col"><span className="tw-text-text-primary">{i.name || i.email}</span>{i.name && <span className="tw-text-xs tw-text-text-muted">{i.email}</span>}</span>
        ) },
        { key: "status", header: "Status", render: inviteStatus },
        { key: "until", header: "Access until", render: (i) => formatDay(i.expires_at) },
        { key: "last", header: "Last opened", hideOnMobile: true, render: (i) => (i.last_access_at ? formatDay(i.last_access_at) : <span className="tw-text-text-muted">Never</span>) },
        { key: "actions", header: <span className="tw-sr-only">Actions</span>, align: "right", render: (i) => (!i.revoked_at && new Date(i.expires_at) > new Date() ? (
            <span className="tw-inline-flex tw-gap-1">
                <Button size="sm" variant="ghost" onClick={() => act(() => resendInvite(i.id), `A new link was sent to ${i.email}. The old one no longer works.`)}>Send again</Button>
                <Button size="sm" variant="danger" onClick={() => window.confirm(`End access for ${i.email}? They're signed out straight away.`) && act(() => revokeInvite(i.id), `Access for ${i.email} ended.`)}>Revoke</Button>
            </span>
        ) : null) },
    ];
    const logColumns = [
        { key: "at", header: "When", render: (l) => new Date(l.at).toLocaleString() },
        { key: "who", header: "Who", render: (l) => l.email || <span className="tw-text-text-muted">Removed invite</span> },
        { key: "what", header: "What", render: (l) => `${ACTIONS[l.action] || l.action}${l.document_id ? ` ${l.title ? `“${l.title}”` : "a removed document"}${l.vendor ? ` (${l.vendor})` : ""}` : ""}` },
    ];

    return (
        <div className="tw-flex tw-flex-col tw-gap-5">
            <Card title="Invite a control person" description="Auditors, an external DPO or a supervisory authority get read-only access to every document and the vendor overview. They need no account: each visit, we email a one-time sign-in link to the invited address.">
                <form onSubmit={invite} className="tw-flex tw-flex-col tw-gap-3">
                    <div className="tw-grid tw-gap-3" style={GRID}>
                        <label className={LABEL}>Name <input className={FIELD} value={form.name} maxLength={120} placeholder="Jane Doe, External DPO" onChange={set("name")} /></label>
                        <label className={LABEL}>Email <input className={FIELD} type="email" required value={form.email} maxLength={254} placeholder="auditor@firm.com" onChange={set("email")} /></label>
                        <label className={LABEL}>Access until <input className={FIELD} type="date" required min={inDays(1)} max={inDays(180)} value={form.expires_on} onChange={set("expires_on")} style={{ colorScheme: "dark" }} /></label>
                    </div>
                    <label className={LABEL}>
                        Message <span className="tw-text-text-muted">(optional, shown in the email)</span>
                        <textarea className={`${FIELD} tw-h-auto tw-py-2`} rows={2} maxLength={500} value={form.note} onChange={set("note")} style={{ colorScheme: "dark", resize: "vertical" }} />
                    </label>
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                        <Button type="submit" variant="primary" size="sm" icon="shield-check" loading={state === "busy"}>Send invitation</Button>
                        {state?.ok && <span role="status" className="tw-text-xs tw-text-success">{state.ok}</span>}
                        {state?.error && <span role="alert" className="tw-text-xs tw-text-danger-text">{state.error}</span>}
                    </div>
                </form>
            </Card>
            <Card title="Invited control persons">
                <Table caption="Invited control persons" columns={inviteColumns} rows={catalog.invites} getRowKey={(i) => i.id}
                    empty={{ title: "Nobody invited yet", message: "Invite an auditor or external DPO above." }} />
            </Card>
            <Card title="Access log" description="Every sign-in, opened document and download by a control person.">
                <Table caption="Access log" columns={logColumns} rows={catalog.log} getRowKey={(l) => l.id}
                    empty={{ title: "No access yet", message: "Activity shows here once a control person signs in." }} />
            </Card>
        </div>
    );
}

export default function Evidence() {
    document.title = "Evidence Catalog | Settings | Intastellar Consents";
    const [catalog, setCatalog] = useState(null);
    const [vendorNames, setVendorNames] = useState([]);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("documents");

    useEffect(() => {
        loadEvidence().then(setCatalog).catch((e) => setError(e.message));
        const api = API.gdpr?.vendorCompliance;
        if (api) {
            fetch(api.url, { headers: api.headers })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => data?.records && setVendorNames(Object.keys(data.records)))
                .catch(() => {});
        }
    }, []);

    const vendors = useMemo(
        () => [...new Set([...vendorNames, ...(catalog?.documents || []).map((d) => d.vendor).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
        [vendorNames, catalog]
    );
    const activeInvites = (catalog?.invites || []).filter((i) => !i.revoked_at && new Date(i.expires_at) > new Date()).length;

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Evidence Catalog" />
                <p className="settings-subpage__intro">
                    DPAs, transfer documents and policies in one place, previewed right here. Invite auditors or an
                    external DPO to review them read-only, and see everything they opened.
                </p>
                {error && <p className="settings-subpage__status settings-subpage__status--error">{error}</p>}
                {!catalog && !error && <p className="tw-text-sm tw-text-text-muted" role="status">Loading the catalog…</p>}
                {catalog && (
                    <>
                        <Tabs label="Evidence catalog" idPrefix="evidence" value={tab} onChange={setTab} className="tw-mb-5"
                            tabs={[
                                { id: "documents", label: "Documents", count: catalog.documents.filter((d) => !d.superseded_at).length },
                                { id: "people", label: "Control persons", count: activeInvites },
                            ]} />
                        <TabPanel idPrefix="evidence" id="documents" active={tab === "documents"}>
                            <DocumentsTab catalog={catalog} setCatalog={setCatalog} vendors={vendors} />
                        </TabPanel>
                        <TabPanel idPrefix="evidence" id="people" active={tab === "people"}>
                            <ControlPersonsTab catalog={catalog} setCatalog={setCatalog} />
                        </TabPanel>
                    </>
                )}
            </main>
        </>
    );
}
