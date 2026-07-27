const { useState, useEffect, useContext, useMemo, useCallback } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import SideNav from "../../Components/Header/SideNav.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { analyticsLinks } from "./AnalyticsLinks.js";
import "./Analytics.css";

const INGEST_URL = "https://analytics.consentsmanagement.com/api/a";
const RANGES = [
    { label: "7 days",  days: 7  },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 },
];

function authHeaders() {
    return {
        Authorization: Authentication.getToken(),
        Organisation:  String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };
}

function isoDate(offsetDays = 0) {
    return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
}

// ── small shared components ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, variant }) {
    return (
        <div className={"sa-kpi" + (variant ? " sa-kpi--" + variant : "")}>
            <span className="sa-kpi__label">{label}</span>
            <span className="sa-kpi__value">{value}</span>
            {sub && <span className="sa-kpi__sub">{sub}</span>}
        </div>
    );
}

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const copy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    }, [text]);
    return (
        <button
            type="button"
            className={"sa-copy-btn" + (copied ? " sa-copy-btn--done" : "")}
            onClick={copy}
        >
            {copied ? "Copied!" : "Copy snippet"}
        </button>
    );
}

function BarSegment({ pct, color, title }) {
    return (
        <div
            className="sa-bar__seg"
            style={{ width: pct + "%", background: color }}
            title={title}
        />
    );
}

function ConsentBar({ label, yes, no }) {
    const total = yes + no;
    if (!total) return null;
    const pct = Math.round((yes / total) * 100);
    return (
        <div className="sa-consent-row">
            <span className="sa-consent-row__label">{label}</span>
            <div className="sa-bar">
                <BarSegment pct={pct}       color="rgba(74,222,128,0.75)" title={`Yes: ${yes}`} />
                <BarSegment pct={100 - pct} color="rgba(239,68,68,0.3)"   title={`No: ${no}`}  />
            </div>
            <span className="sa-consent-row__pct">{pct}%</span>
        </div>
    );
}

function MiniBar({ value, max, color = "rgba(192,159,83,0.7)" }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="sa-mini-bar">
            <div className="sa-mini-bar__fill" style={{ width: pct + "%", background: color }} />
        </div>
    );
}

// ── Daily stacked bar chart (SVG) ─────────────────────────────────────────────
function DailyChart({ daily }) {
    const W = 600, H = 140, PAD = { t: 8, r: 8, b: 28, l: 36 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">No data for this period</div>;

    const maxVal = Math.max(...daily.map(d => d.minimal + d.full), 1);
    const barW   = Math.max(2, Math.floor(cW / daily.length) - 2);

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

    return (
        <div className="sa-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                {/* Y grid */}
                {yTicks.map((v, i) => {
                    const y = PAD.t + cH - (v / maxVal) * cH;
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.l - 4} y={y + 4} textAnchor="end"
                                fontSize="9" fill="rgba(160,160,160,0.6)">{v}</text>
                        </g>
                    );
                })}

                {/* Bars */}
                {daily.map((d, i) => {
                    const x  = PAD.l + (i / daily.length) * cW + (cW / daily.length - barW) / 2;
                    const hF = (d.full    / maxVal) * cH;
                    const hM = (d.minimal / maxVal) * cH;
                    return (
                        <g key={d.date}>
                            {/* full (green) on top of minimal (amber) */}
                            <rect x={x} y={PAD.t + cH - hM - hF} width={barW} height={hF}
                                fill="rgba(74,222,128,0.75)" rx="1" />
                            <rect x={x} y={PAD.t + cH - hM}      width={barW} height={hM}
                                fill="rgba(192,159,83,0.55)"  rx="1" />
                        </g>
                    );
                })}

                {/* X labels — show first, middle, last */}
                {[0, Math.floor(daily.length / 2), daily.length - 1]
                    .filter((v, i, a) => a.indexOf(v) === i && v < daily.length)
                    .map(i => {
                        const d = daily[i];
                        const x = PAD.l + (i / daily.length) * cW + (cW / daily.length) / 2;
                        const label = d.date.slice(5); // MM-DD
                        return (
                            <text key={d.date} x={x} y={H - PAD.b + 14}
                                textAnchor="middle" fontSize="9" fill="rgba(160,160,160,0.7)">
                                {label}
                            </text>
                        );
                    })
                }
            </svg>
            <div className="sa-chart__legend">
                <span className="sa-chart__legend-dot sa-chart__legend-dot--full" />
                <span>With consent</span>
                <span className="sa-chart__legend-dot sa-chart__legend-dot--minimal" />
                <span>No consent (minimal)</span>
            </div>
        </div>
    );
}

// ── Setup card (shown when no site key or no data yet) ────────────────────────
function SetupCard({ domain, onKeyGenerated }) {
    const [siteKey, setSiteKey] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        if (!domain) { setLoading(false); return; }
        fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`, {
            headers: authHeaders(),
        }).then(async r => {
            if (r.ok) { const d = await r.json(); setSiteKey(d.id); }
        }).catch(() => {}).finally(() => setLoading(false));
    }, [domain]);

    const generate = async () => {
        setGenerating(true);
        const r = await fetch(`${ScannerHost}/api/analytics-site`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain }),
        }).catch(() => null);
        if (r?.ok) {
            const d = await r.json();
            setSiteKey(d.id);
            onKeyGenerated?.();
        }
        setGenerating(false);
    };

    const snippet = siteKey
        ? `<script src="${INGEST_URL}" data-site="${siteKey}" async defer></script>`
        : null;

    return (
        <div className="sa-setup">
            <div className="sa-setup__icon" aria-hidden="true">📡</div>
            <h3 className="sa-setup__title">No data yet for <strong>{domain}</strong></h3>
            <p className="sa-setup__body">
                Embed the script below on every page of your site. The script reads the
                Intastellar consent cookie and only collects full analytics when the visitor
                accepts <em>statisticCookies</em>. Minimal data (page path + consent choice)
                is always recorded.
            </p>

            {loading && <p className="sa-setup__loading">Loading&hellip;</p>}

            {!loading && !siteKey && (
                <button
                    type="button"
                    className="sa-setup__gen-btn"
                    onClick={generate}
                    disabled={generating}
                >
                    {generating ? "Generating…" : "Generate site key"}
                </button>
            )}

            {!loading && siteKey && (
                <div className="sa-setup__snippet-wrap">
                    <div className="sa-setup__snippet-header">
                        <span className="sa-setup__snippet-label">Embed snippet</span>
                        <CopyButton text={snippet} />
                    </div>
                    <pre className="sa-setup__snippet">{snippet}</pre>
                    <p className="sa-setup__hint">
                        Paste into the <code>&lt;head&gt;</code> of every page. Data will appear
                        here within a few minutes of the first visitor.
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SiteAnalytics() {
    document.title = "Site Analytics | Intastellar Consents";

    const { handle, id } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [rangeDays, setRangeDays] = useState(30);
    const [data,      setData]      = useState(null);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState(null);
    const [tick,      setTick]      = useState(0); // force refetch after key generation

    const fromDate = useMemo(() => isoDate(rangeDays), [rangeDays]);
    const toDate   = useMemo(() => isoDate(0),         []);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, from: fromDate, to: toDate }).toString();
        fetch(`${ScannerHost}/api/analytics-report?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load analytics data."))
            .finally(() => setLoading(false));
    }, [domain, fromDate, toDate, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    const maxPageViews  = useMemo(() => Math.max(...(data?.topPages  || []).map(p => p.views),  1), [data]);
    const maxCountry    = useMemo(() => Math.max(...(data?.countries || []).map(c => c.events), 1), [data]);
    const maxBrowser    = useMemo(() => Math.max(...(data?.browsers  || []).map(b => b.events), 1), [data]);
    const maxUtm        = useMemo(() => Math.max(...(data?.utmSources|| []).map(u => u.events), 1), [data]);

    const deviceTotal   = useMemo(() => (data?.devices  || []).reduce((s, d) => s + d.events, 0), [data]);

    const showSetup = !loading && data && (data.noSiteKey || data.noData);
    const showData  = !loading && data && !data.noSiteKey && !data.noData;

    return (
        <>
            <SideNav links={analyticsLinks} title="Analytics" />
            <div className="dashboard-content">
                <StickyPageTitle title="Site Analytics" />

                <div className="sa-page">
                    {/* ── Controls ── */}
                    <div className="sa-controls">
                        <div className="sa-range-group">
                            {RANGES.map(r => (
                                <button
                                    key={r.days}
                                    type="button"
                                    className={"sa-range-btn" + (rangeDays === r.days ? " sa-range-btn--active" : "")}
                                    onClick={() => setRangeDays(r.days)}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        {data && !data.noSiteKey && (
                            <span className="sa-site-key-badge">
                                Site key: <code>{data.siteId}</code>
                            </span>
                        )}
                    </div>

                    {/* ── States ── */}
                    {!domain && (
                        <p className="sa-notice">Select a specific domain in the header to view analytics.</p>
                    )}
                    {domain && loading && (
                        <p className="sa-notice">Loading&hellip;</p>
                    )}
                    {domain && error && (
                        <p className="sa-notice sa-notice--error">{error}</p>
                    )}

                    {/* ── Setup / empty state ── */}
                    {domain && showSetup && (
                        <SetupCard
                            domain={domain}
                            onKeyGenerated={() => setTick(t => t + 1)}
                        />
                    )}

                    {/* ── Data ── */}
                    {showData && <>

                        {/* KPI row */}
                        <div className="sa-kpi-row">
                            <KpiCard
                                label="Total events"
                                value={data.totals.total.toLocaleString("de-DE")}
                                sub={`${data.totals.minimal.toLocaleString("de-DE")} minimal · ${data.totals.full.toLocaleString("de-DE")} full`}
                            />
                            <KpiCard
                                label="Unique sessions"
                                value={data.totals.uniqueSessions.toLocaleString("de-DE")}
                                sub="consent-gated sessions only"
                            />
                            <KpiCard
                                label="Consent rate"
                                value={data.totals.consentRate + "%"}
                                sub="statisticCookies accepted"
                                variant={data.totals.consentRate < 20 ? "warn" : null}
                            />
                            <KpiCard
                                label="Countries"
                                value={data.countries.length}
                                sub={data.countries[0] ? `Top: ${data.countries[0].code}` : null}
                            />
                        </div>

                        {/* Daily chart */}
                        <div className="sa-section">
                            <h3 className="sa-section__title">Events per day</h3>
                            <DailyChart daily={data.daily} />
                        </div>

                        {/* Two-column: top pages + consent */}
                        <div className="sa-two-col">
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Top pages</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Page</th>
                                            <th className="sa-table__num">Views</th>
                                            <th className="sa-table__num">Sessions</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topPages.map(p => (
                                            <tr key={p.pathname}>
                                                <td className="sa-table__path" title={p.pathname}>{p.pathname}</td>
                                                <td className="sa-table__num">{p.views.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__num">{p.sessions.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={p.views} max={maxPageViews} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Consent choices</h3>
                                <p className="sa-panel__sub">Recorded on every visit, with or without consent</p>
                                <div className="sa-consent-list">
                                    <ConsentBar
                                        label="Statistics"
                                        yes={data.consent.stat.yes}
                                        no={data.consent.stat.no}
                                    />
                                    <ConsentBar
                                        label="Functional"
                                        yes={data.consent.func.yes}
                                        no={data.consent.func.no}
                                    />
                                    <ConsentBar
                                        label="Advertising"
                                        yes={data.consent.adv.yes}
                                        no={data.consent.adv.no}
                                    />
                                </div>

                                {/* Device split */}
                                <h3 className="sa-panel__title" style={{marginTop:"20px"}}>Devices</h3>
                                {data.devices.map(d => (
                                    <div key={d.type} className="sa-consent-row">
                                        <span className="sa-consent-row__label" style={{textTransform:"capitalize"}}>{d.type}</span>
                                        <div className="sa-bar">
                                            <BarSegment
                                                pct={deviceTotal > 0 ? Math.round((d.events / deviceTotal) * 100) : 0}
                                                color="rgba(192,159,83,0.65)"
                                                title={d.events + " events"}
                                            />
                                        </div>
                                        <span className="sa-consent-row__pct">
                                            {deviceTotal > 0 ? Math.round((d.events / deviceTotal) * 100) : 0}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Two-column: countries + browsers */}
                        <div className="sa-two-col">
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Countries</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Country</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.countries.map(c => (
                                            <tr key={c.code}>
                                                <td>{c.code}</td>
                                                <td className="sa-table__num">{c.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={c.events} max={maxCountry} color="rgba(99,179,237,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Browsers <span className="sa-panel__consent-note">full events only</span></h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Browser</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.browsers.map(b => (
                                            <tr key={b.name}>
                                                <td>{b.name}</td>
                                                <td className="sa-table__num">{b.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={b.events} max={maxBrowser} color="rgba(167,139,250,0.65)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* UTM sources (full events only) */}
                        {data.utmSources.length > 0 && (
                            <div className="sa-section">
                                <h3 className="sa-section__title">
                                    UTM sources
                                    <span className="sa-panel__consent-note">full events only</span>
                                </h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Source</th>
                                            <th>Medium</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.utmSources.map((u, i) => (
                                            <tr key={i}>
                                                <td>{u.source || "—"}</td>
                                                <td>{u.medium || "—"}</td>
                                                <td className="sa-table__num">{u.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={u.events} max={maxUtm} color="rgba(251,146,60,0.65)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                    </>}
                </div>
            </div>
        </>
    );
}
