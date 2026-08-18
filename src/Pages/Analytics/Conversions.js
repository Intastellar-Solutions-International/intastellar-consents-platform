const { useState, useEffect, useCallback, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import { IconCash, IconCursorClick, IconTarget, IconPlus, IconTrash, IconFunnel } from "./Icons.js";

function authHeaders() {
    return {
        Authorization: Authentication.getToken(),
        Organisation:  String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };
}

const KIND_ICON  = {
    purchase: IconCash, click: IconCursorClick, custom: IconTarget,
    view_basket: IconFunnel, begin_checkout: IconFunnel, checkout: IconFunnel,
};
const KIND_LABEL = {
    purchase: "Purchase", click: "Click", custom: "Custom",
    view_basket: "Viewed basket", begin_checkout: "Began checkout", checkout: "Checkout",
};

function snippetFor(name, kind) {
    if (kind === "purchase") {
        return `intaAnalytics.track('${name}', { value: 49.99, currency: 'EUR' });`;
    }
    return `intaAnalytics.track('${name}');`;
}

/**
 * Conversion event registry + live counts. Definitions are purely for
 * labelling — the ingest endpoint accepts any event name a site sends,
 * so events fired without being "registered" here still show up (flagged
 * as unregistered) rather than being silently dropped. The funnel view
 * (checkout-step visualization) lives separately in ConversionFunnel.js —
 * this panel is the implementation/setup surface: every tracked event,
 * its kind, snippet, and consent-linked ratio, regardless of whether it
 * also gets a nicer visualization elsewhere.
 */
export default function ConversionsPanel({ domain, conversions, onDefsChanged }) {
    const [defs, setDefs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState("");
    const [kind, setKind] = useState("custom");
    const [label, setLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [openSnippet, setOpenSnippet] = useState(null);

    const fetchDefs = useCallback(() => {
        if (!domain) { setDefs([]); setLoading(false); return; }
        setLoading(true);
        fetch(`${ScannerHost}/api/analytics-events?domain=${encodeURIComponent(domain)}`, {
            headers: authHeaders(),
        })
            .then(r => r.ok ? r.json() : { events: [] })
            .then(d => setDefs(d.events || []))
            .catch(() => setDefs([]))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { fetchDefs(); }, [fetchDefs]);

    const createDef = async (e) => {
        e.preventDefault();
        if (!name.trim() || !domain) return;
        setSaving(true);
        setError(null);
        const r = await fetch(`${ScannerHost}/api/analytics-events`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain, name: name.trim(), kind, label: label.trim() }),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) { setError("Could not create event — check the domain has a site key yet."); return; }
        setName(""); setLabel(""); setKind("custom"); setShowForm(false);
        fetchDefs();
        onDefsChanged?.();
    };

    const removeDef = async (defName) => {
        await fetch(
            `${ScannerHost}/api/analytics-events?domain=${encodeURIComponent(domain)}&name=${encodeURIComponent(defName)}`,
            { method: "DELETE", headers: authHeaders() }
        ).catch(() => null);
        fetchDefs();
        onDefsChanged?.();
    };

    const rows = useMemo(() => {
        const byName = new Map((conversions || []).map(c => [c.name, c]));
        const out = defs.map(d => {
            const live = byName.get(d.name);
            return {
                name: d.name, label: d.label || d.name, kind: d.kind,
                count: live?.count || 0, linkedCount: live?.linkedCount || 0,
                value: live?.value || 0, currency: live?.currency || null,
                registered: true,
            };
        });
        const knownNames = new Set(defs.map(d => d.name));
        (conversions || []).forEach(c => {
            if (!knownNames.has(c.name)) {
                out.push({
                    name: c.name, label: c.label, kind: c.kind,
                    count: c.count, linkedCount: c.linkedCount,
                    value: c.value, currency: c.currency,
                    registered: false,
                });
            }
        });
        return out;
    }, [defs, conversions]);

    return (
        <div className="sa-section">
            <div className="sa-panel__head">
                <h3 className="sa-section__title"><IconTarget className="sa-icon" /> Conversions</h3>
                <button type="button" className="sa-add-event-btn" onClick={() => setShowForm(s => !s)}>
                    <IconPlus className="sa-icon" /> Add event
                </button>
            </div>

            {showForm && (
                <form className="sa-event-form" onSubmit={createDef}>
                    <input
                        type="text"
                        className="sa-event-form__input"
                        placeholder="event name, e.g. purchase"
                        value={name}
                        onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                        maxLength={64}
                        required
                    />
                    <select className="sa-event-form__select" value={kind} onChange={e => setKind(e.target.value)}>
                        <option value="purchase">Purchase</option>
                        <option value="click">Click</option>
                        <option value="custom">Custom</option>
                    </select>
                    <input
                        type="text"
                        className="sa-event-form__input"
                        placeholder="display label (optional)"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        maxLength={120}
                    />
                    <button type="submit" className="sa-event-form__submit" disabled={saving}>
                        {saving ? "Saving…" : "Create"}
                    </button>
                </form>
            )}
            {error && <p className="sa-notice sa-notice--error">{error}</p>}

            {!loading && rows.length === 0 && (
                <p className="sa-panel__sub">
                    No conversion events yet. Add one above, then fire it from your site with{" "}
                    <code>intaAnalytics.track('name')</code>.
                </p>
            )}

            {rows.length > 0 && (
                <div className="sa-events-list">
                    {rows.map(r => {
                        const Icon = KIND_ICON[r.kind] || IconTarget;
                        return (
                            <div key={r.name} className="sa-event-row">
                                <div className="sa-event-row__icon"><Icon /></div>
                                <div className="sa-event-row__body">
                                    <div className="sa-event-row__top">
                                        <span className="sa-event-row__name">{r.label}</span>
                                        <span className="sa-event-row__kind">{KIND_LABEL[r.kind] || "Custom"}</span>
                                        {!r.registered && (
                                            <span className="sa-event-row__unregistered">not registered</span>
                                        )}
                                    </div>
                                    <div className="sa-event-row__stats">
                                        <span>{r.count.toLocaleString("de-DE")} events</span>
                                        {r.value > 0 && (
                                            <span>
                                                {r.value.toLocaleString("de-DE", { style: "currency", currency: r.currency || "EUR" })}
                                            </span>
                                        )}
                                        <span className="sa-event-row__consent-note">
                                            {r.linkedCount.toLocaleString("de-DE")}/{r.count.toLocaleString("de-DE")} consent-linked
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="sa-event-row__snippet-toggle"
                                        onClick={() => setOpenSnippet(s => (s === r.name ? null : r.name))}
                                    >
                                        {openSnippet === r.name ? "Hide snippet" : "Show snippet"}
                                    </button>
                                    {openSnippet === r.name && (
                                        <pre className="sa-event-row__snippet">{snippetFor(r.name, r.kind)}</pre>
                                    )}
                                </div>
                                {r.registered && (
                                    <button
                                        type="button"
                                        className="sa-event-row__delete"
                                        onClick={() => removeDef(r.name)}
                                        aria-label={`Remove ${r.name}`}
                                    >
                                        <IconTrash />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
