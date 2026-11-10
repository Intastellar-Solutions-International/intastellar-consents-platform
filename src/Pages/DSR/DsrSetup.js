import { Badge, Button, FileDropzone } from "../../Components/ui";
import { readCachedDomains } from "../../Functions/cachedDomains.js";
import { DEADLINE_RULES } from "../../Functions/dsr.js";
import { FRAMEWORK_LABELS } from "../../Functions/jurisdictionEngine.js";
import { FIELD, LABEL, fetchDsr, postDsr } from "./dsrShared.js";

const { useState, useEffect, useMemo } = React;
const formLink = (token) => `https://www.intastellarconsents.com/privacy-request/${token}`;
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

function FormsPanel({ forms, onData, busy, setBusy }) {
    const [draft, setDraft] = useState({ company_name: "", domain: "", notify_email: "", default_regulation: "GDPR", logo: "" });
    const [error, setError] = useState(null);
    const [logoError, setLogoError] = useState({}); // by form token, "new" for the create form
    const [copied, setCopied] = useState(null);
    const domains = useMemo(readCachedDomains, []);
    const set = (key) => (e) => { const { value } = e.target; setDraft((d) => ({ ...d, [key]: value })); };

    async function run(body, after) {
        setBusy(true);
        setError(null);
        try {
            onData(await postDsr(body));
            if (after) after();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    // A success reply doesn't prove the logo was stored, so check the form that comes back.
    async function saveLogo(form, logo) {
        setBusy(true);
        setLogoError((all) => ({ ...all, [form.token]: null }));
        try {
            const data = await postDsr({ action: "form_save", ...form, logo_data: undefined, logo });
            onData(data);
            const saved = data.forms.find((f) => f.token === form.token);
            if (logo && !saved?.logo_data) setLogoError((all) => ({ ...all, [form.token]: "The logo wasn't saved. The server may need updating." }));
        } catch (e) {
            setLogoError((all) => ({ ...all, [form.token]: e.message }));
        } finally {
            setBusy(false);
        }
    }

    async function createForm() {
        setBusy(true);
        setError(null);
        try {
            const data = await postDsr({ action: "form_save", ...draft });
            onData(data);
            if (draft.logo && !data.forms[0]?.logo_data) setError("The form was created, but the logo wasn't saved. The server may need updating.");
            setDraft((d) => ({ ...d, company_name: "", notify_email: "", logo: "" }));
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }

    const copy = (token) => navigator.clipboard.writeText(formLink(token)).then(() => { setCopied(token); setTimeout(() => setCopied(null), 2000); });

    return (
        <div className="tw-flex tw-flex-col tw-gap-5">
            <p className="tw-m-0 tw-text-sm tw-text-text-muted">Link to this page from your privacy policy. People confirm their email before a request reaches this list, and the deadline runs from the day they sent it.</p>
            {forms.map((f) => (
                <div key={f.token} className="tw-flex tw-flex-col tw-gap-2 tw-p-3 tw-bg-bg-sunken tw-rounded-lg">
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                        <span className="tw-text-sm tw-font-semibold tw-text-text-primary">{f.company_name}{f.domain ? ` · ${f.domain}` : ""}</span>
                        {f.enabled ? <Badge tone="success" icon="check-circle">Live</Badge> : <Badge tone="neutral" icon="minus-circle">Off</Badge>}
                    </div>
                    <code className="tw-text-xs tw-break-all">{formLink(f.token)}</code>
                    <LogoDropzone logo={f.logo_data} busy={busy} error={logoError[f.token]} onLogo={(logo) => saveLogo(f, logo)} onRemove={() => saveLogo(f, "")} />
                    <div className="tw-flex tw-flex-wrap tw-gap-2">
                        <Button size="sm" variant="secondary" onClick={() => copy(f.token)}>{copied === f.token ? "Copied" : "Copy link"}</Button>
                        {f.enabled
                            ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ action: "form_disable", token: f.token })}>Turn off</Button>
                            : <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ action: "form_save", ...f, logo_data: undefined, enabled: true })}>Turn on</Button>}
                    </div>
                </div>
            ))}
            <form className="tw-flex tw-flex-col tw-gap-3" onSubmit={(e) => { e.preventDefault(); createForm(); }}>
                <div className="dsr-form-grid">
                    <label className={LABEL}>Company name people will see<input className={FIELD} required maxLength={255} value={draft.company_name} onChange={set("company_name")} /></label>
                    <label className={LABEL}>Domain
                        <select className={FIELD} value={draft.domain} onChange={set("domain")} style={{ colorScheme: "dark" }}>
                            <option value="">Not domain-specific</option>
                            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </label>
                    <label className={LABEL}>Notify this email<input type="email" className={FIELD} maxLength={255} value={draft.notify_email} onChange={set("notify_email")} /></label>
                    <label className={LABEL}>Regulation if unsure
                        <select className={FIELD} value={draft.default_regulation} onChange={set("default_regulation")} style={{ colorScheme: "dark" }}>
                            {Object.keys(DEADLINE_RULES).map((r) => <option key={r} value={r}>{FRAMEWORK_LABELS[r] || r}</option>)}
                        </select>
                    </label>
                </div>
                <LogoDropzone logo={draft.logo} error={logoError.new} onLogo={(logo) => setDraft((d) => ({ ...d, logo }))} onRemove={() => setDraft((d) => ({ ...d, logo: "" }))} />
                {error && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{error}</p>}
                <div><Button type="submit" variant="primary" loading={busy}>Create form</Button></div>
            </form>
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
    if (section === "form") return <FormsPanel forms={data.forms} onData={setData} busy={busy} setBusy={setBusy} />;
    return (
        <div className="tw-flex tw-flex-col tw-gap-4">
            <p className="tw-m-0 tw-text-sm tw-text-text-muted">Connect a vendor to delete through its API on erasure requests. Keys are stored encrypted and can't be read back. Google Ads, Google Analytics and Meta use the accounts connected under Marketing.</p>
            {!data.encryption_ready && <p role="alert" className="tw-m-0 tw-text-sm tw-text-warning">Saving keys isn't available until DSR_CREDENTIALS_KEY is set on the server.</p>}
            {data.connectors.map((c) => <ConnectorForm key={`${c.id}-${c.connected}`} connector={c} onData={setData} />)}
        </div>
    );
}
