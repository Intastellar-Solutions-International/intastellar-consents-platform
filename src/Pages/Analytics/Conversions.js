const { useState, useEffect, useCallback, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import {
    IconCash, IconCursorClick, IconTarget, IconPlus, IconTrash, IconFunnel,
    IconExternalLink, IconPhone, IconMail, IconDownload, IconFormFill,
    IconScrollDepth, IconCopy, IconPrint, IconVideo, IconBarChart,
} from "./Icons.js";

function authHeaders() {
    return {
        Authorization: Authentication.getToken(),
        Organisation:  String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };
}

// ── Auto-collected event definitions ─────────────────────────────────────────
// These are fired automatically by the embed script — no user setup needed.
// Displayed separately from user-defined conversions (same distinction GA4
// makes between "Enhanced measurement" and "Custom events").
const AUTO_EVENTS = [
    { name: "outbound_click",  label: "Outbound clicks",    Icon: IconExternalLink, color: "#6366f1" },
    { name: "scroll_depth",    label: "Scroll depth",       Icon: IconScrollDepth,  color: "#10b981" },
    { name: "form_submit",     label: "Form submissions",   Icon: IconFormFill,     color: "#f59e0b" },
    { name: "form_started",    label: "Form starts",        Icon: IconFormFill,     color: "#f59e0b" },
    { name: "form_step",       label: "Form steps",         Icon: IconFormFill,     color: "#f59e0b" },
    { name: "file_download",   label: "File downloads",     Icon: IconDownload,     color: "#3b82f6" },
    { name: "video_play",      label: "Video plays",        Icon: IconVideo,        color: "#8b5cf6" },
    { name: "video_complete",  label: "Video completions",  Icon: IconVideo,        color: "#8b5cf6" },
    { name: "video_50pct",     label: "Video 50%",          Icon: IconVideo,        color: "#8b5cf6" },
    { name: "phone_click",     label: "Phone clicks",       Icon: IconPhone,        color: "#ec4899" },
    { name: "email_click",     label: "Email clicks",       Icon: IconMail,         color: "#ec4899" },
    { name: "content_copy",    label: "Content copies",     Icon: IconCopy,         color: "#64748b" },
    { name: "page_print",      label: "Page prints",        Icon: IconPrint,        color: "#64748b" },
    { name: "rage_click",      label: "Rage clicks",        Icon: IconCursorClick,  color: "#ef4444" },
    { name: "video_pause",     label: "Video pauses",       Icon: IconVideo,        color: "#8b5cf6" },
    { name: "page_perf",       label: "Page performance",    Icon: IconBarChart,     color: "#64748b" },
    { name: "page_load",       label: "Page loads",          Icon: IconBarChart,     color: "#64748b" },
    { name: "form_error",      label: "Form errors",         Icon: IconFormFill,     color: "#ef4444" },
    { name: "form_success",    label: "Form successes",      Icon: IconFormFill,     color: "#10b981" },
    { name: "form_field_focus",       label: "Form field focus",          Icon: IconExternalLink, color: "#64748b" },
];

const AUTO_EVENT_NAMES = new Set(AUTO_EVENTS.map(e => e.name));

const KIND_ICON = {
    purchase: IconCash, click: IconCursorClick, custom: IconTarget,
    view_basket: IconFunnel, begin_checkout: IconFunnel, checkout: IconFunnel,
};
const KIND_LABEL = {
    purchase: "Purchase", click: "Click", custom: "Custom",
    view_basket: "Viewed basket", begin_checkout: "Began checkout", checkout: "Checkout",
};

function snippetFor(name, kind) {
    if (kind === "purchase") {
        return `intaAnalytics.track('${name}', {
  value: 49.99,
  currency: 'EUR',
  transactionId: 'ORDER-123',
  products: [
    { id: 'SKU-001', name: 'Blue T-Shirt', price: 29.99, quantity: 1, category: 'Apparel' },
    { id: 'SKU-002', name: 'Black Jeans',  price: 19.99, quantity: 1, category: 'Apparel' },
  ],
});`;
    }
    return `intaAnalytics.track('${name}');`;
}

// ── Auto-collected enhanced measurement block ─────────────────────────────────
function AutoCollectedBlock({ conversions }) {
    const [expanded, setExpanded] = useState(false);

    const countByName = useMemo(() => {
        const m = new Map();
        (conversions || []).forEach(c => m.set(c.name, c.count || 0));
        return m;
    }, [conversions]);

    const withCounts = AUTO_EVENTS.map(e => ({ ...e, count: countByName.get(e.name) || 0 }));
    // Events with traffic shown first; rest dimmed but still visible
    const active  = withCounts.filter(e => e.count > 0);
    const passive = withCounts.filter(e => e.count === 0);

    const visible = expanded ? withCounts : [...active, ...passive].slice(0, 8);
    const hiddenCount = withCounts.length - visible.length;

    return (
        <div className="sa-enhanced-block">
            <div className="sa-enhanced-block__head">
                <span className="sa-enhanced-block__sparkle" aria-hidden="true">✦</span>
                <div className="sa-enhanced-block__titles">
                    <span className="sa-enhanced-block__title">Auto-collected events</span>
                    <span className="sa-enhanced-block__sub">
                        Automatically measured by the Intastellar embed script — no setup needed.
                    </span>
                </div>
                <span className="sa-enhanced-block__badge">ENHANCED</span>
            </div>

            <div className="sa-enhanced-chips">
                {visible.map(e => (
                    <div
                        key={e.name}
                        className={"sa-auto-chip" + (e.count === 0 ? " sa-auto-chip--dim" : "")}
                        title={`${e.name}${e.count > 0 ? ` · ${e.count.toLocaleString("de-DE")} events` : " · no events yet"}`}
                    >
                        <span className="sa-auto-chip__icon" style={{ color: e.color }}>
                            <e.Icon style={{ width: 13, height: 13 }} />
                        </span>
                        <span className="sa-auto-chip__label">{e.label}</span>
                        {e.count > 0 && (
                            <span className="sa-auto-chip__count">{e.count.toLocaleString("de-DE")}</span>
                        )}
                    </div>
                ))}
                {!expanded && hiddenCount > 0 && (
                    <button
                        type="button"
                        className="sa-auto-chip sa-auto-chip--more"
                        onClick={() => setExpanded(true)}
                    >
                        +{hiddenCount} more
                    </button>
                )}
                {expanded && (
                    <button
                        type="button"
                        className="sa-auto-chip sa-auto-chip--more"
                        onClick={() => setExpanded(false)}
                    >
                        Show less
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Conversion event registry + live counts. Definitions are purely for
 * labelling — the ingest endpoint accepts any event name a site sends,
 * so events fired without being "registered" here still show up (flagged
 * as unregistered) rather than being silently dropped.
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
    const [openPayloads, setOpenPayloads] = useState(null);
    const [payloadsByName, setPayloadsByName] = useState({});
    const [payloadsLoading, setPayloadsLoading] = useState(null);

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

    const togglePayloads = (defName) => {
        setOpenPayloads(s => (s === defName ? null : defName));
        if (payloadsByName[defName] !== undefined) return;
        setPayloadsLoading(defName);
        fetch(`${ScannerHost}/api/analytics-event-payloads?domain=${encodeURIComponent(domain)}&name=${encodeURIComponent(defName)}`, {
            headers: authHeaders(),
        })
            .then(r => r.ok ? r.json() : { rows: [] })
            .then(d => setPayloadsByName(prev => ({ ...prev, [defName]: d.rows || [] })))
            .catch(() => setPayloadsByName(prev => ({ ...prev, [defName]: [] })))
            .finally(() => setPayloadsLoading(null));
    };

    // Merge registered defs with live counts; show unregistered events that
    // have fired — but exclude auto-collected ones (they have their own section).
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
            if (!knownNames.has(c.name) && !AUTO_EVENT_NAMES.has(c.name)) {
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
            {/* ── Auto-collected events ───────────────────────────────────── */}
            <AutoCollectedBlock conversions={conversions} />

            {/* ── User-defined conversion events ─────────────────────────── */}
            <div className="sa-panel__head sa-panel__head--mt">
                <h3 className="sa-section__title"><IconTarget className="sa-icon" /> Your conversion events</h3>
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
                        <option value="custom">Custom</option>
                        <option value="click">Click</option>
                        <option value="purchase">Purchase</option>
                        <optgroup label="Checkout funnel">
                            <option value="view_basket">Viewed basket</option>
                            <option value="begin_checkout">Began checkout</option>
                            <option value="checkout">Checkout</option>
                        </optgroup>
                    </select>
                    {["view_basket", "begin_checkout", "checkout"].includes(kind) && (
                        <p className="sa-event-form__hint">
                            Funnel step — register at least two of view basket / began checkout / checkout / purchase
                            to see them in the Funnel &amp; Sources tab.
                        </p>
                    )}
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
                                    <div className="sa-event-row__toggles">
                                        <button
                                            type="button"
                                            className="sa-event-row__snippet-toggle"
                                            onClick={() => setOpenSnippet(s => (s === r.name ? null : r.name))}
                                        >
                                            {openSnippet === r.name ? "Hide snippet" : "Show snippet"}
                                        </button>
                                        <button
                                            type="button"
                                            className="sa-event-row__snippet-toggle"
                                            onClick={() => togglePayloads(r.name)}
                                        >
                                            {openPayloads === r.name ? "Hide extra data" : "View extra data"}
                                        </button>
                                    </div>
                                    {openSnippet === r.name && (
                                        <pre className="sa-event-row__snippet">{snippetFor(r.name, r.kind)}</pre>
                                    )}
                                    {openPayloads === r.name && (
                                        <div className="sa-event-row__payloads">
                                            {payloadsLoading === r.name && (
                                                <p className="sa-event-row__payloads-empty">Loading&hellip;</p>
                                            )}
                                            {payloadsLoading !== r.name && (payloadsByName[r.name]?.length ?? 0) === 0 && (
                                                <p className="sa-event-row__payloads-empty">
                                                    No extra data recorded for this event yet — fire it with{" "}
                                                    <code>{`intaAnalytics.track('${r.name}', { data: { reason: '...' } })`}</code>{" "}
                                                    to see it here.
                                                </p>
                                            )}
                                            {payloadsLoading !== r.name && payloadsByName[r.name]?.map((p, i) => (
                                                <div key={i} className="sa-event-row__payload">
                                                    <div className="sa-event-row__payload-meta">
                                                        <span>{new Date(p.receivedAt).toLocaleString("de-DE")}</span>
                                                        <span className="sa-event-row__payload-path">{p.pathname}</span>
                                                    </div>
                                                    <pre className="sa-event-row__payload-data">
                                                        {JSON.stringify(p.data, null, 2)}
                                                    </pre>
                                                </div>
                                            ))}
                                        </div>
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
