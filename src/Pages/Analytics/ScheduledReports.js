const { useState, useEffect, useCallback } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import "./Analytics.css";

const REPORTS_URL = `${ScannerHost}/api/analytics-scheduled-reports`;

const DAY_OF_WEEK_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
    return EMAIL_RE.test(email);
}

function parseRecipients(raw) {
    return [...new Set(
        String(raw || "")
            .split(/[,\n]/)
            .map(r => r.trim().toLowerCase())
            .filter(Boolean)
    )];
}

const EMPTY_FORM = {
    frequency: "weekly", day_of_week: 1, day_of_month: 1,
    recipients: "", label: "", enabled: true,
};

function useScheduledReports(domain) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    const reload = useCallback(() => {
        if (!domain) { setReports([]); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain }).toString();
        fetch(`${REPORTS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                setReports(json.reports || []);
            })
            .catch(() => setError("Could not load scheduled reports."))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { reload(); }, [reload]);

    return { reports, loading, error, reload };
}

function fmtDate(iso) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function scheduleLabel(cfg) {
    if (cfg.frequency === "monthly") {
        const day = Number(cfg.day_of_month);
        const suffix = day === 1 || day === 21 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
        return `Monthly on the ${day}${suffix}`;
    }
    return `Weekly on ${DAY_OF_WEEK_LABELS[Number(cfg.day_of_week)] || "—"}`;
}

function ReportRow({ cfg, domain, onToggle, onDelete }) {
    const [busy, setBusy] = useState(false);
    const [testMsg, setTestMsg] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState(null);
    const [editError, setEditError] = useState(null);

    function openEdit() {
        setEditForm({
            label:        cfg.label || "",
            frequency:    cfg.frequency,
            day_of_week:  cfg.day_of_week ?? 1,
            day_of_month: cfg.day_of_month ?? 1,
            recipients:   (cfg.recipients || []).join(", "),
        });
        setEditError(null);
        setEditing(true);
    }

    function setEditField(k, v) {
        setEditForm(f => ({ ...f, [k]: v }));
    }

    async function saveEdit(e) {
        e.preventDefault();
        setEditError(null);
        const recipients = parseRecipients(editForm.recipients);
        if (!recipients.length) { setEditError("Add at least one recipient email address."); return; }
        if (recipients.length > 10) { setEditError("Maximum 10 recipients."); return; }
        const invalid = recipients.find(r => !isValidEmail(r));
        if (invalid) { setEditError(`"${invalid}" is not a valid email address.`); return; }

        setBusy(true);
        const qs = new URLSearchParams({ domain, id: cfg.id }).toString();
        const body = {
            label:        editForm.label,
            frequency:    editForm.frequency,
            day_of_week:  editForm.frequency === "weekly"  ? Number(editForm.day_of_week)  : undefined,
            day_of_month: editForm.frequency === "monthly" ? Number(editForm.day_of_month) : undefined,
            recipients,
        };
        const r = await fetch(`${REPORTS_URL}?${qs}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(body),
        }).catch(() => null);
        setBusy(false);
        if (!r || !r.ok) { setEditError("Failed to save changes."); return; }
        setEditing(false);
        onToggle();
    }

    async function toggle() {
        setBusy(true);
        const qs = new URLSearchParams({ domain, id: cfg.id }).toString();
        await fetch(`${REPORTS_URL}?${qs}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ enabled: !cfg.enabled }),
        }).catch(() => {});
        onToggle();
        setBusy(false);
    }

    async function remove() {
        if (!window.confirm(`Delete report "${cfg.label || scheduleLabel(cfg)}"?`)) return;
        setBusy(true);
        const qs = new URLSearchParams({ domain, id: cfg.id }).toString();
        await fetch(`${REPORTS_URL}?${qs}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
        onDelete();
        setBusy(false);
    }

    async function sendTest() {
        setBusy(true);
        setTestMsg(null);
        const qs = new URLSearchParams({ domain, id: cfg.id, test: "1" }).toString();
        const r = await fetch(`${REPORTS_URL}?${qs}`, { method: "POST", headers: authHeaders() }).catch(() => null);
        setTestMsg(r && r.ok ? "Test email sent!" : "Failed to send test email.");
        setBusy(false);
        setTimeout(() => setTestMsg(null), 4000);
    }

    return (
        <div className={"sa-alert-row" + (cfg.enabled ? "" : " sa-alert-row--disabled")}>
            <div className="sa-alert-row__meta">
                <span className="sa-alert-row__name">{cfg.label || scheduleLabel(cfg)}</span>
                <span className="sa-alert-row__rule">
                    {scheduleLabel(cfg)} — {(cfg.recipients || []).length} recipient{(cfg.recipients || []).length === 1 ? "" : "s"}
                </span>
                <span className="sa-alert-row__last">Last sent: {fmtDate(cfg.last_sent_at)}</span>
                {testMsg && <span className="sa-alert-row__last">{testMsg}</span>}
            </div>
            <div className="sa-alert-row__actions">
                <button className="sa-btn sa-btn--sm" onClick={sendTest} disabled={busy}>
                    Send test now
                </button>
                <button className="sa-btn sa-btn--sm" onClick={openEdit} disabled={busy}>
                    Edit
                </button>
                <button className="sa-btn sa-btn--sm" onClick={toggle} disabled={busy}>
                    {cfg.enabled ? "Disable" : "Enable"}
                </button>
                <button className="sa-btn sa-btn--sm sa-btn--danger" onClick={remove} disabled={busy}>
                    Delete
                </button>
            </div>

            {editing && editForm && (
                <form className="sa-alert-edit-form" onSubmit={saveEdit}>
                    <div className="sa-alert-edit-form__grid">
                        <label className="sa-form-label">
                            Label
                            <input
                                type="text" maxLength={120}
                                className="sa-form-input"
                                placeholder="e.g. Weekly marketing digest"
                                value={editForm.label}
                                onChange={e => setEditField("label", e.target.value)}
                            />
                        </label>

                        <label className="sa-form-label">
                            Frequency
                            <select value={editForm.frequency} onChange={e => setEditField("frequency", e.target.value)} className="sa-form-select">
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </label>

                        {editForm.frequency === "weekly" ? (
                            <label className="sa-form-label">
                                Day of week
                                <select value={editForm.day_of_week} onChange={e => setEditField("day_of_week", e.target.value)} className="sa-form-select">
                                    {DAY_OF_WEEK_LABELS.map((d, i) => (
                                        <option key={i} value={i}>{d}</option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <label className="sa-form-label">
                                Day of month
                                <input
                                    type="number" min="1" max="28"
                                    className="sa-form-input"
                                    value={editForm.day_of_month}
                                    onChange={e => setEditField("day_of_month", e.target.value)}
                                    style={{ width: 90 }}
                                />
                            </label>
                        )}

                        <label className="sa-form-label" style={{ gridColumn: "1 / -1" }}>
                            Recipients
                            <textarea
                                className="sa-form-input"
                                rows={2}
                                placeholder="jane@company.com, marketing@agency.com"
                                value={editForm.recipients}
                                onChange={e => setEditField("recipients", e.target.value)}
                                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                            />
                        </label>
                    </div>

                    {editError && <p className="sa-notice sa-notice--error" style={{ margin: "8px 0 0" }}>{editError}</p>}

                    <div className="sa-alert-edit-form__actions">
                        <button type="submit" className="sa-btn sa-btn--sm" disabled={busy}>
                            {busy ? "Saving…" : "Save changes"}
                        </button>
                        <button type="button" className="sa-btn sa-btn--sm" onClick={() => setEditing(false)} disabled={busy}>
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

function NewReportForm({ domain, onCreated }) {
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState(null);

    function setField(k, v) {
        setForm(f => ({ ...f, [k]: v }));
    }

    async function submit(e) {
        e.preventDefault();
        setFormError(null);

        const recipients = parseRecipients(form.recipients);
        if (!recipients.length) { setFormError("Add at least one recipient email address."); return; }
        if (recipients.length > 10) { setFormError("Maximum 10 recipients."); return; }
        const invalid = recipients.find(r => !isValidEmail(r));
        if (invalid) { setFormError(`"${invalid}" is not a valid email address.`); return; }

        setBusy(true);
        const qs = new URLSearchParams({ domain }).toString();
        const body = {
            frequency: form.frequency,
            day_of_week: form.frequency === "weekly" ? Number(form.day_of_week) : undefined,
            day_of_month: form.frequency === "monthly" ? Number(form.day_of_month) : undefined,
            recipients,
            label: form.label,
            enabled: form.enabled,
        };
        const r = await fetch(`${REPORTS_URL}?${qs}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(body),
        }).catch(() => null);
        setBusy(false);
        if (!r || !r.ok) { setFormError("Failed to create scheduled report."); return; }
        setForm({ ...EMPTY_FORM });
        onCreated();
    }

    return (
        <div className="sa-panel sa-alert-form">
            <h3 className="sa-panel__title">New Scheduled Report</h3>
            <p className="sa-panel__sub">Email a condensed performance summary to any address(es), weekly or monthly.</p>
            <form className="sa-alert-form__fields" onSubmit={submit}>
                <label className="sa-form-label">
                    Frequency
                    <select value={form.frequency} onChange={e => setField("frequency", e.target.value)} className="sa-form-select">
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </select>
                </label>

                {form.frequency === "weekly" ? (
                    <label className="sa-form-label">
                        Day of week
                        <select value={form.day_of_week} onChange={e => setField("day_of_week", e.target.value)} className="sa-form-select">
                            {DAY_OF_WEEK_LABELS.map((d, i) => (
                                <option key={i} value={i}>{d}</option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <label className="sa-form-label">
                        Day of month
                        <input
                            type="number" min="1" max="28"
                            className="sa-form-input"
                            value={form.day_of_month}
                            onChange={e => setField("day_of_month", e.target.value)}
                            style={{ width: 90 }}
                        />
                    </label>
                )}

                <label className="sa-form-label">
                    Recipients
                    <textarea
                        className="sa-form-input"
                        rows={3}
                        placeholder="jane@company.com, marketing@agency.com"
                        value={form.recipients}
                        onChange={e => setField("recipients", e.target.value)}
                        style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                    />
                </label>
                <p className="sa-panel__sub" style={{ margin: "-8px 0 4px" }}>
                    Comma or newline separated. Any email address — not limited to your organisation.
                </p>

                <label className="sa-form-label">
                    Label (optional)
                    <input
                        type="text" maxLength={120}
                        className="sa-form-input"
                        placeholder="e.g. Weekly marketing digest"
                        value={form.label}
                        onChange={e => setField("label", e.target.value)}
                    />
                </label>

                {formError && <p className="sa-notice sa-notice--error" style={{ marginTop: 8 }}>{formError}</p>}

                <button type="submit" className="sa-btn" disabled={busy}>
                    {busy ? "Creating…" : "Create scheduled report"}
                </button>
            </form>
        </div>
    );
}

export default function AnalyticsScheduledReports() {
    document.title = "Scheduled Reports | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
    } = useAnalyticsPageChrome();

    const { reports, loading, error, reload } = useScheduledReports(domain);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Scheduled Reports"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to manage scheduled reports.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}

                    {domain && !loading && (
                        <div className="sa-alerts-grid">
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Active Reports</h3>
                                {reports.length === 0 && (
                                    <p className="sa-notice" style={{ margin: "16px 0" }}>
                                        No scheduled reports yet. Create one below.
                                    </p>
                                )}
                                <div className="sa-alert-list">
                                    {reports.map(cfg => (
                                        <ReportRow key={cfg.id} cfg={cfg} domain={domain}
                                            onToggle={reload} onDelete={reload} />
                                    ))}
                                </div>
                                <p className="sa-panel__sub" style={{ marginTop: 16 }}>
                                    Reports are sent daily at 08:00 UTC on their scheduled day.
                                </p>
                            </div>

                            <NewReportForm domain={domain} onCreated={reload} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
