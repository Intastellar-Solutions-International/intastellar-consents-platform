import { Badge, Button, Card } from "../../Components/ui";
import { ScannerHost } from "../../API/host";
import Authentication from "../../Authentication/Auth.js";
import { VENDOR_STATUSES, vendorMessage } from "../../Functions/dsr.js";
import { formatDate } from "../../Functions/format.js";
import appStorage from "../../Functions/storage.js";
import { AREA, FIELD, LABEL, postDsr } from "./dsrShared.js";

const { useState } = React;

function companyName() {
    try {
        return JSON.parse(appStorage.getItem("organisation"))?.name || "";
    } catch {
        return "";
    }
}

async function reconnectForDeletion(platform, domain) {
    const params = new URLSearchParams({ platform, domain, returnPath: window.location.pathname, org: Authentication.getOrganisation(), deletion: "1" });
    const response = await fetch(`${ScannerHost}/api/ad-oauth-start?${params}`);
    const data = await response.json();
    if (!response.ok || !data.authUrl) throw new Error("The connection couldn't be started.");
    window.location.href = data.authUrl;
}

function MessagePanel({ request, vendor }) {
    const [copied, setCopied] = useState(false);
    const { subject, body } = vendorMessage(request, vendor.vendor, companyName());
    const copy = () => navigator.clipboard.writeText(`${subject}\n\n${body}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    return (
        <div className="tw-flex tw-flex-col tw-gap-2">
            <p className="tw-m-0 tw-text-xs tw-text-text-muted">Subject: {subject}</p>
            <textarea className={AREA} rows={8} readOnly value={body} aria-label={`Message to ${vendor.vendor}`} style={{ resize: "vertical" }} />
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                <Button size="sm" variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy message"}</Button>
                {vendor.contact && <a className="tw-text-sm tw-text-accent-strong" href={`mailto:${encodeURIComponent(vendor.contact)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in email</a>}
                {vendor.privacy_url && <a className="tw-text-sm tw-text-accent-strong" href={vendor.privacy_url} target="_blank" rel="noopener noreferrer">Vendor's privacy page</a>}
            </div>
            {!vendor.contact && <p className="tw-m-0 tw-text-xs tw-text-text-muted">Add the vendor's privacy contact under Details to open this in your email.</p>}
        </div>
    );
}

function DetailsPanel({ vendor, onSave, saving }) {
    const [form, setForm] = useState({ contact: vendor.contact || "", method: vendor.method || "", note: vendor.note || "" });
    const set = (key) => (e) => { const { value } = e.target; setForm((f) => ({ ...f, [key]: value })); };
    return (
        <form className="tw-flex tw-flex-col tw-gap-2" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
            <div className="dsr-form-grid">
                <label className={LABEL}>Privacy contact<input className={FIELD} maxLength={255} placeholder="privacy@vendor.com" value={form.contact} onChange={set("contact")} /></label>
                <label className={LABEL}>How they were told<input className={FIELD} maxLength={255} placeholder="Email, web form, portal" value={form.method} onChange={set("method")} /></label>
            </div>
            <label className={LABEL}>Note<textarea className={AREA} rows={2} maxLength={4000} value={form.note} onChange={set("note")} style={{ resize: "vertical" }} /></label>
            <div><Button type="submit" size="sm" variant="secondary" loading={saving}>Save</Button></div>
        </form>
    );
}

function DeletePanel({ request, vendor, onRun, saving }) {
    const [identifier, setIdentifier] = useState("");
    const { deletion } = vendor;
    const [error, setError] = useState(null);
    if (!deletion.ready) {
        return (
            <div className="tw-flex tw-flex-col tw-gap-2 tw-text-sm tw-text-text-secondary">
                <p className="tw-m-0">{deletion.reason}</p>
                {deletion.reconnect && (
                    <div>
                        <Button size="sm" variant="secondary" onClick={() => reconnectForDeletion(deletion.reconnect, request.domain).catch((e) => setError(e.message))}>Reconnect with deletion permission</Button>
                    </div>
                )}
                {error && <p role="alert" className="tw-m-0 tw-text-danger-text">{error}</p>}
            </div>
        );
    }
    return (
        <form className="tw-flex tw-flex-col tw-gap-2" onSubmit={(e) => { e.preventDefault(); onRun(identifier); }}>
            <p className="tw-m-0 tw-text-sm tw-text-text-secondary">
                {deletion.usesEmail ? `This sends ${request.requester_email} to ${deletion.label} to remove it.` : `This asks ${deletion.label} to delete this person.`} It can't be undone.
            </p>
            {deletion.identifier && <label className={LABEL}>{deletion.identifier}<input className={FIELD} required maxLength={255} value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></label>}
            <div><Button type="submit" size="sm" variant="primary" loading={saving}>Delete from {deletion.label}</Button></div>
        </form>
    );
}

function VendorRow({ request, vendor, onData, onResult }) {
    const [panel, setPanel] = useState(null); // null | "message" | "details" | "delete"
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const toggle = (name) => setPanel((p) => (p === name ? null : name));

    async function send(body, after) {
        setSaving(true);
        setError(null);
        try {
            const data = await postDsr({ id: request.id, vendor: vendor.vendor, ...body });
            onData(data);
            if (data.deletion_message) onResult(data.deletion_message);
            if (after) after();
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }
    const update = (values) => send({ action: "vendor_update", status: vendor.status, contact: vendor.contact, method: vendor.method, note: vendor.note, ...values }, () => setPanel(null));

    return (
        <li className="dsr-vendor">
            <div className="dsr-vendor__row">
                <div className="tw-min-w-0">
                    <span className="tw-block tw-text-sm tw-font-semibold tw-text-text-primary tw-break-words">{vendor.vendor}</span>
                    {vendor.notified_at && <span className="tw-block tw-text-xs tw-text-text-muted">Told {formatDate(vendor.notified_at)}{vendor.method ? ` · ${vendor.method}` : ""}</span>}
                </div>
                <select className={FIELD} aria-label={`Status for ${vendor.vendor}`} value={vendor.status} disabled={saving} onChange={(e) => update({ status: e.target.value })} style={{ colorScheme: "dark" }}>
                    {VENDOR_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <div className="tw-flex tw-flex-wrap tw-gap-1">
                    <Button size="sm" variant="ghost" aria-expanded={panel === "message"} onClick={() => toggle("message")}>Message</Button>
                    <Button size="sm" variant="ghost" aria-expanded={panel === "details"} onClick={() => toggle("details")}>Details</Button>
                    {vendor.deletion && <Button size="sm" variant="ghost" aria-expanded={panel === "delete"} onClick={() => toggle("delete")}>Delete via API</Button>}
                </div>
            </div>
            {panel && (
                <div className="tw-p-3 tw-bg-bg-sunken tw-rounded-lg">
                    {panel === "message" && <MessagePanel request={request} vendor={vendor} />}
                    {panel === "details" && <DetailsPanel vendor={vendor} saving={saving} onSave={update} />}
                    {panel === "delete" && <DeletePanel request={request} vendor={vendor} saving={saving} onRun={(identifier) => send({ action: "vendor_delete", confirm: true, identifier }, () => setPanel(null))} />}
                </div>
            )}
            {error && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{error}</p>}
        </li>
    );
}

/** Who has to be told about this request, and what happened when they were (GDPR Art. 19). */
export default function VendorChecklist({ request, vendors, onData }) {
    const [name, setName] = useState("");
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const open = vendors.filter((v) => v.status === "to_notify").length;

    async function add(e) {
        e.preventDefault();
        setError(null);
        try {
            onData(await postDsr({ action: "vendor_add", id: request.id, vendor: name }));
            setName("");
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <Card
            title="Tell the vendors"
            description="Everyone who received this person's data must be told, unless that's impossible or disproportionate."
            actions={open > 0 ? <Badge tone="warning" icon="alert-triangle">{open} to notify</Badge> : vendors.length > 0 ? <Badge tone="success" icon="check-circle">All dealt with</Badge> : undefined}
        >
            <div className="tw-flex tw-flex-col tw-gap-3">
                {vendors.length === 0 && <p className="tw-m-0 tw-text-sm tw-text-text-muted">No vendors found from a scan for this request. Add them below.</p>}
                {result && <p role="status" className="tw-m-0 tw-text-sm tw-text-success">{result}</p>}
                <ul className="dsr-vendors">
                    {vendors.map((v) => <VendorRow key={v.id} request={request} vendor={v} onData={onData} onResult={setResult} />)}
                </ul>
                <form className="tw-flex tw-gap-2 tw-items-end" onSubmit={add}>
                    <label className={`${LABEL} tw-flex-1`}>Add a vendor<input className={FIELD} maxLength={255} value={name} onChange={(e) => setName(e.target.value)} /></label>
                    <Button type="submit" variant="secondary" disabled={!name.trim()}>Add</Button>
                </form>
                {error && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{error}</p>}
            </div>
        </Card>
    );
}
