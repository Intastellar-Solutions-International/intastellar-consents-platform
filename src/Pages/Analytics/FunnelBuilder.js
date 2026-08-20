const { useState, useEffect, useMemo, useCallback } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders } from "./_shared.js";
import { IconFunnel, IconPlus, IconTrash } from "./Icons.js";

const FUNNELS_URL = `${ScannerHost}/api/analytics-funnels`;
const EVENTS_URL  = `${ScannerHost}/api/analytics-events`;

function useFunnelList(domain, tick) {
    const [funnels, setFunnels] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setFunnels([]); return; }
        setLoading(true);
        fetch(`${FUNNELS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { funnels: [] })
            .then(d => setFunnels(d.funnels || []))
            .catch(() => setFunnels([]))
            .finally(() => setLoading(false));
    }, [domain, tick]);

    return { funnels, loading };
}

function useEventDefs(domain) {
    const [events, setEvents] = useState([]);
    useEffect(() => {
        if (!domain) { setEvents([]); return; }
        fetch(`${EVENTS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { events: [] })
            .then(d => setEvents(d.events || []))
            .catch(() => setEvents([]));
    }, [domain]);
    return events;
}

function emptyStep() {
    return { type: "pathname", match: "", matchMode: "exact", value: "" };
}

// ── Builder form: name + ordered step list ──────────────────────────────────
function FunnelForm({ domain, eventDefs, initial, onSaved, onCancel }) {
    const [name, setName] = useState(initial?.name || "");
    const [steps, setSteps] = useState(() =>
        initial?.steps?.length ? initial.steps.map(s => ({ ...emptyStep(), ...s })) : [emptyStep(), emptyStep()]
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const updateStep = (i, patch) => {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    };
    const addStep = () => setSteps(prev => [...prev, emptyStep()]);
    const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));
    const moveStep = (i, dir) => setSteps(prev => {
        const j = i + dir;
        if (j < 0 || j >= prev.length) return prev;
        const next = prev.slice();
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });

    const save = async (e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) { setError("Name is required."); return; }
        if (steps.length < 2) { setError("A funnel needs at least 2 steps."); return; }

        const cleanSteps = steps.map(s => s.type === "pathname"
            ? { type: "pathname", match: s.match.trim(), matchMode: s.matchMode }
            : { type: "event", value: s.value });

        for (const s of cleanSteps) {
            if (s.type === "pathname" && !s.match.startsWith("/")) {
                setError("Page steps must start with \"/\".");
                return;
            }
            if (s.type === "event" && !s.value) {
                setError("Every event step needs an event selected.");
                return;
            }
        }

        setSaving(true);
        try {
            const url = initial?.id ? `${FUNNELS_URL}?id=${initial.id}` : FUNNELS_URL;
            const r = await fetch(url, {
                method: initial?.id ? "PUT" : "POST",
                headers: authHeaders(),
                body: JSON.stringify({ domain, name: name.trim(), steps: cleanSteps }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { setError(d.error || "Could not save funnel."); return; }
            onSaved(d);
        } catch {
            setError("Could not save funnel.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="sa-event-form sa-funnel-form" onSubmit={save}>
            <input
                type="text"
                className="sa-event-form__input"
                placeholder="Funnel name (e.g. Checkout)"
                value={name}
                onChange={e => setName(e.target.value)}
            />

            <div className="sa-funnel-form__steps">
                {steps.map((step, i) => (
                    <div key={i} className="sa-funnel-form__step">
                        <span className="sa-funnel-form__step-index">{i + 1}</span>

                        <select
                            className="sa-event-form__select"
                            value={step.type}
                            onChange={e => updateStep(i, { type: e.target.value })}
                        >
                            <option value="pathname">Page</option>
                            <option value="event">Event</option>
                        </select>

                        {step.type === "pathname" ? (
                            <>
                                <input
                                    type="text"
                                    className="sa-event-form__input"
                                    placeholder="/checkout"
                                    value={step.match}
                                    onChange={e => updateStep(i, { match: e.target.value })}
                                />
                                <select
                                    className="sa-event-form__select"
                                    value={step.matchMode}
                                    onChange={e => updateStep(i, { matchMode: e.target.value })}
                                >
                                    <option value="exact">Exact page</option>
                                    <option value="prefix">Starts with</option>
                                </select>
                            </>
                        ) : (
                            <select
                                className="sa-event-form__select"
                                value={step.value}
                                onChange={e => updateStep(i, { value: e.target.value })}
                            >
                                <option value="">Select an event&hellip;</option>
                                {eventDefs.map(ev => (
                                    <option key={ev.name} value={ev.name}>{ev.label || ev.name}</option>
                                ))}
                            </select>
                        )}

                        <div className="sa-funnel-form__step-actions">
                            <button type="button" disabled={i === 0} onClick={() => moveStep(i, -1)} title="Move up">&uarr;</button>
                            <button type="button" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} title="Move down">&darr;</button>
                            <button type="button" disabled={steps.length <= 2} onClick={() => removeStep(i)} title="Remove step">
                                <IconTrash />
                            </button>
                        </div>
                    </div>
                ))}
                <button type="button" className="sa-add-event-btn" onClick={addStep}>
                    <IconPlus className="sa-icon" /> Add step
                </button>
            </div>

            {error && <p className="sa-event-form__hint" style={{ color: "rgba(230,140,140,0.9)" }}>{error}</p>}

            <div className="sa-funnel-form__actions">
                <button type="submit" className="sa-event-form__submit" disabled={saving}>
                    {saving ? "Saving…" : "Save funnel"}
                </button>
                <button type="button" className="sa-funnel-form__cancel" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

// ── Detail: real ordered-step counts from the compute endpoint ─────────────
function FunnelDetail({ domain, funnel, fromIso, toIso }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!domain || !funnel?.id) return;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, id: funnel.id, compute: "1", from: fromIso, to: toIso }).toString();
        fetch(`${FUNNELS_URL}?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setData)
            .catch(() => setError("Could not compute this funnel."))
            .finally(() => setLoading(false));
    }, [domain, funnel?.id, fromIso, toIso]);

    if (loading) return <p className="sa-notice">Computing&hellip;</p>;
    if (error) return <p className="sa-notice sa-notice--error">{error}</p>;
    if (!data) return null;

    const firstStepSessions = data.steps[0]?.sessions || 0;

    return (
        <>
            {data.steps.map((step, i) => {
                const pct = firstStepSessions > 0 ? Math.round((step.sessions / firstStepSessions) * 100) : 0;
                const prev = data.steps[i - 1];
                const dropOffPct = prev && prev.sessions > 0
                    ? Math.round((1 - step.sessions / prev.sessions) * 1000) / 10
                    : null;
                return (
                    <div key={step.index} className="sa-funnel-step">
                        {i > 0 && dropOffPct != null && (
                            <div className="sa-funnel-step__dropoff">&darr; {dropOffPct}% drop-off</div>
                        )}
                        <div className="sa-funnel-step__row">
                            <span className="sa-funnel-step__label">{step.label}</span>
                            <div className="sa-funnel-step__track">
                                <div className="sa-funnel-step__fill" style={{ width: pct + "%" }} />
                            </div>
                            <span className="sa-funnel-step__value">
                                {step.sessions.toLocaleString("de-DE")}
                                <span className="sa-funnel-step__pct">({pct}%)</span>
                            </span>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

export default function FunnelBuilder({ domain, fromIso, toIso }) {
    const [tick, setTick] = useState(0);
    const { funnels, loading } = useFunnelList(domain, tick);
    const eventDefs = useEventDefs(domain);
    const [view, setView] = useState("list"); // "list" | "form" | "detail"
    const [activeFunnel, setActiveFunnel] = useState(null);

    const openNew = () => { setActiveFunnel(null); setView("form"); };
    const openEdit = (f) => { setActiveFunnel(f); setView("form"); };
    const openDetail = (f) => { setActiveFunnel(f); setView("detail"); };

    const remove = useCallback(async (f) => {
        await fetch(`${FUNNELS_URL}?id=${f.id}&domain=${encodeURIComponent(domain)}`, {
            method: "DELETE", headers: authHeaders(),
        }).catch(() => {});
        setTick(t => t + 1);
        if (activeFunnel?.id === f.id) { setView("list"); setActiveFunnel(null); }
    }, [domain, activeFunnel]);

    const onSaved = (saved) => {
        setTick(t => t + 1);
        setActiveFunnel(saved);
        setView("detail");
    };

    return (
        <div className="sa-panel sa-conv-funnel-panel">
            <div className="sa-panel__head">
                <h3 className="sa-panel__title">
                    <IconFunnel className="sa-icon" />
                    {view === "detail" && activeFunnel ? activeFunnel.name : "Funnels"}
                </h3>
                {view === "list" && (
                    <button type="button" className="sa-add-event-btn" onClick={openNew}>
                        <IconPlus className="sa-icon" /> New funnel
                    </button>
                )}
                {view !== "list" && (
                    <button type="button" className="sa-funnel-form__cancel" onClick={() => { setView("list"); setActiveFunnel(null); }}>
                        &larr; Back to funnels
                    </button>
                )}
            </div>

            {view === "list" && (
                <>
                    {!loading && funnels.length === 0 && (
                        <p className="sa-panel__sub">
                            No funnels yet. Build one from a sequence of pages or events (e.g. Product page &rarr; Add to
                            cart &rarr; Checkout &rarr; Order) to see real, order-enforced drop-off between steps.
                        </p>
                    )}
                    <div className="sa-events-list">
                        {funnels.map(f => (
                            <div key={f.id} className="sa-event-row">
                                <div className="sa-event-row__icon"><IconFunnel /></div>
                                <div className="sa-event-row__body">
                                    <div className="sa-event-row__top">
                                        <span className="sa-event-row__name" style={{ cursor: "pointer" }} onClick={() => openDetail(f)}>
                                            {f.name}
                                        </span>
                                        <span className="sa-event-row__kind">{f.steps.length} steps</span>
                                    </div>
                                    <button type="button" className="sa-event-row__snippet-toggle" onClick={() => openEdit(f)}>
                                        Edit
                                    </button>
                                </div>
                                <button type="button" className="sa-event-row__delete" onClick={() => remove(f)} title="Delete funnel">
                                    <IconTrash />
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {view === "form" && (
                <FunnelForm
                    domain={domain}
                    eventDefs={eventDefs}
                    initial={activeFunnel}
                    onSaved={onSaved}
                    onCancel={() => setView(activeFunnel ? "detail" : "list")}
                />
            )}

            {view === "detail" && activeFunnel && (
                <FunnelDetail domain={domain} funnel={activeFunnel} fromIso={fromIso} toIso={toIso} />
            )}
        </div>
    );
}
