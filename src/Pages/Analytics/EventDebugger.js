const { useState, useEffect, useMemo, useRef } = React;
import { ScannerHost } from "../../API/host.js";
import StatusBadge from "./components/StatusBadge.js";
import EmptyState from "./components/EmptyState.js";
import "./Analytics.css";
import "./EventDebugger.css";

/**
 * Public event debugger (/event-debugger) — no login required.
 *
 * Flow: this page generates a random debug token and hands out a link to the
 * visitor's own site with ?ia_debug=<token>. The embed script (api/a.js) then
 * tags every hit from that tab with the token, /api/a records what it got and
 * whether it stored or dropped it (api/_debug-hits.js), and this page polls
 * /api/analytics-debug for those records. The token lives in this page's URL
 * so a refresh — or sending the link to a colleague — keeps the session.
 */
const DEBUG_URL = `${ScannerHost}/api/analytics-debug`;
const POLL_MS = 2000;
const MAX_HITS = 500;
const TOKEN_RE = /^[a-z0-9]{16,40}$/i;

const VERDICTS = {
    stored:         { status: "good", label: "Stored" },
    stored_minimal: { status: "info", label: "Stored · no consent" },
    dropped:        { status: "warn", label: "Dropped" },
    rejected:       { status: "bad",  label: "Rejected" },
    error:          { status: "bad",  label: "Not saved" },
    client_error:   { status: "bad",  label: "Call error" },
};

const TYPE_LABELS = {
    event: "Event", pageview: "Pageview", clicks: "Heatmap clicks",
    experiment: "Experiment", client_error: "track() call",
};

const FILTERS = [
    { id: "events", label: "Events", match: (h) => h.hit_type === "event" || h.hit_type === "client_error" },
    { id: "all",    label: "All hits", match: () => true },
    { id: "issues", label: "Problems", match: (h) => isProblem(h) },
];

function newToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-6);
}

function readParams() {
    const q = new URLSearchParams(window.location.search);
    const token = q.get("token");
    return {
        token: token && TOKEN_RE.test(token) ? token : null,
        site: q.get("site") || "",
        expect: (q.get("expect") || "").split(",").map((s) => s.trim()).filter(Boolean),
    };
}

function writeParams(token, expect) {
    const q = new URLSearchParams();
    if (token) q.set("token", token);
    if (expect.length) q.set("expect", expect.join(","));
    window.history.replaceState(null, "", window.location.pathname + (q.toString() ? "?" + q : ""));
}

function warningsOf(hit) {
    return Array.isArray(hit.payload?.dw) ? hit.payload.dw : [];
}

function isProblem(hit) {
    return !["stored", "stored_minimal"].includes(hit.verdict) || warningsOf(hit).length > 0;
}

function pathOf(hit) {
    const u = hit.payload?.u;
    if (!u) return "";
    try { return /^https?:\/\//i.test(u) ? new URL(u).pathname : u; } catch { return u; }
}

function buildDebugLink(rawUrl, token) {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed);
        url.searchParams.set("ia_debug", token);
        return url.toString();
    } catch {
        return null;
    }
}

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useDebugHits(token) {
    const [hits, setHits] = useState([]);
    const [error, setError] = useState(null);
    const afterRef = useRef(0);

    useEffect(() => {
        setHits([]);
        setError(null);
        afterRef.current = 0;
        if (!token) return;

        let cancelled = false;
        let timer = null;
        const poll = async () => {
            if (document.visibilityState === "visible") {
                try {
                    const res = await fetch(`${DEBUG_URL}?token=${token}&after=${afterRef.current}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const { hits: fresh } = await res.json();
                    if (cancelled) return;
                    setError(null);
                    if (fresh.length) {
                        afterRef.current = fresh[fresh.length - 1].id;
                        setHits((prev) => [...fresh.slice().reverse(), ...prev].slice(0, MAX_HITS));
                    }
                } catch (err) {
                    if (!cancelled) setError(err.message || "Request failed");
                }
            }
            if (!cancelled) timer = setTimeout(poll, POLL_MS);
        };
        poll();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [token]);

    return [hits, error, () => setHits([])];
}

function HitRow({ hit }) {
    const [open, setOpen] = useState(false);
    const verdict = VERDICTS[hit.verdict] || { status: "neutral", label: hit.verdict };
    const warnings = warningsOf(hit);
    const p = hit.payload || {};
    const consent = p.cs != null
        ? [["Statistics", p.cs], ["Functional", p.cf], ["Marketing", p.ca]]
        : null;

    return (
        <li className={"ed-hit" + (isProblem(hit) ? " ed-hit--problem" : "")}>
            <button type="button" className="ed-hit__summary" onClick={() => setOpen(!open)} aria-expanded={open}>
                <span className="ed-hit__time">{formatTime(hit.received_at)}</span>
                <span className="ed-hit__type">{TYPE_LABELS[hit.hit_type] || hit.hit_type}</span>
                <span className="ed-hit__name">
                    {hit.event_name || pathOf(hit) || "—"}
                    {hit.event_name && pathOf(hit) && <span className="ed-hit__path">{pathOf(hit)}</span>}
                </span>
                <span className="ed-hit__badges">
                    {warnings.length > 0 && (
                        <StatusBadge status="warn" label={warnings.length === 1 ? "1 warning" : `${warnings.length} warnings`} />
                    )}
                    <StatusBadge status={verdict.status} label={verdict.label} />
                </span>
            </button>
            {(hit.reason || warnings.length > 0) && (
                <div className="ed-hit__notes">
                    {hit.reason && <p className="ed-hit__reason">{hit.reason}</p>}
                    {warnings.length > 0 && (
                        <ul className="ed-hit__warnings">
                            {warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    )}
                </div>
            )}
            {open && (
                <div className="ed-hit__detail">
                    <dl className="ed-hit__facts">
                        <div><dt>Site key</dt><dd>{hit.site_id || "—"}</dd></div>
                        <div><dt>Host</dt><dd>{p.h || "—"}</dd></div>
                        <div><dt>HTTP status</dt><dd>{hit.status}</dd></div>
                        {p.v != null && <div><dt>Value</dt><dd>{String(p.v)} {p.cur || ""}</dd></div>}
                        {p.src && <div><dt>Source</dt><dd>{p.src === "datalayer" ? "dataLayer rule" : "track() call"}</dd></div>}
                        {consent && (
                            <div><dt>Consent</dt><dd>{consent.map(([k, v]) => `${k} ${v ? "✓" : "✗"}`).join(" · ")}</dd></div>
                        )}
                    </dl>
                    <pre className="ed-hit__payload">{JSON.stringify(p, null, 2)}</pre>
                </div>
            )}
        </li>
    );
}

export default function EventDebugger() {
    const initial = useMemo(readParams, []);
    const [token, setToken] = useState(initial.token);
    const [expected, setExpected] = useState(initial.expect);
    const [expectDraft, setExpectDraft] = useState("");
    const [siteUrl, setSiteUrl] = useState(initial.site);
    const [filter, setFilter] = useState("events");
    const [query, setQuery] = useState("");
    const [copied, setCopied] = useState(false);
    const [hits, error, clearHits] = useDebugHits(token);

    useEffect(() => { document.title = "Event Debugger | Intastellar Analytics"; }, []);
    useEffect(() => { writeParams(token, expected); }, [token, expected]);

    const ensureToken = () => {
        if (token) return token;
        const t = newToken();
        setToken(t);
        return t;
    };

    const debugLink = token ? buildDebugLink(siteUrl, token) : null;

    const openSite = (e) => {
        e.preventDefault();
        const link = buildDebugLink(siteUrl, ensureToken());
        if (link) window.open(link, "_blank", "noopener");
    };

    const copyLink = async () => {
        if (!debugLink) return;
        try {
            await navigator.clipboard.writeText(debugLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — the link is visible to copy by hand */ }
    };

    const addExpected = (e) => {
        e.preventDefault();
        const names = expectDraft.split(",").map((s) => s.trim()).filter(Boolean);
        if (names.length) setExpected([...new Set([...expected, ...names])]);
        setExpectDraft("");
    };

    const counts = useMemo(() => ({
        total: hits.length,
        stored: hits.filter((h) => h.verdict === "stored" || h.verdict === "stored_minimal").length,
        noConsent: hits.filter((h) => h.verdict === "stored_minimal").length,
        problems: hits.filter(isProblem).length,
    }), [hits]);

    const seen = useMemo(() => {
        const map = {};
        for (const h of hits) {
            if (h.hit_type === "event" && h.event_name && !map[h.event_name]) map[h.event_name] = h;
        }
        return map;
    }, [hits]);

    const visible = useMemo(() => {
        const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
        const q = query.trim().toLowerCase();
        return hits.filter((h) => f.match(h) && (!q
            || (h.event_name || "").toLowerCase().includes(q)
            || pathOf(h).toLowerCase().includes(q)));
    }, [hits, filter, query]);

    return (
        <div className="ed-page">
            <header className="ed-header">
                <img src="https://www.intastellarsolutions.com/assets/logos/intastellar-new-planet.svg" alt="Intastellar" className="ed-header__logo" />
                <div>
                    <h1 className="ed-header__title">Event Debugger</h1>
                    <p className="ed-header__lede">
                        Check whether your Intastellar Analytics events fire, and why one was stored or dropped.
                        Only hits from the browser tab you open below appear here.
                    </p>
                </div>
            </header>

            <div className="ed-setup">
                <section className="sa-panel">
                    <h2 className="sa-panel__title">1 · Open your site in debug mode</h2>
                    <form className="ed-inline-form" onSubmit={openSite}>
                        <input
                            className="ed-input"
                            type="text"
                            inputMode="url"
                            placeholder="https://www.example.com/checkout"
                            value={siteUrl}
                            onChange={(e) => setSiteUrl(e.target.value)}
                            aria-label="Page on your website"
                        />
                        <button type="submit" className="ed-btn ed-btn--primary" disabled={!siteUrl.trim()}>Open in debug mode</button>
                    </form>
                    {debugLink && (
                        <div className="ed-link">
                            <code className="ed-link__url">{debugLink}</code>
                            <button type="button" className="ed-btn" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
                        </div>
                    )}
                    <p className="ed-hint">
                        Debug mode stays on for that tab while you navigate. To end it, close the tab or add <code>?ia_debug=off</code> to any URL.
                        Hits are kept for 24 hours.
                        {token && <> Session <code>{token}</code> · <button type="button" className="ed-text-btn" onClick={() => { setToken(newToken()); }}>start a new session</button></>}
                    </p>
                </section>

                <section className="sa-panel">
                    <h2 className="sa-panel__title">2 · Events you expect (optional)</h2>
                    <form className="ed-inline-form" onSubmit={addExpected}>
                        <input
                            className="ed-input"
                            type="text"
                            placeholder="purchase, signup, add_to_cart"
                            value={expectDraft}
                            onChange={(e) => setExpectDraft(e.target.value)}
                            aria-label="Expected event names, comma separated"
                        />
                        <button type="submit" className="ed-btn" disabled={!expectDraft.trim()}>Add</button>
                    </form>
                    {expected.length > 0 ? (
                        <ul className="ed-expected">
                            {expected.map((name) => {
                                const hit = seen[name];
                                const verdict = hit && (VERDICTS[hit.verdict] || { status: "neutral", label: hit.verdict });
                                return (
                                    <li key={name} className="ed-expected__item">
                                        <code>{name}</code>
                                        {hit
                                            ? <StatusBadge status={verdict.status} label={`${verdict.label} · ${formatTime(hit.received_at)}`} />
                                            : <StatusBadge status="neutral" label="Not seen yet" />}
                                        <button type="button" className="ed-text-btn" aria-label={`Remove ${name}`}
                                            onClick={() => setExpected(expected.filter((n) => n !== name))}>×</button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="ed-hint">List the event names your setup should send, then trigger them on your site and tick them off here.</p>
                    )}
                </section>
            </div>

            <div className="ed-stats">
                <div className="ed-stat"><span className="ed-stat__value">{counts.total}</span><span className="ed-stat__label">Hits received</span></div>
                <div className="ed-stat"><span className="ed-stat__value">{counts.stored}</span><span className="ed-stat__label">Stored</span></div>
                <div className="ed-stat"><span className="ed-stat__value">{counts.noConsent}</span><span className="ed-stat__label">Stored without consent</span></div>
                <div className={"ed-stat" + (counts.problems ? " ed-stat--problem" : "")}><span className="ed-stat__value">{counts.problems}</span><span className="ed-stat__label">Dropped, rejected or warned</span></div>
            </div>

            <section className="sa-panel ed-feed">
                <div className="ed-feed__head">
                    <h2 className="sa-panel__title">
                        Live hits
                        {token && !error && <span className="ed-live" aria-label="Listening for hits" />}
                    </h2>
                    <div className="ed-feed__controls">
                        <div className="ed-tabs" role="tablist">
                            {FILTERS.map((f) => (
                                <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
                                    className={"ed-tab" + (filter === f.id ? " ed-tab--active" : "")}
                                    onClick={() => setFilter(f.id)}>{f.label}</button>
                            ))}
                        </div>
                        <input className="ed-input ed-input--search" type="search" placeholder="Filter by name or path"
                            value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter hits" />
                        {hits.length > 0 && <button type="button" className="ed-btn" onClick={clearHits}>Clear</button>}
                    </div>
                </div>

                {error && <p className="ed-error">Couldn't reach the debugger API ({error}). Retrying…</p>}

                {!token ? (
                    <EmptyState title="No debug session yet"
                        message="Enter a page of your website above and open it in debug mode to start listening." />
                ) : hits.length === 0 ? (
                    <div className="ed-waiting">
                        <EmptyState title="Waiting for hits…"
                            message="Open your site with the debug link above. A pageview should show up within a few seconds." />
                        <ul className="ed-checklist">
                            <li>The Intastellar Analytics script is on the page with a <code>data-site="…"</code> attribute.</li>
                            <li>The page was opened through the debug link, in this browser. The browser console shows <code>[Intastellar Analytics] Debug mode on</code>.</li>
                            <li>Custom events call <code>window.intaAnalytics.track('event_name', {"{ value: 49.99, currency: 'EUR' }"})</code>, after the script has loaded.</li>
                            <li>Ad blockers or a strict CSP (<code>connect-src</code>) can block requests to <code>analytics.consentsmanagement.com</code>.</li>
                        </ul>
                    </div>
                ) : visible.length === 0 ? (
                    <EmptyState title="Nothing matches this filter" message={`${hits.length} hit(s) received. Try “All hits”.`} />
                ) : (
                    <ul className="ed-hits">
                        {visible.map((h) => <HitRow key={h.id} hit={h} />)}
                    </ul>
                )}
            </section>

            <footer className="ed-footer">
                <p>Powered by Intastellar Analytics · &copy; {new Date().getFullYear()} Intastellar Solutions, International</p>
            </footer>
        </div>
    );
}
