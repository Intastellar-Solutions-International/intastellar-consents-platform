const { useState, useEffect, useCallback } = window.React;
import Authentication from "../../../Authentication/Auth.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../../API/host.js";
import "../Style.css";

const INGEST_URL = "https://analytics.consentsmanagement.com/api/a";

function readCachedDomains() {
    try {
        const raw = localStorage.getItem("domains");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(d => d && typeof d === "string" && d !== "combined view");
    } catch { return []; }
}

function CopyButton({ text, label = "Copy" }) {
    const [copied, setCopied] = useState(false);
    const copy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [text]);
    return (
        <button
            type="button"
            className={"as-copy-btn" + (copied ? " as-copy-btn--done" : "")}
            onClick={copy}
            aria-label={copied ? "Copied!" : label}
        >
            {copied ? "Copied!" : label}
        </button>
    );
}

const KIND_OPTIONS = ["purchase", "click", "custom"];

// Mirrors the value/label pairs in api/_industry-benchmarks.js — the actual
// benchmark numbers stay server-side (api/ and src/ aren't cross-imported in
// this project), this list only needs to stay in sync for the dropdown.
const INDUSTRIES = [
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

function IndustrySection({ domain, site, onSaved }) {
    const [industry, setIndustry] = useState(site.industry || "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    const authHeaders = {
        Authorization: Authentication.getToken(),
        Organisation: String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        const r = await fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ industry: industry || null }),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) { setError("Could not save industry."); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onSaved?.();
    };

    return (
        <div className="as-card">
            <div className="as-section-head">
                <h3 className="as-section-title">Industry</h3>
            </div>
            <p className="as-section-hint">
                Used to show an industry-reference comparison next to this domain&rsquo;s consent rate, in the
                Analytics overview and Consent tab. These are indicative reference figures, not a live average
                computed from other customers&rsquo; traffic.
            </p>

            <div className="as-field-group">
                <select className="as-select" value={industry} onChange={e => setIndustry(e.target.value)}>
                    <option value="">Not set</option>
                    {INDUSTRIES.map(i => (
                        <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                </select>
            </div>

            {error && <p className="as-error">{error}</p>}

            <button type="button" className="as-generate-btn" onClick={save} disabled={saving || industry === (site.industry || "")}>
                {saving ? "Saving…" : saved ? "Saved!" : "Save industry"}
            </button>
        </div>
    );
}

function DataLayerSection({ domain, datalayerEnabled, onToggle }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        datalayerEvent: "purchase", mapsToName: "purchase", kind: "purchase",
        valuePath: "ecommerce.value", currencyPath: "ecommerce.currency", transactionIdPath: "ecommerce.transaction_id",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const authHeaders = {
        Authorization: Authentication.getToken(),
        Organisation: String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };

    const fetchRules = useCallback(() => {
        if (!domain) { setRules([]); setLoading(false); return; }
        setLoading(true);
        fetch(`${ScannerHost}/api/analytics-datalayer-rules?domain=${encodeURIComponent(domain)}`, { headers: authHeaders })
            .then(r => r.ok ? r.json() : { rules: [] })
            .then(d => setRules(d.rules || []))
            .catch(() => setRules([]))
            .finally(() => setLoading(false));
    }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const addRule = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const r = await fetch(`${ScannerHost}/api/analytics-datalayer-rules`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ domain, ...form }),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) { setError("Could not save rule — check the paths are valid (letters/numbers/underscore, max 4 levels)."); return; }
        setShowForm(false);
        fetchRules();
    };

    const removeRule = async (datalayerEvent) => {
        await fetch(
            `${ScannerHost}/api/analytics-datalayer-rules?domain=${encodeURIComponent(domain)}&datalayerEvent=${encodeURIComponent(datalayerEvent)}`,
            { method: "DELETE", headers: authHeaders }
        ).catch(() => null);
        fetchRules();
    };

    return (
        <div className="as-card">
            <div className="as-section-head">
                <h3 className="as-section-title">Automatic event tracking (dataLayer)</h3>
                <label className="as-toggle">
                    <input type="checkbox" checked={datalayerEnabled} onChange={e => onToggle(e.target.checked)} />
                    <span className="as-toggle__track"><span className="as-toggle__thumb" /></span>
                </label>
            </div>
            <p className="as-section-hint">
                Listens to your site&rsquo;s <code>window.dataLayer</code> (GTM/GA4) and maps matching pushes to{" "}
                <code>intaAnalytics.track()</code> automatically. Only three fixed fields are ever read from a
                matched push &mdash; <strong>value</strong>, <strong>currency</strong>, and <strong>transaction ID</strong> &mdash;
                nothing else in the pushed object is ever captured or stored.
            </p>

            {datalayerEnabled && (
                <>
                    {loading && <p className="as-loading">Loading&hellip;</p>}

                    {!loading && rules.map(r => (
                        <div className="as-rule-row" key={r.datalayerEvent}>
                            <div className="as-rule-row__body">
                                <span className="as-rule-row__name">
                                    dataLayer <code>{r.datalayerEvent}</code> &rarr; <code>{r.mapsToName}</code>
                                </span>
                                <span className="as-rule-row__paths">
                                    {r.valuePath && <span>value: <code>{r.valuePath}</code></span>}
                                    {r.currencyPath && <span>currency: <code>{r.currencyPath}</code></span>}
                                    {r.transactionIdPath && <span>txn id: <code>{r.transactionIdPath}</code></span>}
                                </span>
                            </div>
                            <button type="button" className="as-rule-row__delete" onClick={() => removeRule(r.datalayerEvent)}>
                                Remove
                            </button>
                        </div>
                    ))}

                    {!loading && !rules.length && !showForm && (
                        <p className="as-panel__sub">No rules yet — add one below (the defaults match GA4&rsquo;s standard purchase schema).</p>
                    )}

                    {!showForm && (
                        <button type="button" className="as-generate-btn" style={{ marginTop: 12 }} onClick={() => setShowForm(true)}>
                            + Add mapping rule
                        </button>
                    )}

                    {showForm && (
                        <form className="as-rule-form" onSubmit={addRule}>
                            <div className="as-rule-form__row">
                                <label>dataLayer event name</label>
                                <input value={form.datalayerEvent} onChange={e => setForm(f => ({ ...f, datalayerEvent: e.target.value }))} placeholder="purchase" required />
                            </div>
                            <div className="as-rule-form__row">
                                <label>Maps to (our event name)</label>
                                <input value={form.mapsToName} onChange={e => setForm(f => ({ ...f, mapsToName: e.target.value }))} placeholder="purchase" required />
                            </div>
                            <div className="as-rule-form__row">
                                <label>Kind</label>
                                <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
                                    {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                            <div className="as-rule-form__row">
                                <label>Value path</label>
                                <input value={form.valuePath} onChange={e => setForm(f => ({ ...f, valuePath: e.target.value }))} placeholder="ecommerce.value" />
                            </div>
                            <div className="as-rule-form__row">
                                <label>Currency path</label>
                                <input value={form.currencyPath} onChange={e => setForm(f => ({ ...f, currencyPath: e.target.value }))} placeholder="ecommerce.currency" />
                            </div>
                            <div className="as-rule-form__row">
                                <label>Transaction ID path</label>
                                <input value={form.transactionIdPath} onChange={e => setForm(f => ({ ...f, transactionIdPath: e.target.value }))} placeholder="ecommerce.transaction_id" />
                            </div>
                            {error && <p className="as-error">{error}</p>}
                            <div className="as-rule-form__actions">
                                <button type="submit" className="as-generate-btn" disabled={saving}>{saving ? "Saving…" : "Save rule"}</button>
                                <button type="button" className="as-cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
                            </div>
                        </form>
                    )}
                </>
            )}
        </div>
    );
}

function TagListEditor({ items, onChange, placeholder }) {
    const [draft, setDraft] = useState("");
    const add = () => {
        const v = draft.trim();
        if (!v || items.includes(v)) return;
        onChange([...items, v]);
        setDraft("");
    };
    return (
        <div className="as-tag-editor">
            <div className="as-tag-list">
                {items.map(v => (
                    <span key={v} className="as-tag">
                        {v}
                        <button type="button" onClick={() => onChange(items.filter(x => x !== v))} aria-label={`Remove ${v}`}>&times;</button>
                    </span>
                ))}
                {!items.length && <span className="as-tag-list__empty">None yet</span>}
            </div>
            <div className="as-tag-add">
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                    placeholder={placeholder}
                />
                <button type="button" onClick={add}>Add</button>
            </div>
        </div>
    );
}

function LeadQualitySection({ domain, site, onSaved }) {
    const [enabled, setEnabled] = useState(site.lead_quality_enabled === true);
    const [requireEngaged, setRequireEngaged] = useState(site.lead_require_engaged !== false);
    const [pages, setPages] = useState(site.lead_qualifying_pages || []);
    const [events, setEvents] = useState(site.lead_qualifying_events || []);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    const authHeaders = {
        Authorization: Authentication.getToken(),
        Organisation: String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        const r = await fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
                leadQualityEnabled: enabled,
                leadRequireEngaged: requireEngaged,
                leadQualifyingPages: pages,
                leadQualifyingEvents: events,
            }),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) { setError("Could not save lead-quality settings."); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onSaved?.();
    };

    return (
        <div className="as-card">
            <div className="as-section-head">
                <h3 className="as-section-title">Lead quality</h3>
                <label className="as-toggle">
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    <span className="as-toggle__track"><span className="as-toggle__thumb" /></span>
                </label>
            </div>
            <p className="as-section-hint">
                Define what counts as a &ldquo;quality lead&rdquo;: a session qualifies when it&rsquo;s engaged
                (10s+, 2+ pages, or a click) <em>and</em> either visited one of the pages below or fired one of
                the events below.
            </p>

            {enabled && (
                <>
                    <label className="as-checkbox-row">
                        <input type="checkbox" checked={requireEngaged} onChange={e => setRequireEngaged(e.target.checked)} />
                        Require the session to be engaged
                    </label>

                    <div className="as-field-group">
                        <span className="as-label">Qualifying pages</span>
                        <TagListEditor items={pages} onChange={setPages} placeholder="/pricing" />
                    </div>

                    <div className="as-field-group">
                        <span className="as-label">Qualifying events</span>
                        <TagListEditor items={events} onChange={setEvents} placeholder="purchase" />
                    </div>

                    {error && <p className="as-error">{error}</p>}
                    <button type="button" className="as-generate-btn" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : saved ? "Saved!" : "Save lead-quality settings"}
                    </button>
                </>
            )}
        </div>
    );
}

function SnippetBox({ siteKey }) {
    const snippet = `<script src="${INGEST_URL}" data-site="${siteKey}" async defer></script>`;
    return (
        <div className="as-snippet">
            <div className="as-snippet__header">
                <span className="as-snippet__label">Embed snippet</span>
                <CopyButton text={snippet} label="Copy snippet" />
            </div>
            <pre className="as-snippet__code">{snippet}</pre>
            <p className="as-snippet__hint">
                Paste this into the <code>&lt;head&gt;</code> of every page. The script is a no-op until
                the visitor accepts <strong>statisticCookies</strong> in your Intastellar banner.
            </p>
        </div>
    );
}

export default function AnalyticsScript() {
    document.title = "Analytics Script | Settings | Intastellar Consents";

    const domains = readCachedDomains();
    const [domain, setDomain] = useState(domains[0] || "");
    const [siteData, setSiteData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(null);

    const authHeaders = {
        Authorization: Authentication.getToken(),
        Organisation: String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };

    const loadSiteKey = useCallback(async (d) => {
        if (!d) { setSiteData(null); return; }
        setLoading(true);
        setError(null);
        try {
            const r = await fetch(
                `${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(d)}`,
                { headers: authHeaders }
            );
            if (r.status === 404) { setSiteData(null); }
            else if (r.ok) { setSiteData(await r.json()); }
            else { setError("Failed to load site key."); }
        } catch { setError("Network error."); }
        finally { setLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadSiteKey(domain); }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

    const generateKey = async () => {
        if (!domain) return;
        setGenerating(true);
        setError(null);
        try {
            const r = await fetch(`${ScannerHost}/api/analytics-site`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ domain }),
            });
            if (r.ok) { setSiteData(await r.json()); }
            else { setError("Failed to generate site key."); }
        } catch { setError("Network error."); }
        finally { setGenerating(false); }
    };

    const toggleDatalayer = async (checked) => {
        setSiteData(sd => ({ ...sd, datalayer_enabled: checked }));
        const r = await fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ datalayerEnabled: checked }),
        }).catch(() => null);
        if (!r?.ok) { setSiteData(sd => ({ ...sd, datalayer_enabled: !checked })); }
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <div className="dashboard-content">
                <StickyPageTitle title="Analytics Script" />
                <div className="settings-section">
                    <div className="as-intro">
                        <p>
                            Embed this lightweight script on your website to collect first-party, consent-gated
                            analytics. The script reads your Intastellar banner cookie and only activates when the
                            visitor has accepted <strong>statisticCookies</strong> — no consent, no data.
                        </p>
                    </div>

                    {domains.length > 0 && (
                        <div className="as-domain-row">
                            <label className="as-label" htmlFor="as-domain-select">Domain</label>
                            <select
                                id="as-domain-select"
                                className="as-select"
                                value={domain}
                                onChange={e => setDomain(e.target.value)}
                            >
                                {domains.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    )}

                    {error && <p className="as-error">{error}</p>}

                    {loading && <p className="as-loading">Loading&hellip;</p>}

                    {!loading && domain && !siteData && (
                        <div className="as-empty">
                            <p>No site key yet for <strong>{domain}</strong>.</p>
                            <button
                                type="button"
                                className="as-generate-btn"
                                onClick={generateKey}
                                disabled={generating}
                            >
                                {generating ? "Generating…" : "Generate site key"}
                            </button>
                        </div>
                    )}

                    {!loading && siteData && (
                        <div className="as-card">
                            <div className="as-key-row">
                                <div>
                                    <span className="as-label">Site key</span>
                                    <span className="as-key-value">{siteData.id}</span>
                                </div>
                                <div className="as-key-actions">
                                    <span className={"as-status" + (siteData.active ? " as-status--active" : " as-status--inactive")}>
                                        {siteData.active ? "Active" : "Inactive"}
                                    </span>
                                    <CopyButton text={siteData.id} label="Copy key" />
                                </div>
                            </div>

                            <SnippetBox siteKey={siteData.id} />

                            <div className="as-privacy-note">
                                <h4 className="as-privacy-note__title">Always collected (legitimate interest — no consent needed)</h4>
                                <div className="as-privacy-note__cols">
                                    <ul className="as-privacy-note__list as-privacy-note__list--yes">
                                        <li>Page path (no query string)</li>
                                        <li>Device type (mobile / tablet / desktop)</li>
                                        <li>Country code (from IP — IP discarded)</li>
                                        <li>Consent choices made by the visitor</li>
                                    </ul>
                                    <ul className="as-privacy-note__list as-privacy-note__list--no">
                                        <li>No session ID — requests cannot be linked</li>
                                        <li>No query string (may contain PII)</li>
                                        <li>No referrer, no UTMs, no browser details</li>
                                    </ul>
                                </div>
                                <h4 className="as-privacy-note__title" style={{marginTop:"14px"}}>Additionally with statisticCookies consent</h4>
                                <div className="as-privacy-note__cols">
                                    <ul className="as-privacy-note__list as-privacy-note__list--yes">
                                        <li>Page title &amp; full URL</li>
                                        <li>Referrer hostname</li>
                                        <li>UTM parameters</li>
                                        <li>Screen dimensions, browser &amp; OS family</li>
                                        <li>Tab-scoped session ID (cleared on tab close)</li>
                                        <li>Time on page</li>
                                    </ul>
                                    <ul className="as-privacy-note__list as-privacy-note__list--no">
                                        <li>IP addresses (ever)</li>
                                        <li>Full referrer URLs</li>
                                        <li>User identifiers or email</li>
                                        <li>Cross-session or cross-device tracking</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && siteData && (
                        <IndustrySection
                            domain={domain}
                            site={siteData}
                            onSaved={() => loadSiteKey(domain)}
                        />
                    )}

                    {!loading && siteData && (
                        <DataLayerSection
                            domain={domain}
                            datalayerEnabled={siteData.datalayer_enabled === true}
                            onToggle={toggleDatalayer}
                        />
                    )}

                    {!loading && siteData && (
                        <LeadQualitySection
                            domain={domain}
                            site={siteData}
                            onSaved={() => loadSiteKey(domain)}
                        />
                    )}
                </div>
            </div>
        </>
    );
}
