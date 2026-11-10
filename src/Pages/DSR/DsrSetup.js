import { Badge, Button, FileDropzone, Modal } from "../../Components/ui";
import { readCachedDomains } from "../../Functions/cachedDomains.js";
import { DEADLINE_RULES } from "../../Functions/dsr.js";
import { FIELD, LABEL, fetchDsr, postDsr, regulationLabel } from "./dsrShared.js";

const { useState, useEffect, useMemo } = React;
const formLink = (form) => (form.custom_domain && form.custom_domain_status === "active" ? `https://${form.custom_domain}` : `https://www.intastellarconsents.com/privacy-request/${form.token}`);
const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPE_BY_EXTENSION = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

/**
 * Mail clients don't show SVG or (in Outlook) WebP, so those become a PNG here,
 * where the browser can draw them. If that can't be done, the original is kept
 * and still works on the form page.
 */
function toPng(dataUri) {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            try {
                const width = image.naturalWidth || 300, height = image.naturalHeight || 150;
                const scale = Math.min(160 / height, 640 / width);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
                const png = canvas.toDataURL("image/png");
                resolve(png.length * 0.75 <= MAX_LOGO_BYTES ? png : dataUri);
            } catch {
                resolve(dataUri);
            }
        };
        image.onerror = () => resolve(dataUri);
        image.src = dataUri;
    });
}

/** Some systems report no type for an SVG, so the type comes from the file name. */
function readLogo(file) {
    return new Promise((resolve, reject) => {
        const type = LOGO_TYPE_BY_EXTENSION[file.name.split(".").pop().toLowerCase()];
        const reader = new FileReader();
        reader.onload = () => {
            const dataUri = `data:${type};base64,${String(reader.result).split(",")[1]}`;
            resolve(type === "image/png" || type === "image/jpeg" ? dataUri : toPng(dataUri));
        };
        reader.onerror = () => reject(new Error("That file couldn't be read."));
        reader.readAsDataURL(file);
    });
}

function LogoDropzone({ logo, busy, error, onLogo, onRemove }) {
    return (
        <FileDropzone
            compact
            title={logo ? "Replace your logo" : "Drag and drop your logo"}
            hint="PNG, JPEG, WebP or SVG, under 200 KB"
            accept={LOGO_ACCEPT}
            maxBytes={MAX_LOGO_BYTES}
            icon="upload"
            busy={busy}
            error={error}
            preview={logo ? <img src={logo} alt="Current logo" className="dsr-logo-preview" /> : undefined}
            actions={logo && onRemove ? <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>Remove</Button> : undefined}
            onFile={(file) => readLogo(file).then(onLogo)}
        />
    );
}

function DnsRecords({ records }) {
    return (
        <dl className="dsr-dns">
            {records.map((r) => (
                <div key={`${r.type}-${r.name}`}>
                    <dt>Type</dt><dd>{r.type}</dd>
                    <dt>Name</dt><dd><code>{r.name}</code></dd>
                    <dt>Value</dt><dd><code>{r.value}</code></dd>
                </div>
            ))}
        </dl>
    );
}

/** Lets an Agency plan show this form on its own subdomain. */
function CustomDomain({ form, access, onData }) {
    const [domain, setDomain] = useState("");
    const [state, setState] = useState(null); // null | "working" | error text
    async function run(action, extra) {
        setState("working");
        try {
            onData(await postDsr({ action, token: form.token, ...extra }));
            setState(null);
        } catch (e) {
            setState(e.message);
        }
    }
    const working = state === "working";
    const failure = state && !working ? <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{state}</p> : null;

    if (!access.allowed) return <p className="tw-m-0 tw-text-xs tw-text-text-muted">Show this form on your own domain with an Agency plan.</p>;
    if (!access.configured) return <p className="tw-m-0 tw-text-xs tw-text-warning">Custom domains aren't set up on the server yet.</p>;
    if (!form.custom_domain) {
        return (
            <form className="tw-flex tw-flex-col tw-gap-2" onSubmit={(e) => { e.preventDefault(); run("domain_connect", { domain }); }}>
                <div className="tw-flex tw-gap-2 tw-items-end">
                    <label className={`${LABEL} tw-flex-1`}>Custom domain<input className={FIELD} placeholder="privacy.yourcompany.com" maxLength={253} value={domain} onChange={(e) => setDomain(e.target.value)} /></label>
                    <Button type="submit" size="md" variant="secondary" loading={working} disabled={!domain.trim()}>Connect</Button>
                </div>
                {failure}
            </form>
        );
    }
    const active = form.custom_domain_status === "active";
    return (
        <div className="tw-flex tw-flex-col tw-gap-2">
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                <span className="tw-text-sm tw-text-text-primary tw-break-all">{form.custom_domain}</span>
                {active ? <Badge tone="success" icon="check-circle">Live</Badge> : <Badge tone="warning" icon="clock">Waiting for DNS</Badge>}
            </div>
            {!active && (
                <>
                    <p className="tw-m-0 tw-text-xs tw-text-text-muted">Add these records where the domain's DNS is managed. It can take a while to take effect. On Cloudflare, set the record to "DNS only" (grey cloud).</p>
                    <DnsRecords records={form.custom_domain_dns || []} />
                </>
            )}
            <div className="tw-flex tw-flex-wrap tw-gap-2">
                <Button size="sm" variant="secondary" loading={working} onClick={() => run("domain_check")}>Check now</Button>
                <Button size="sm" variant="ghost" disabled={working} onClick={() => run("domain_remove")}>Remove domain</Button>
            </div>
            {failure}
        </div>
    );
}

/** The settings shared by creating and editing a form. */
function FormFields({ values, onChange, domains }) {
    const set = (key) => (e) => { const { value } = e.target; onChange((v) => ({ ...v, [key]: value })); };
    const domainOptions = values.domain && !domains.includes(values.domain) ? [values.domain, ...domains] : domains;
    return (
        <div className="dsr-form-grid">
            <label className={LABEL}>Company name people will see<input className={FIELD} required maxLength={255} value={values.company_name} onChange={set("company_name")} /></label>
            <label className={LABEL}>Domain
                <select className={FIELD} value={values.domain} onChange={set("domain")} style={{ colorScheme: "dark" }}>
                    <option value="">Not domain-specific</option>
                    {domainOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
            </label>
            <label className={LABEL}>Notify this email<input type="email" className={FIELD} maxLength={255} value={values.notify_email} onChange={set("notify_email")} /></label>
            <label className={LABEL}>Regulation if the visitor is elsewhere
                <select className={FIELD} value={values.default_regulation} onChange={set("default_regulation")} style={{ colorScheme: "dark" }}>
                    {Object.keys(DEADLINE_RULES).map((r) => <option key={r} value={r}>{regulationLabel(r)}</option>)}
                </select>
            </label>
        </div>
    );
}

function CreateForm({ domains, onData, onDone }) {
    const [values, setValues] = useState({ company_name: "", domain: "", notify_email: "", default_regulation: "GDPR", logo: "" });
    const [state, setState] = useState(null); // null | "saving" | error text
    async function save(e) {
        e.preventDefault();
        setState("saving");
        try {
            const data = await postDsr({ action: "form_save", ...values });
            onData(data);
            onDone(values.logo && !data.forms[0]?.logo_data ? "The form was created, but the logo wasn't saved. The server may need updating." : null);
        } catch (err) {
            setState(err.message);
        }
    }
    return (
        <form className="tw-flex tw-flex-col tw-gap-4" onSubmit={save}>
            <FormFields values={values} onChange={setValues} domains={domains} />
            <LogoDropzone logo={values.logo} onLogo={(logo) => setValues((v) => ({ ...v, logo }))} onRemove={() => setValues((v) => ({ ...v, logo: "" }))} />
            {state && state !== "saving" && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{state}</p>}
            <div className="tw-flex tw-gap-2">
                <Button type="submit" variant="primary" loading={state === "saving"}>Create form</Button>
                <Button variant="ghost" onClick={() => onDone(null)}>Cancel</Button>
            </div>
        </form>
    );
}

function EditForm({ form, domains, onData, onDone }) {
    const [values, setValues] = useState({ company_name: form.company_name, domain: form.domain || "", notify_email: form.notify_email || "", default_regulation: form.default_regulation || "GDPR" });
    const [state, setState] = useState(null); // null | "saving" | error text
    const [logoState, setLogoState] = useState(null); // null | "saving" | error text

    // A success reply doesn't prove the logo was stored, so check the form that comes back.
    async function saveLogo(logo) {
        setLogoState("saving");
        try {
            const data = await postDsr({ action: "form_save", token: form.token, enabled: form.enabled, company_name: form.company_name, domain: form.domain, notify_email: form.notify_email, default_regulation: form.default_regulation, logo });
            onData(data);
            const saved = data.forms.find((f) => f.token === form.token);
            setLogoState(logo && !saved?.logo_data ? "The logo wasn't saved. The server may need updating." : null);
        } catch (err) {
            setLogoState(err.message);
        }
    }
    async function save(e) {
        e.preventDefault();
        setState("saving");
        try {
            onData(await postDsr({ action: "form_save", token: form.token, enabled: form.enabled, ...values }));
            onDone();
        } catch (err) {
            setState(err.message);
        }
    }
    return (
        <form className="tw-flex tw-flex-col tw-gap-4" onSubmit={save}>
            <FormFields values={values} onChange={setValues} domains={domains} />
            <p className="tw-m-0 tw-text-xs tw-text-text-muted">The visitor's location sets the regulation. This one applies when they choose "Somewhere else". Leave the email empty for no notifications.</p>
            <LogoDropzone logo={form.logo_data} busy={logoState === "saving"} error={logoState && logoState !== "saving" ? logoState : null} onLogo={saveLogo} onRemove={() => saveLogo("")} />
            {state && state !== "saving" && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{state}</p>}
            <div className="tw-flex tw-gap-2">
                <Button type="submit" variant="primary" loading={state === "saving"}>Save changes</Button>
                <Button variant="ghost" onClick={onDone}>Cancel</Button>
            </div>
        </form>
    );
}

function FormRow({ form, onOpen, onToggle, busy }) {
    const [copied, setCopied] = useState(false);
    const copy = () => navigator.clipboard.writeText(formLink(form)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    return (
        <li className="tw-flex tw-flex-col tw-gap-2 tw-p-3 tw-bg-bg-sunken tw-rounded-lg">
            <div className="tw-flex tw-items-center tw-gap-3">
                {form.logo_data && <img src={form.logo_data} alt="" className="dsr-logo-preview" />}
                <div className="tw-flex-1 tw-min-w-0">
                    <span className="tw-block tw-text-sm tw-font-semibold tw-text-text-primary tw-break-words">{form.company_name}</span>
                    {form.domain && <span className="tw-block tw-text-xs tw-text-text-muted tw-break-all">{form.domain}</span>}
                </div>
                {form.enabled ? <Badge tone="success" icon="check-circle">Live</Badge> : <Badge tone="neutral" icon="minus-circle">Off</Badge>}
            </div>
            <code className="tw-text-xs tw-break-all">{formLink(form)}</code>
            <p className="tw-m-0 tw-text-xs tw-text-text-muted">Notifies {form.notify_email || "nobody"} · {regulationLabel(form.default_regulation)} if the visitor is elsewhere</p>
            {form.custom_domain && form.custom_domain_status !== "active" && <div><Badge tone="warning" icon="clock">{form.custom_domain}: waiting for DNS</Badge></div>}
            <div className="tw-flex tw-flex-wrap tw-gap-1">
                <Button size="sm" variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
                <Button size="sm" variant="ghost" onClick={() => onOpen({ type: "edit", token: form.token })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => onOpen({ type: "domain", token: form.token })}>Custom domain</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={onToggle}>{form.enabled ? "Turn off" : "Turn on"}</Button>
            </div>
        </li>
    );
}

function FormsPanel({ forms, customDomains, onData, busy, setBusy }) {
    const [modal, setModal] = useState(null); // null | { type: "create" } | { type: "edit" | "domain", token }
    const [error, setError] = useState(null);
    const domains = useMemo(readCachedDomains, []);
    const open = modal?.token ? forms.find((f) => f.token === modal.token) : null;
    const close = () => setModal(null);

    async function toggle(form) {
        setBusy(true);
        setError(null);
        try {
            onData(await postDsr(form.enabled ? { action: "form_disable", token: form.token } : { action: "form_save", ...form, logo_data: undefined, enabled: true }));
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    const title = modal?.type === "create" ? "New form" : modal?.type === "edit" ? `Edit ${open?.company_name || "form"}` : `Custom domain for ${open?.company_name || "form"}`;

    return (
        <div className="tw-flex tw-flex-col tw-gap-4">
            <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                <p className="tw-m-0 tw-text-sm tw-text-text-muted">Link to a form from your privacy policy. People confirm their email before a request reaches your list.</p>
                <Button variant="primary" icon="plus" className="tw-flex-shrink-0" onClick={() => setModal({ type: "create" })}>New form</Button>
            </div>
            {error && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{error}</p>}
            {forms.length === 0
                ? <p className="tw-m-0 tw-text-sm tw-text-text-muted">No forms yet. Create one to start receiving requests.</p>
                : <ul className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">{forms.map((f) => <FormRow key={f.token} form={f} busy={busy} onOpen={setModal} onToggle={() => toggle(f)} />)}</ul>}
            <Modal open={Boolean(modal)} onClose={close} title={title}>
                {modal?.type === "create" && <CreateForm domains={domains} onData={onData} onDone={(message) => { setError(message); close(); }} />}
                {modal?.type === "edit" && open && <EditForm key={open.token} form={open} domains={domains} onData={onData} onDone={close} />}
                {modal?.type === "domain" && open && (
                    <div className="tw-flex tw-flex-col tw-gap-3">
                        <p className="tw-m-0 tw-text-sm tw-text-text-muted">Show this form on your own subdomain, such as privacy.yourcompany.com. Root domains can't be used.</p>
                        <CustomDomain form={open} access={customDomains} onData={onData} />
                    </div>
                )}
            </Modal>
        </div>
    );
}

function ConnectorForm({ connector, onData }) {
    const [values, setValues] = useState({});
    const [region, setRegion] = useState(connector.region);
    const [state, setState] = useState(null); // null | "saving" | error text
    async function send(body) {
        setState("saving");
        try {
            onData(await postDsr(body));
            setValues({});
            setState(null);
        } catch (e) {
            setState(e.message);
        }
    }
    return (
        <form className="tw-flex tw-flex-col tw-gap-2 tw-p-3 tw-bg-bg-sunken tw-rounded-lg" onSubmit={(e) => { e.preventDefault(); send({ action: "connector_save", adapter: connector.id, values, region }); }}>
            <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <span className="tw-text-sm tw-font-semibold tw-text-text-primary">{connector.label}</span>
                {connector.connected ? <Badge tone="success" icon="check-circle">Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
            </div>
            <div className="dsr-form-grid">
                {connector.fields.map((f) => (
                    <label key={f.id} className={LABEL}>{f.label}
                        <input type="password" autoComplete="off" className={FIELD} required placeholder={connector.connected ? "Saved. Enter to replace" : ""} value={values[f.id] || ""} onChange={(e) => { const { value } = e.target; setValues((v) => ({ ...v, [f.id]: value })); }} />
                    </label>
                ))}
                {connector.regions && (
                    <label className={LABEL}>Data region
                        <select className={FIELD} value={region} onChange={(e) => setRegion(e.target.value)} style={{ colorScheme: "dark" }}>
                            <option value="us">US</option>
                            <option value="eu">EU</option>
                        </select>
                    </label>
                )}
            </div>
            {state && state !== "saving" && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{state}</p>}
            <div className="tw-flex tw-gap-2">
                <Button type="submit" size="sm" variant="secondary" loading={state === "saving"}>{connector.connected ? "Replace" : "Connect"}</Button>
                {connector.connected && <Button size="sm" variant="ghost" onClick={() => send({ action: "connector_remove", adapter: connector.id })}>Remove</Button>}
            </div>
        </form>
    );
}

/** Set-up for the DSR portal: the public form, and vendor API keys. */
export default function DsrSetup({ section }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        fetchDsr("?setup=1").then(setData).catch((e) => setError(e.message));
    }, []);

    if (error) return <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{error}</p>;
    if (!data) return <p className="tw-m-0 tw-text-sm tw-text-text-muted">Loading…</p>;
    if (section === "form") return <FormsPanel forms={data.forms} customDomains={data.custom_domains || {}} onData={setData} busy={busy} setBusy={setBusy} />;
    return (
        <div className="tw-flex tw-flex-col tw-gap-4">
            <p className="tw-m-0 tw-text-sm tw-text-text-muted">Connect a vendor to delete through its API on erasure requests. Keys are stored encrypted and can't be read back. Google Ads, Google Analytics and Meta use the accounts connected under Marketing.</p>
            {!data.encryption_ready && <p role="alert" className="tw-m-0 tw-text-sm tw-text-warning">Saving keys isn't available until DSR_CREDENTIALS_KEY is set on the server.</p>}
            {data.connectors.map((c) => <ConnectorForm key={`${c.id}-${c.connected}`} connector={c} onData={setData} />)}
        </div>
    );
}
