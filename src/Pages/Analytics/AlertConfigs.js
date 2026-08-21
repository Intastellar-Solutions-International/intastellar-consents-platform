const { useState, useEffect, useCallback } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import "./Analytics.css";

const ALERTS_URL = `${ScannerHost}/api/analytics-alert-configs`;

const METRIC_LABELS = {
    traffic_drop:       "Traffic drop",
    consent_rate_below: "Consent rate",
    zero_conversions:   "Conversions (zero check)",
    conversion_drop:    "Conversion drop",
    engaged_drop:       "Engaged session drop",
};

const METRIC_DESCRIPTIONS = {
    traffic_drop:       "Fires when traffic drops by more than X% compared to the prior period.",
    consent_rate_below: "Fires when the full-consent rate falls below X%.",
    zero_conversions:   "Fires when conversion events fall below X (e.g. 0 = no conversions at all).",
    conversion_drop:    "Fires when conversions drop by more than X% compared to the prior period.",
    engaged_drop:       "Fires when engaged sessions (≥10s or 2+ pages) drop by more than X%.",
};

const OPERATOR_LABELS = { lt: "falls below", gt: "rises above" };

const DEFAULT_OPERATORS = {
    traffic_drop: "gt", consent_rate_below: "lt", zero_conversions: "lt",
    conversion_drop: "gt", engaged_drop: "gt",
};

const EMPTY_FORM = {
    metric: "traffic_drop", operator: "gt", threshold: 30,
    period_days: 7, notify_email: true, notify_push: false,
    label: "", enabled: true,
};

function useAlerts(domain) {
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    const reload = useCallback(() => {
        if (!domain) { setConfigs([]); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain }).toString();
        fetch(`${ALERTS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                setConfigs(json.configs || []);
            })
            .catch(() => setError("Could not load alert configs."))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { reload(); }, [reload]);

    return { configs, loading, error, reload };
}

function fmtDate(iso) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function AlertRow({ cfg, domain, onToggle, onDelete }) {
    const [busy, setBusy] = useState(false);

    async function toggle() {
        setBusy(true);
        const qs = new URLSearchParams({ domain, id: cfg.id }).toString();
        await fetch(`${ALERTS_URL}?${qs}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ enabled: !cfg.enabled }),
        }).catch(() => {});
        onToggle();
        setBusy(false);
    }

    async function remove() {
        if (!window.confirm(`Delete alert "${cfg.label || METRIC_LABELS[cfg.metric]}"?`)) return;
        setBusy(true);
        const qs = new URLSearchParams({ domain, id: cfg.id }).toString();
        await fetch(`${ALERTS_URL}?${qs}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
        onDelete();
        setBusy(false);
    }

    const opLabel = OPERATOR_LABELS[cfg.operator] || cfg.operator;
    const metricLabel = METRIC_LABELS[cfg.metric] || cfg.metric;
    const suffix = cfg.metric === "zero_conversions" ? "" : (cfg.metric.includes("rate") || cfg.metric.includes("drop") ? "%" : "");

    return (
        <div className={"sa-alert-row" + (cfg.enabled ? "" : " sa-alert-row--disabled")}>
            <div className="sa-alert-row__meta">
                <span className="sa-alert-row__name">{cfg.label || metricLabel}</span>
                <span className="sa-alert-row__rule">
                    {metricLabel} {opLabel} {cfg.threshold}{suffix} — past {cfg.period_days}d
                </span>
                <span className="sa-alert-row__last">Last fired: {fmtDate(cfg.last_triggered)}</span>
            </div>
            <div className="sa-alert-row__actions">
                <button className="sa-btn sa-btn--sm" onClick={toggle} disabled={busy}>
                    {cfg.enabled ? "Disable" : "Enable"}
                </button>
                <button className="sa-btn sa-btn--sm sa-btn--danger" onClick={remove} disabled={busy}>
                    Delete
                </button>
            </div>
        </div>
    );
}

function NewAlertForm({ domain, onCreated }) {
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState(null);

    function setField(k, v) {
        setForm(f => {
            const next = { ...f, [k]: v };
            if (k === "metric") next.operator = DEFAULT_OPERATORS[v] || "gt";
            return next;
        });
    }

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setFormError(null);
        const qs = new URLSearchParams({ domain }).toString();
        const body = {
            ...form,
            threshold: Number(form.threshold),
            period_days: Number(form.period_days),
        };
        const r = await fetch(`${ALERTS_URL}?${qs}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(body),
        }).catch(() => null);
        setBusy(false);
        if (!r || !r.ok) { setFormError("Failed to create alert."); return; }
        setForm({ ...EMPTY_FORM });
        onCreated();
    }

    const suffix = form.metric === "zero_conversions" ? "" : (form.metric.includes("rate") || form.metric.includes("drop") ? "%" : "");

    return (
        <div className="sa-panel sa-alert-form">
            <h3 className="sa-panel__title">New Alert</h3>
            <p className="sa-panel__sub">{METRIC_DESCRIPTIONS[form.metric]}</p>
            <form className="sa-alert-form__fields" onSubmit={submit}>
                <label className="sa-form-label">
                    Metric
                    <select value={form.metric} onChange={e => setField("metric", e.target.value)} className="sa-form-select">
                        {Object.entries(METRIC_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </label>

                <label className="sa-form-label">
                    Condition
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select value={form.operator} onChange={e => setField("operator", e.target.value)} className="sa-form-select" style={{ flex: 1 }}>
                            <option value="lt">falls below</option>
                            <option value="gt">rises above</option>
                        </select>
                        <input
                            type="number" step="0.1" min="0" max="10000"
                            className="sa-form-input"
                            value={form.threshold}
                            onChange={e => setField("threshold", e.target.value)}
                            style={{ width: 90 }}
                        />
                        <span style={{ color: "rgba(160,174,192,0.7)", fontSize: "0.85rem" }}>{suffix || "events"}</span>
                    </div>
                </label>

                <label className="sa-form-label">
                    Look-back window (days)
                    <input
                        type="number" min="1" max="90"
                        className="sa-form-input"
                        value={form.period_days}
                        onChange={e => setField("period_days", e.target.value)}
                        style={{ width: 90 }}
                    />
                </label>

                <label className="sa-form-label">
                    Label (optional)
                    <input
                        type="text" maxLength={120}
                        className="sa-form-input"
                        placeholder="e.g. Low consent rate warning"
                        value={form.label}
                        onChange={e => setField("label", e.target.value)}
                    />
                </label>

                <label className="sa-form-checkbox">
                    <input type="checkbox" checked={form.notify_email} onChange={e => setField("notify_email", e.target.checked)} />
                    Email notification
                </label>

                {formError && <p className="sa-notice sa-notice--error" style={{ marginTop: 8 }}>{formError}</p>}

                <button type="submit" className="sa-btn" disabled={busy}>
                    {busy ? "Creating…" : "Create alert"}
                </button>
            </form>
        </div>
    );
}

export default function AnalyticsAlerts() {
    document.title = "Alerts | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
    } = useAnalyticsPageChrome();

    const { configs, loading, error, reload } = useAlerts(domain);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Analytics Alerts"
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
                        <p className="sa-notice">Select a domain in the header to manage alerts.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}

                    {domain && !loading && (
                        <div className="sa-alerts-grid">
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Active Alerts</h3>
                                {configs.length === 0 && (
                                    <p className="sa-notice" style={{ margin: "16px 0" }}>
                                        No alerts configured yet. Create one below.
                                    </p>
                                )}
                                <div className="sa-alert-list">
                                    {configs.map(cfg => (
                                        <AlertRow key={cfg.id} cfg={cfg} domain={domain}
                                            onToggle={reload} onDelete={reload} />
                                    ))}
                                </div>
                                <p className="sa-panel__sub" style={{ marginTop: 16 }}>
                                    Alerts are checked daily at 07:00 UTC. Email notifications are sent to the organisation owner.
                                </p>
                            </div>

                            <NewAlertForm domain={domain} onCreated={reload} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
