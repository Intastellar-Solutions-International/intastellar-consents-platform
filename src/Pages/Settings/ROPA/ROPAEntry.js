const { useState, useEffect } = window.React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
const Link = window.ReactRouterDOM.Link;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import "../Style.css";
import { LEGAL_BASES, PROCESSING_PURPOSES } from "../../../Functions/legalBasisDefinitions.js";
import { FRAMEWORK_IDS, FRAMEWORK_LABELS } from "../../../Functions/jurisdictionEngine.js";

const DATA_SUBJECT_CATEGORIES = ["Customers", "Employees", "Prospects", "Users", "Minors", "Website visitors", "Other"];
const DATA_CATEGORIES = ["Contact details", "Identifiers (IP, device ID)", "Behavioural data", "Financial data", "Health data", "Location data", "Preferences", "Other"];
const TRANSFER_MECHANISMS = ["Adequacy decision", "Standard Contractual Clauses (SCCs)", "Binding Corporate Rules (BCRs)", "Derogation (Art. 49)", "Not applicable"];

const EMPTY_ENTRY = {
    activityName: "",
    controllerName: "",
    controllerContact: "",
    dpoContact: "",
    purpose: "",
    framework: "GDPR",
    legalBasis: "legitimate_interest",
    dataSubjectCategories: [],
    dataCategories: [],
    recipients: [],
    thirdCountryTransfers: [],
    retentionPeriod: "",
    securityMeasures: "",
};

function Field({ label, children, required }) {
    return (
        <div className="settings-org-modal__field-block">
            <label className="settings-org-modal__label">{label}{required && " *"}</label>
            {children}
        </div>
    );
}

function TextInput({ value, onChange, placeholder }) {
    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit" }}
        />
    );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
    return (
        <textarea
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit", resize: "vertical" }}
        />
    );
}

function MultiCheckbox({ options, selected, onChange }) {
    function toggle(val) {
        onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
    }
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {options.map((o) => (
                <label key={o} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "5px 10px", borderRadius: "8px", border: `1px solid ${selected.includes(o) ? "rgba(192,159,83,0.4)" : "rgba(255,255,255,0.1)"}`, background: selected.includes(o) ? "rgba(192,159,83,0.12)" : "rgba(0,0,0,0.15)", fontSize: "0.8125rem", color: selected.includes(o) ? "#d4b87a" : "#b0b0b0", userSelect: "none" }}>
                    <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} style={{ display: "none" }} />
                    {o}
                </label>
            ))}
        </div>
    );
}

export default function ROPAEntry() {
    const { entryId } = useParams();
    const history = useHistory();
    const isNew = entryId === "new";

    const [entry, setEntry] = useState(EMPTY_ENTRY);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [newRecipient, setNewRecipient] = useState("");
    const [newTransfer, setNewTransfer] = useState({ country: "", mechanism: "Standard Contractual Clauses (SCCs)" });

    useEffect(() => {
        if (isNew) return;
        fetch(`${API.ropa.list.url}?id=${entryId}`, {
            method: "GET",
            headers: API.ropa.list.headers,
        })
            .then((r) => r.json())
            .then((data) => data && setEntry({ ...EMPTY_ENTRY, ...data }))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [entryId, isNew]);

    function set(key, value) {
        setEntry((prev) => ({ ...prev, [key]: value }));
    }

    function addRecipient() {
        if (!newRecipient.trim()) return;
        set("recipients", [...entry.recipients, { name: newRecipient.trim() }]);
        setNewRecipient("");
    }

    function removeRecipient(i) {
        set("recipients", entry.recipients.filter((_, idx) => idx !== i));
    }

    function addTransfer() {
        if (!newTransfer.country.trim()) return;
        set("thirdCountryTransfers", [...entry.thirdCountryTransfers, { ...newTransfer }]);
        setNewTransfer({ country: "", mechanism: "Standard Contractual Clauses (SCCs)" });
    }

    function removeTransfer(i) {
        set("thirdCountryTransfers", entry.thirdCountryTransfers.filter((_, idx) => idx !== i));
    }

    function save() {
        if (!entry.activityName.trim()) { setStatus("missing_name"); return; }
        setSaving(true);
        setStatus(null);
        const url = isNew ? API.ropa.create.url : API.ropa.update.url;
        const method = isNew ? API.ropa.create.method : API.ropa.update.method;
        const headers = isNew ? API.ropa.create.headers : API.ropa.update.headers;
        fetch(url, {
            method,
            headers,
            body: JSON.stringify({ ...entry, id: isNew ? undefined : entryId, updatedAt: new Date().toISOString() }),
        })
            .then((r) => r.json())
            .then(() => { setStatus("saved"); if (isNew) setTimeout(() => history.push("/settings/ropa"), 800); })
            .catch(() => setStatus("error"))
            .finally(() => setSaving(false));
    }

    const legalBasisOptions = LEGAL_BASES[entry.framework] || LEGAL_BASES.GDPR;
    const purposeLabel = PROCESSING_PURPOSES.find((p) => p.id === entry.purpose)?.label;

    if (loading) {
        return (
            <>
                <SideNav links={reportsLinks} title="Settings" />
                <main className="dashboard-content settings-subpage settings-subpage--wide">
                    <StickyPageTitle title="Processing Activity" />
                    <p className="settings-subpage__empty">Loading…</p>
                </main>
            </>
        );
    }

    document.title = `${isNew ? "New" : entry.activityName || "Edit"} Activity | RoPA | Intastellar Consents`;

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title={isNew ? "New Processing Activity" : "Edit Processing Activity"} />

                <Link to="/settings/ropa" className="settings-subpage__back">← All activities</Link>

                {status === "saved" && <p className="settings-subpage__status">Activity saved.</p>}
                {status === "error" && <p className="settings-subpage__status settings-subpage__status--error">Failed to save — please try again.</p>}
                {status === "missing_name" && <p className="settings-subpage__status settings-subpage__status--error">Activity name is required.</p>}

                <div className="settings-subpage__panel" style={{ marginBottom: "16px" }}>
                    <h3 style={{ margin: "0 0 18px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(192,159,83,0.9)" }}>Identity</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <Field label="Activity name" required>
                            <TextInput value={entry.activityName} onChange={(v) => set("activityName", v)} placeholder="e.g. Google Analytics, Email marketing, Payment processing" />
                        </Field>
                        <Field label="Controller name">
                            <TextInput value={entry.controllerName} onChange={(v) => set("controllerName", v)} placeholder="Your company / organisation name" />
                        </Field>
                        <Field label="Controller contact">
                            <TextInput value={entry.controllerContact} onChange={(v) => set("controllerContact", v)} placeholder="privacy@yourcompany.com" />
                        </Field>
                        <Field label="DPO contact (optional)">
                            <TextInput value={entry.dpoContact} onChange={(v) => set("dpoContact", v)} placeholder="dpo@yourcompany.com" />
                        </Field>
                    </div>
                </div>

                <div className="settings-subpage__panel" style={{ marginBottom: "16px" }}>
                    <h3 style={{ margin: "0 0 18px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(192,159,83,0.9)" }}>Purpose & Legal Basis</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <Field label="Processing purpose">
                            <select className="settings-subpage__select" style={{ width: "100%" }} value={entry.purpose} onChange={(e) => set("purpose", e.target.value)}>
                                <option value="">— select —</option>
                                {PROCESSING_PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Applicable regulation">
                            <select className="settings-subpage__select" style={{ width: "100%" }} value={entry.framework} onChange={(e) => set("framework", e.target.value)}>
                                {FRAMEWORK_IDS.map((fw) => <option key={fw} value={fw}>{FRAMEWORK_LABELS[fw] || fw}</option>)}
                            </select>
                        </Field>
                        <Field label="Legal basis">
                            <select className="settings-subpage__select" style={{ width: "100%" }} value={entry.legalBasis} onChange={(e) => set("legalBasis", e.target.value)}>
                                {legalBasisOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                            </select>
                        </Field>
                    </div>
                </div>

                <div className="settings-subpage__panel" style={{ marginBottom: "16px" }}>
                    <h3 style={{ margin: "0 0 18px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(192,159,83,0.9)" }}>Data & Data Subjects</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <Field label="Categories of data subjects">
                            <MultiCheckbox options={DATA_SUBJECT_CATEGORIES} selected={entry.dataSubjectCategories} onChange={(v) => set("dataSubjectCategories", v)} />
                        </Field>
                        <Field label="Categories of personal data">
                            <MultiCheckbox options={DATA_CATEGORIES} selected={entry.dataCategories} onChange={(v) => set("dataCategories", v)} />
                        </Field>
                        <Field label="Retention period">
                            <TextInput value={entry.retentionPeriod} onChange={(v) => set("retentionPeriod", v)} placeholder="e.g. 2 years, 90 days after account closure" />
                        </Field>
                    </div>
                </div>

                <div className="settings-subpage__panel" style={{ marginBottom: "16px" }}>
                    <h3 style={{ margin: "0 0 18px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(192,159,83,0.9)" }}>Recipients & Transfers</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <Field label="Recipients / processors">
                            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                                <input
                                    type="text"
                                    value={newRecipient}
                                    onChange={(e) => setNewRecipient(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                                    placeholder="Processor or recipient name"
                                    style={{ flex: 1, padding: "9px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit" }}
                                />
                                <button type="button" className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary" onClick={addRecipient} style={{ padding: "9px 14px", fontSize: "0.8125rem" }}>Add</button>
                            </div>
                            {entry.recipients.length > 0 && (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    {entry.recipients.map((r, i) => (
                                        <li key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.8125rem", color: "#e0e0e0" }}>
                                            {r.name}
                                            <button type="button" onClick={() => removeRecipient(i)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 0, fontSize: "0.9rem", lineHeight: 1 }}>×</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Field>

                        <Field label="Third-country transfers">
                            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                                <input
                                    type="text"
                                    value={newTransfer.country}
                                    onChange={(e) => setNewTransfer((t) => ({ ...t, country: e.target.value }))}
                                    placeholder="Country (e.g. US, IN)"
                                    style={{ flex: "0 0 100px", padding: "9px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit" }}
                                />
                                <select
                                    value={newTransfer.mechanism}
                                    onChange={(e) => setNewTransfer((t) => ({ ...t, mechanism: e.target.value }))}
                                    className="settings-subpage__select"
                                    style={{ flex: 1, minWidth: "160px" }}
                                >
                                    {TRANSFER_MECHANISMS.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <button type="button" className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary" onClick={addTransfer} style={{ padding: "9px 14px", fontSize: "0.8125rem" }}>Add</button>
                            </div>
                            {entry.thirdCountryTransfers.length > 0 && (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                                    {entry.thirdCountryTransfers.map((t, i) => (
                                        <li key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.8125rem" }}>
                                            <span style={{ fontFamily: "ui-monospace, monospace", color: "#c0a053", fontWeight: 600 }}>{t.country}</span>
                                            <span style={{ color: "#b0b0b0" }}>{t.mechanism}</span>
                                            <button type="button" onClick={() => removeTransfer(i)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "0.9rem" }}>×</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Field>
                    </div>
                </div>

                <div className="settings-subpage__panel" style={{ marginBottom: "24px" }}>
                    <h3 style={{ margin: "0 0 18px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(192,159,83,0.9)" }}>Security</h3>
                    <Field label="Security measures">
                        <Textarea
                            value={entry.securityMeasures}
                            onChange={(v) => set("securityMeasures", v)}
                            placeholder="Describe technical and organisational measures (encryption, access controls, pseudonymisation, etc.)"
                            rows={4}
                        />
                    </Field>
                </div>

                <button
                    type="button"
                    className="settings-subpage__submit"
                    onClick={save}
                    disabled={saving}
                >
                    {saving ? "Saving…" : isNew ? "Create activity" : "Save changes"}
                </button>
            </main>
        </>
    );
}
