const { useState, useEffect, useCallback } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome, useCompareRange } from "./_shared.js";
import "./Analytics.css";

const AUDIENCES_URL = `${ScannerHost}/api/analytics-audiences`;

// Mirrors the backend's condition-type registry in api/analytics-audiences.js
// (name, validation rules, enum values) — kept in sync by hand, same
// no-cross-import convention every other api/* ↔ frontend pairing in this
// codebase already follows. This copy is UI-only (labels/options), no SQL.
const CONDITION_TYPES = [
    { value: "event_fired",  label: "Event fired",   valueKind: "text",   placeholder: "e.g. purchase" },
    { value: "path_visited", label: "Path visited",  valueKind: "text",   placeholder: "e.g. /pricing" },
    { value: "device",       label: "Device",        valueKind: "select", options: [
        { value: "desktop", label: "Desktop" }, { value: "tablet", label: "Tablet" },
        { value: "mobile",  label: "Mobile" },  { value: "other",  label: "Other" },
    ] },
    { value: "country",      label: "Country",       valueKind: "text",   placeholder: "e.g. DK", maxLength: 2 },
    { value: "channel",      label: "Channel",       valueKind: "select", options: [
        { value: "organic", label: "Organic" }, { value: "paid", label: "Paid" },
        { value: "paid_social", label: "Paid Social (Meta)" },
        { value: "referral", label: "Referral" }, { value: "direct", label: "Direct" },
    ] },
    { value: "consent",      label: "Consent level", valueKind: "select", options: [
        { value: "full", label: "Full consent" }, { value: "minimal", label: "Minimal consent" },
    ] },
];

const MAX_CONDITIONS = 10;

function conditionDef(type) {
    return CONDITION_TYPES.find(c => c.value === type) || CONDITION_TYPES[0];
}

function summarizeConditions(conditions) {
    return (conditions || []).map(c => {
        const def = conditionDef(c.type);
        if (def.valueKind === "select") {
            const opt = def.options.find(o => o.value === c.value);
            return `${def.label}: ${opt ? opt.label : c.value || "—"}`;
        }
        return `${def.label}: "${c.value || ""}"`;
    }).join("  AND  ");
}

function ConditionRow({ condition, onChange, onRemove }) {
    const def = conditionDef(condition.type);
    return (
        <div className="sa-event-form" style={{ alignItems: "center" }}>
            <select
                className="sa-event-form__select"
                value={condition.type}
                onChange={e => onChange({ type: e.target.value, value: "" })}
            >
                {CONDITION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            {def.valueKind === "select" ? (
                <select
                    className="sa-event-form__select"
                    value={condition.value}
                    onChange={e => onChange({ ...condition, value: e.target.value })}
                >
                    <option value="">Select…</option>
                    {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            ) : (
                <input
                    type="text"
                    className="sa-event-form__input"
                    placeholder={def.placeholder}
                    maxLength={def.maxLength || 255}
                    value={condition.value}
                    onChange={e => {
                        const v = condition.type === "country"
                            ? e.target.value.toUpperCase().slice(0, 2)
                            : e.target.value;
                        onChange({ ...condition, value: v });
                    }}
                />
            )}

            {condition.type === "event_fired" && (
                <input
                    type="number"
                    className="sa-event-form__input"
                    style={{ maxWidth: 90 }}
                    placeholder="days"
                    min={1}
                    value={condition.lookbackDays || ""}
                    onChange={e => onChange({
                        ...condition,
                        lookbackDays: e.target.value ? Number(e.target.value) : undefined,
                    })}
                    title="Optional: override the audience's lookback window for just this condition"
                />
            )}

            <button type="button" className="sa-seg-filter__clear" onClick={onRemove}>Remove</button>
        </div>
    );
}

export default function Audiences() {
    document.title = "Audiences | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate } = useAnalyticsPageChrome();
    const compare = useCompareRange();

    const [audiences, setAudiences] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);

    const [showForm, setShowForm]   = useState(false);
    const [name,          setName]          = useState("");
    const [lookbackDays,  setLookbackDays]  = useState(30);
    const [conditions,    setConditions]    = useState([{ type: "event_fired", value: "" }]);
    const [saving,        setSaving]        = useState(false);
    const [formError,     setFormError]     = useState(null);

    const load = useCallback(() => {
        if (!domain) { setAudiences([]); setLoading(false); return; }
        setLoading(true); setError(null);
        fetch(`${AUDIENCES_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => setAudiences(d.audiences || []))
            .catch(() => setError("Could not load audiences."))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { load(); }, [load]);

    function updateCondition(i, next) {
        setConditions(cs => cs.map((c, idx) => idx === i ? next : c));
    }
    function removeCondition(i) {
        setConditions(cs => cs.filter((_, idx) => idx !== i));
    }
    function addCondition() {
        setConditions(cs => cs.length >= MAX_CONDITIONS ? cs : [...cs, { type: "event_fired", value: "" }]);
    }

    async function createAudience(e) {
        e.preventDefault();
        setFormError(null);
        if (!name.trim()) { setFormError("Name is required."); return; }
        if (!conditions.length) { setFormError("Add at least one condition."); return; }

        setSaving(true);
        const r = await fetch(`${AUDIENCES_URL}?domain=${encodeURIComponent(domain)}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name: name.trim(), lookbackDays, conditions }),
        }).catch(() => null);
        setSaving(false);

        if (!r?.ok) {
            const msg = await r?.json().then(d => d.error).catch(() => null);
            setFormError(msg || "Could not create audience.");
            return;
        }

        setName(""); setLookbackDays(30); setConditions([{ type: "event_fired", value: "" }]);
        setShowForm(false);
        load();
    }

    async function deleteAudience(id) {
        await fetch(`${AUDIENCES_URL}?domain=${encodeURIComponent(domain)}&id=${id}`, {
            method: "DELETE",
            headers: authHeaders(),
        }).catch(() => null);
        load();
    }

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title="Audiences"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={compare.previousPeriod}
                previousPeriod2={compare.previousPeriod2}
                compareRange={compare.compareRange}
                setCompareRange={compare.setCompareRange}
                setCompareWindowStart={compare.setCompareWindowStart}
                setCompareWindowEnd={compare.setCompareWindowEnd}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to manage audiences.</p>
                    )}

                    {domain && (
                        <div className="sa-section">
                            <p className="sa-panel__sub" style={{ marginBottom: 16, maxWidth: 680 }}>
                                Audiences here are a live count of matching sessions over a rolling
                                window — not a persistent list of returning visitors. This system
                                doesn't track a visitor across separate sessions, so a session that
                                matched last week won't necessarily still match today.
                            </p>

                            <div className="sa-panel__head sa-panel__head--mt">
                                <h3 className="sa-section__title">Saved audiences</h3>
                                <button type="button" className="sa-add-event-btn" onClick={() => setShowForm(s => !s)}>
                                    + New audience
                                </button>
                            </div>

                            {showForm && (
                                <form className="sa-event-form" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }} onSubmit={createAudience}>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                        <input
                                            type="text"
                                            className="sa-event-form__input"
                                            placeholder="Audience name"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            maxLength={120}
                                            required
                                        />
                                        <input
                                            type="number"
                                            className="sa-event-form__input"
                                            style={{ maxWidth: 160 }}
                                            placeholder="Lookback days"
                                            min={1}
                                            max={365}
                                            value={lookbackDays}
                                            onChange={e => setLookbackDays(Number(e.target.value) || 30)}
                                        />
                                    </div>

                                    <p className="sa-panel__sub" style={{ margin: "4px 0" }}>
                                        Membership is recalculated each time you view this page, by
                                        checking which sessions matched these conditions within the
                                        last {lookbackDays} days. There's no persistent visitor ID in
                                        this system, so this is a rolling window, not a durable list
                                        of people.
                                    </p>

                                    {conditions.map((c, i) => (
                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <ConditionRow
                                                condition={c}
                                                onChange={next => updateCondition(i, next)}
                                                onRemove={() => removeCondition(i)}
                                            />
                                            {i < conditions.length - 1 && (
                                                <span style={{ fontSize: 12, color: "rgba(130,130,130,0.6)" }}>AND</span>
                                            )}
                                        </div>
                                    ))}

                                    <div>
                                        <button
                                            type="button"
                                            className="sa-add-event-btn sa-add-event-btn--sm"
                                            onClick={addCondition}
                                            disabled={conditions.length >= MAX_CONDITIONS}
                                            title={conditions.length >= MAX_CONDITIONS ? `Maximum of ${MAX_CONDITIONS} conditions` : undefined}
                                        >
                                            + Add condition
                                        </button>
                                    </div>

                                    {formError && <p className="sa-notice sa-notice--error">{formError}</p>}

                                    <div>
                                        <button type="submit" className="sa-event-form__submit" disabled={saving}>
                                            {saving ? "Saving…" : "Create audience"}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {error && <p className="sa-notice sa-notice--error">{error}</p>}
                            {loading && <p className="sa-notice">Loading&hellip;</p>}

                            {!loading && audiences.length === 0 && (
                                <p className="sa-panel__sub">
                                    No audiences yet. Create one above to see a live count of sessions
                                    matching your conditions.
                                </p>
                            )}

                            {!loading && audiences.length > 0 && (
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Conditions</th>
                                            <th className="sa-table__num">Sessions matched</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {audiences.map(a => (
                                            <tr key={a.id}>
                                                <td>{a.name}</td>
                                                <td style={{ fontSize: 12, color: "rgba(180,180,180,0.75)" }}>
                                                    {summarizeConditions(a.conditions)}
                                                </td>
                                                <td className="sa-table__num">
                                                    {a.matchedSessions === 0
                                                        ? `No sessions matched in the last ${a.lookbackDays} days`
                                                        : `${a.matchedSessions.toLocaleString("de-DE")} sessions / last ${a.lookbackDays}d`}
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="sa-seg-filter__clear"
                                                        onClick={() => deleteAudience(a.id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
