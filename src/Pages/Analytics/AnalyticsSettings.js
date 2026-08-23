const { useState, useEffect, useCallback, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import "./Analytics.css";

const AD_CONNECTIONS_URL      = `${ScannerHost}/api/ad-connections`;
const AD_CONV_ACTIONS_URL     = `${ScannerHost}/api/ad-conversion-actions`;
const SITE_URL                = `${ScannerHost}/api/analytics-site`;
const DISPLAY_CURRENCIES  = ["EUR", "USD", "GBP", "DKK", "SEK", "NOK", "CHF"];
const CURRENCY_PREFS_KEY  = "ia_ad_display_currency";

const PLATFORM_LABELS = {
    google_ads:    "Google Ads",
    meta_ads:      "Meta Ads",
    microsoft_ads: "Microsoft Ads",
    linkedin_ads:  "LinkedIn Ads",
};

const PLATFORM_HINTS = {
    microsoft_ads: "Goal name from Microsoft Advertising → Tools → Conversion goals, e.g. Purchase",
    meta_ads:      "Not required — Meta uses the event name (purchase, lead, etc.) mapped to standard events automatically.",
    linkedin_ads:  "Conversion ID from LinkedIn Campaign Manager → Analyze → Conversion tracking.",
};

// ── Reusable field wrapper ────────────────────────────────────────────────────

function Field({ label, hint, children }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(180,180,180,0.7)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}
            </label>
            {children}
            {hint && <p style={{ fontSize: 11, color: "rgba(130,130,130,0.55)", marginTop: 5, lineHeight: 1.5 }}>{hint}</p>}
        </div>
    );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }) {
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">{title}</h3>
            <div style={{ marginTop: 14 }}>
                {children}
            </div>
        </div>
    );
}

// ── Conversion actions section ────────────────────────────────────────────────

function GoogleConversionActionPicker({ domain, draft, onChange }) {
    const [actions,  setActions]  = useState(null);  // null = not loaded yet
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState(null);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(() => {
        if (!domain || actions !== null) return;
        setLoading(true);
        setError(null);
        fetch(
            `${AD_CONV_ACTIONS_URL}?domain=${encodeURIComponent(domain)}&platform=google_ads`,
            { headers: authHeaders() }
        )
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error);
                setActions(d.actions || []);
                setExpanded(true);
            })
            .catch(e => { setError(e.message); setActions([]); })
            .finally(() => setLoading(false));
    }, [domain, actions]);

    // Currently-saved value is a full resource name — extract the human name
    // by matching against the fetched list, or fall back to showing the raw
    // resource name string if the list hasn't loaded.
    const selectedName = useMemo(() => {
        if (!draft) return null;
        if (!actions) return draft; // show raw until list loads
        const match = actions.find(a => a.resourceName === draft);
        return match ? match.name : draft;
    }, [draft, actions]);

    return (
        <Field label="Conversion action">
            {/* Collapsed state — shows currently saved value + a button to pick */}
            {!expanded ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{
                        flex: 1, padding: "8px 10px", borderRadius: 6,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 13, color: draft ? "rgba(210,210,210,0.9)" : "rgba(130,130,130,0.4)",
                        minHeight: 36, display: "flex", alignItems: "center",
                    }}>
                        {selectedName || "Not set"}
                    </div>
                    <button
                        className="sa-btn"
                        onClick={load}
                        disabled={loading}
                        style={{ whiteSpace: "nowrap" }}
                    >
                        {loading ? "Loading…" : "Choose"}
                    </button>
                </div>
            ) : (
                /* Expanded picker — list of conversion actions as radio-style rows */
                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" }}>
                    {(actions || []).length === 0 ? (
                        <div style={{ padding: "12px 14px", fontSize: 13, color: "rgba(130,130,130,0.5)" }}>
                            No conversion actions found in this account.
                        </div>
                    ) : (actions || []).map(a => {
                        const isSelected = draft === a.resourceName;
                        return (
                            <button
                                key={a.resourceName}
                                onClick={() => { onChange(a.resourceName); setExpanded(false); }}
                                style={{
                                    display: "block", width: "100%", textAlign: "left",
                                    padding: "10px 14px", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
                                    background: isSelected ? "rgba(192,159,83,0.1)" : "rgba(255,255,255,0.02)",
                                    cursor: "pointer", transition: "background 0.15s",
                                }}
                            >
                                <div style={{ fontWeight: isSelected ? 600 : 400, fontSize: 13, color: isSelected ? "rgba(192,159,83,0.95)" : "rgba(210,210,210,0.85)" }}>
                                    {a.name}
                                </div>
                                <div style={{ fontSize: 11, color: "rgba(130,130,130,0.45)", marginTop: 2, fontFamily: "monospace" }}>
                                    {a.type ? a.type.replace(/_/g, " ").toLowerCase() : ""}
                                </div>
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setExpanded(false)}
                        style={{
                            display: "block", width: "100%", textAlign: "center",
                            padding: "8px", border: "none",
                            background: "rgba(255,255,255,0.02)", cursor: "pointer",
                            fontSize: 12, color: "rgba(130,130,130,0.5)",
                        }}
                    >
                        Cancel
                    </button>
                </div>
            )}
            {error && (
                <p style={{ fontSize: 11, color: "rgba(239,68,68,0.75)", marginTop: 6 }}>
                    Could not load conversion actions: {error}
                </p>
            )}
            <p style={{ fontSize: 11, color: "rgba(130,130,130,0.45)", marginTop: 6, lineHeight: 1.5 }}>
                Pulled live from your Google Ads account. The full resource name is stored and used when pushing conversions.
            </p>
        </Field>
    );
}

function ConversionActionsSection({ domain }) {
    const [connections, setConnections] = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [drafts,      setDrafts]      = useState({});   // platform → value
    const [saving,      setSaving]      = useState({});   // platform → bool
    const [saved,       setSaved]       = useState({});   // platform → bool

    const load = useCallback(() => {
        if (!domain) { setConnections([]); setLoading(false); return; }
        setLoading(true);
        fetch(`${AD_CONNECTIONS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { connections: [] })
            .then(d => {
                const conns = (d.connections || []).filter(c => c.has_token);
                setConnections(conns);
                const init = {};
                conns.forEach(c => { init[c.platform] = c.conversion_action || ""; });
                setDrafts(init);
            })
            .catch(() => setConnections([]))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { load(); }, [load]);

    async function save(platform) {
        setSaving(s => ({ ...s, [platform]: true }));
        const r = await fetch(
            `${AD_CONNECTIONS_URL}?platform=${encodeURIComponent(platform)}&domain=${encodeURIComponent(domain)}`,
            {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify({ conversionAction: drafts[platform] || null }),
            }
        ).catch(() => null);
        setSaving(s => ({ ...s, [platform]: false }));
        if (r?.ok) {
            setSaved(s => ({ ...s, [platform]: true }));
            setTimeout(() => setSaved(s => ({ ...s, [platform]: false })), 2000);
        }
    }

    if (!domain) return (
        <p style={{ color: "rgba(130,130,130,0.5)", fontSize: 13 }}>Select a domain in the header.</p>
    );

    if (loading) return <p style={{ color: "rgba(130,130,130,0.5)", fontSize: 13 }}>Loading connections…</p>;

    if (connections.length === 0) return (
        <div>
            <p style={{ color: "rgba(130,130,130,0.55)", fontSize: 13, marginBottom: 8 }}>
                No ad platforms connected for <strong style={{ color: "rgba(210,210,210,0.8)" }}>{domain}</strong> yet.
            </p>
            <p style={{ color: "rgba(130,130,130,0.5)", fontSize: 12, lineHeight: 1.5 }}>
                Go to <strong>Settings → Ad Connections</strong> to connect Google Ads, Meta, or Microsoft Ads via OAuth.
                Once connected, come back here to configure the conversion action for each platform.
            </p>
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {connections.map(conn => {
                const platform = conn.platform;
                const isMetaLike = platform === "meta_ads";
                const isGoogle   = platform === "google_ads";
                return (
                    <div key={platform} style={{
                        padding: "14px 16px", borderRadius: 8,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{PLATFORM_LABELS[platform] || platform}</div>
                                <div style={{ fontSize: 12, color: "rgba(130,130,130,0.6)", marginTop: 2 }}>
                                    Account: {conn.account_label || conn.account_id || "—"}
                                </div>
                            </div>
                            <span style={{
                                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                                background: "rgba(74,222,128,0.1)", color: "rgba(74,222,128,0.85)",
                            }}>Connected</span>
                        </div>

                        {isMetaLike ? (
                            <p style={{ fontSize: 12, color: "rgba(130,130,130,0.55)", lineHeight: 1.5, margin: 0 }}>
                                {PLATFORM_HINTS[platform]}
                            </p>
                        ) : isGoogle ? (
                            /* Google Ads: live picker fetched from the API */
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <GoogleConversionActionPicker
                                    domain={domain}
                                    draft={drafts[platform] || ""}
                                    onChange={val => setDrafts(d => ({ ...d, [platform]: val }))}
                                />
                                {drafts[platform] !== (conn.conversion_action || "") && (
                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                        <button
                                            className="sa-btn"
                                            onClick={() => save(platform)}
                                            disabled={saving[platform]}
                                        >
                                            {saving[platform] ? "Saving…" : saved[platform] ? "Saved!" : "Save"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Microsoft Ads etc: plain text input */
                            <Field label="Conversion action" hint={PLATFORM_HINTS[platform]}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <input
                                        type="text"
                                        className="as-input"
                                        style={{
                                            flex: 1, padding: "8px 10px", borderRadius: 6,
                                            background: "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            color: "rgba(210,210,210,0.9)", fontSize: 13,
                                        }}
                                        placeholder="Purchase"
                                        value={drafts[platform] || ""}
                                        onChange={e => setDrafts(d => ({ ...d, [platform]: e.target.value }))}
                                    />
                                    <button
                                        className="sa-btn"
                                        onClick={() => save(platform)}
                                        disabled={saving[platform]}
                                        style={{ whiteSpace: "nowrap" }}
                                    >
                                        {saving[platform] ? "Saving…" : saved[platform] ? "Saved!" : "Save"}
                                    </button>
                                </div>
                            </Field>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Site configuration section ────────────────────────────────────────────────

const BUSINESS_TYPES = [
    {
        value: "ecommerce",
        label: "E-commerce",
        tagline: "Revenue, transactions & conversion funnel",
        highlights: ["Revenue", "Transactions", "Conversion rate"],
    },
    {
        value: "b2b",
        label: "B2B / SaaS",
        tagline: "Lead quality, form completions & pipeline",
        highlights: ["Quality leads", "Form fills", "Trial starts"],
    },
    {
        value: "media",
        label: "Media & Content",
        tagline: "Page views, scroll depth & return readers",
        highlights: ["Page views", "Scroll depth", "Return rate"],
    },
    {
        value: "local",
        label: "Local Business",
        tagline: "Local traffic, contact actions & mobile",
        highlights: ["Local visitors", "Contact clicks", "Mobile ratio"],
    },
];

const INDUSTRIES = [
    { value: "",            label: "Not set" },
    { value: "aviation",    label: "Aviation" },
    { value: "tourism",     label: "Tourism & Travel" },
    { value: "hospitality", label: "Hospitality" },
    { value: "ecommerce",   label: "E-commerce & Retail" },
    { value: "finance",     label: "Finance & Insurance" },
    { value: "healthcare",  label: "Healthcare" },
    { value: "saas",        label: "SaaS & Technology" },
    { value: "media",       label: "Media & Publishing" },
    { value: "education",   label: "Education" },
    { value: "real_estate", label: "Real Estate" },
    { value: "automotive",  label: "Automotive" },
    { value: "other",       label: "Other" },
];

function SiteConfigSection({ domain }) {
    const [site,         setSite]         = useState(null);
    const [loading,      setLoading]      = useState(true);
    const [industry,     setIndustry]     = useState("");
    const [businessType, setBusinessType] = useState("");
    const [savingInd,    setSavingInd]    = useState(false);
    const [savedInd,     setSavedInd]     = useState(false);
    const [savingBt,     setSavingBt]     = useState(false);
    const [savedBt,      setSavedBt]      = useState(false);
    const [error,        setError]        = useState(null);

    const load = useCallback(() => {
        if (!domain) { setSite(null); setLoading(false); return; }
        setLoading(true);
        fetch(`${SITE_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d) {
                    setSite(d);
                    setIndustry(d.industry || "");
                    setBusinessType(d.businessType || "");
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { load(); }, [load]);

    async function patch(body, setSaving, setSaved) {
        setSaving(true); setError(null);
        const r = await fetch(`${SITE_URL}?domain=${encodeURIComponent(domain)}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify(body),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) { setError("Could not save."); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
    }

    if (!domain) return <p style={{ color: "rgba(130,130,130,0.5)", fontSize: 13 }}>Select a domain.</p>;
    if (loading) return <p style={{ color: "rgba(130,130,130,0.5)", fontSize: 13 }}>Loading…</p>;
    if (!site)   return <p style={{ color: "rgba(130,130,130,0.5)", fontSize: 13 }}>No site key found for {domain}. Generate one in Settings → Analytics Script.</p>;

    const snippet = `<script src="https://analytics.consentsmanagement.com/api/a" data-site="${site.id}" async defer></script>`;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Site key */}
            <Field label="Site key">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <code style={{
                        flex: 1, padding: "8px 10px", borderRadius: 6,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 13, color: "rgba(192,159,83,0.9)", fontFamily: "monospace",
                    }}>
                        {site.id}
                    </code>
                    <button className="sa-btn" onClick={() => navigator.clipboard?.writeText(site.id)}>Copy</button>
                </div>
            </Field>

            {/* Embed snippet */}
            <Field label="Embed snippet" hint='Paste into the <head> of every page on this domain.'>
                <div style={{ position: "relative" }}>
                    <code style={{
                        display: "block", padding: "10px 12px", borderRadius: 6,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 11, color: "rgba(210,210,210,0.75)", fontFamily: "monospace",
                        wordBreak: "break-all", lineHeight: 1.6,
                    }}>
                        {snippet}
                    </code>
                    <button className="sa-btn" style={{ position: "absolute", top: 8, right: 8 }}
                        onClick={() => navigator.clipboard?.writeText(snippet)}>
                        Copy
                    </button>
                </div>
            </Field>

            {/* Industry benchmark */}
            <Field label="Industry" hint="Used to show industry benchmarks next to your consent rate.">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={industry} onChange={e => setIndustry(e.target.value)} style={{
                        flex: 1, padding: "8px 10px", borderRadius: 6,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(210,210,210,0.9)", fontSize: 13,
                    }}>
                        {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                    <button className="sa-btn"
                        onClick={() => patch({ industry: industry || null }, setSavingInd, setSavedInd)}
                        disabled={savingInd || industry === (site.industry || "")}>
                        {savingInd ? "Saving…" : savedInd ? "Saved!" : "Save"}
                    </button>
                </div>
            </Field>

            {/* Dashboard mode */}
            <Field label="Dashboard mode"
                hint="Reorders the overview to highlight what matters most for your business. Enables the revenue card when ecommerce events are tracked.">
                <div className="sa-biztype-grid">
                    {BUSINESS_TYPES.map(bt => (
                        <button key={bt.value} type="button"
                            className={"sa-biztype-card" + (businessType === bt.value ? " sa-biztype-card--active" : "")}
                            onClick={() => setBusinessType(businessType === bt.value ? "" : bt.value)}>
                            <div className="sa-biztype-card__name">{bt.label}</div>
                            <div className="sa-biztype-card__tagline">{bt.tagline}</div>
                            <div className="sa-biztype-card__pills">
                                {bt.highlights.map(h => (
                                    <span key={h} className="sa-biztype-card__pill">{h}</span>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                    <button className="sa-btn"
                        onClick={() => patch({ businessType: businessType || null }, setSavingBt, setSavedBt)}
                        disabled={savingBt || businessType === (site.businessType || "")}>
                        {savingBt ? "Saving…" : savedBt ? "Saved!" : "Save mode"}
                    </button>
                    {businessType && (
                        <button className="sa-btn" style={{ opacity: 0.65 }}
                            onClick={() => setBusinessType("")}>
                            Clear
                        </button>
                    )}
                </div>
                {error && <p style={{ color: "rgba(239,68,68,0.8)", fontSize: 12, marginTop: 6 }}>{error}</p>}
            </Field>

        </div>
    );
}

// ── Display currency section ──────────────────────────────────────────────────

function DisplayCurrencySection() {
    const [currency, setCurrency] = useState(() => {
        try { return localStorage.getItem(CURRENCY_PREFS_KEY) || "EUR"; } catch { return "EUR"; }
    });

    function pick(c) {
        setCurrency(c);
        try { localStorage.setItem(CURRENCY_PREFS_KEY, c); } catch {}
    }

    return (
        <div>
            <p style={{ fontSize: 13, color: "rgba(180,180,180,0.65)", marginBottom: 14, lineHeight: 1.5 }}>
                All ad spend figures across Google Ads, Meta, and Microsoft Ads will be converted
                to this currency using ECB rates fetched daily. The preference is stored per-browser.
            </p>
            <div className="sa-currency-picker">
                {DISPLAY_CURRENCIES.map(c => (
                    <button
                        key={c}
                        className={"sa-currency-btn" + (currency === c ? " sa-currency-btn--active" : "")}
                        onClick={() => pick(c)}
                    >
                        {c}
                    </button>
                ))}
            </div>
            <p style={{ fontSize: 11, color: "rgba(130,130,130,0.45)", marginTop: 10 }}>
                Rates sourced from the European Central Bank. EUR is the base (no conversion).
            </p>
        </div>
    );
}

// ── How attribution works ─────────────────────────────────────────────────────

function AttributionGuide() {
    const steps = [
        {
            label: "1. Visitor clicks an ad",
            body: "Ad platforms append a click ID to the landing URL: gclid (Google Ads), msclkid (Microsoft Ads), or fbclid (Meta). The embed script reads it and stores it in a 90-day cookie (_ia_cid).",
        },
        {
            label: "2. Visitor converts",
            body: "When your site calls window.intaAnalytics.track('purchase', { value: 49.99, currency: 'EUR' }), the embed includes the stored click ID in the event — if the visitor has accepted statisticCookies.",
        },
        {
            label: "3. Push to ad platforms",
            body: "A push record is queued in the Attribution dashboard. Click 'Push pending' there (or POST /api/ad-conversion-push on a schedule) to send the conversion upstream so each platform can credit the campaign and optimise bidding.",
        },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {steps.map(s => (
                <div key={s.label} style={{
                    padding: "12px 14px", borderRadius: 6,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: "rgba(180,180,180,0.65)", lineHeight: 1.6 }}>{s.body}</div>
                </div>
            ))}
            <div style={{
                marginTop: 4, padding: "10px 14px", borderRadius: 6,
                background: "rgba(192,159,83,0.06)", border: "1px solid rgba(192,159,83,0.18)",
                fontSize: 12, color: "rgba(192,159,83,0.75)", lineHeight: 1.5,
            }}>
                <strong style={{ color: "rgba(192,159,83,0.9)" }}>Google Ads note:</strong> You must select a Conversion action above for pushes to work. Click <em>Choose</em> next to your Google Ads connection — it will pull the list live from your account so you can pick by name.
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsSettings() {
    document.title = "Analytics Settings | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate }
        = useAnalyticsPageChrome();

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Analytics Settings"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    <Section title="Site Configuration">
                        <SiteConfigSection domain={domain} />
                    </Section>

                    <Section title="Display Currency">
                        <DisplayCurrencySection />
                    </Section>

                    <Section title="Conversion Actions">
                        <p style={{ fontSize: 13, color: "rgba(180,180,180,0.65)", marginBottom: 16, lineHeight: 1.5 }}>
                            Set the conversion action identifier for each connected ad platform. This is used when
                            pushing conversions server-side so each platform can attribute and optimise against the
                            right goal.
                        </p>
                        <ConversionActionsSection domain={domain} />
                    </Section>

                    <Section title="How Attribution Works">
                        <AttributionGuide />
                    </Section>

                </div>
            </div>
        </div>
    );
}
