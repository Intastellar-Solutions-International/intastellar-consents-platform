const { useState, useEffect, useMemo, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
import {
    analyticsAudiencePath, analyticsAcquisitionPath,
} from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import {
    authHeaders, KpiCard, MiniBar, useAnalyticsPage,
} from "./_shared.js";
import {
    IconBarChart,
    IconUsers,
    IconShieldCheck,
    IconGlobe,
    IconTrendingUp,
    IconDocument,
    IconRadio,
    IconTarget,
    IconMegaphone,
} from "./Icons.js";
import "./Analytics.css";

const LIVE_URL = `${ScannerHost}/api/analytics-live`;
const LIVE_INTERVAL = 30;

function timeAgo(isoString) {
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (diff < 60) return diff + "s";
    return Math.floor(diff / 60) + "m";
}


function LivePanel({ domain, className, engagedUsers }) {
    const [data,      setData]    = useState(null);
    const [open,      setOpen]    = useState(true);
    const [countdown, setCountdown] = useState(LIVE_INTERVAL);

    const fetchLive = useCallback(async () => {
        if (!domain) return;
        try {
            const r = await fetch(
                `${LIVE_URL}?domain=${encodeURIComponent(domain)}`,
                { headers: authHeaders() }
            );
            if (r.ok) setData(await r.json());
        } catch {}
        setCountdown(LIVE_INTERVAL);
    }, [domain]);

    useEffect(() => {
        fetchLive();
        const poll = setInterval(fetchLive, LIVE_INTERVAL * 1000);
        return () => clearInterval(poll);
    }, [fetchLive]);

    useEffect(() => {
        const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
        return () => clearInterval(tick);
    }, []);

    if (!domain || !data || data.noSiteKey) return null;

    const maxBar = Math.max(...(data.perMinute || [1]), 1);

    return (
        <div className={"sa-live" + (className ? " " + className : "")}>
            <div className="sa-live__header" onClick={() => setOpen(o => !o)} role="button" aria-expanded={open}>
                <div className="sa-live__title">
                    <span className="sa-live__dot" />
                    <span className="sa-live__label">Live</span>
                    <span className="sa-live__window">— last 30 min</span>
                </div>
                <div className="sa-live__right">
                    <span className="sa-live__countdown">
                        {open ? `Refreshes in ${countdown}s` : `${data.total} events`}
                    </span>
                    <button type="button" className="sa-live__toggle" aria-label={open ? "Collapse" : "Expand"}>
                        {open ? "▲" : "▼"}
                    </button>
                </div>
            </div>

            {open && (
                <div className="sa-live__body">
                    <div className="sa-live__kpis">
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Active users</span>
                            <span className="sa-live__kpi-value">{(engagedUsers ?? 0).toLocaleString("de-DE")}</span>
                            <span className="sa-live__kpi-sub">engaged in selected period</span>
                        </div>
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Events</span>
                            <span className="sa-live__kpi-value">{data.total.toLocaleString("de-DE")}</span>
                            <span className="sa-live__kpi-sub">{data.minimal} minimal · {data.full} full</span>
                        </div>
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Sessions</span>
                            <span className="sa-live__kpi-value">{data.sessions.toLocaleString("de-DE")}</span>
                            <span className="sa-live__kpi-sub">last 30 min · consent-gated only</span>
                        </div>
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Consent rate</span>
                            <span className="sa-live__kpi-value">
                                {data.total > 0 ? Math.round((data.full / data.total) * 100) : 0}%
                            </span>
                            <span className="sa-live__kpi-sub">in this window</span>
                        </div>
                    </div>

                    <div className="sa-live__sparkline">
                        <span className="sa-live__spark-label">Events per minute</span>
                        <div className="sa-live__spark-bars">
                            {(data.perMinute || []).map((v, i) => (
                                <div
                                    key={i}
                                    className={"sa-live__spark-bar" + (i === 29 ? " sa-live__spark-bar--last" : "")}
                                    style={{ height: Math.max(4, Math.round((v / maxBar) * 48)) + "px" }}
                                    title={`${v} event${v !== 1 ? "s" : ""}`}
                                />
                            ))}
                        </div>
                        <div className="sa-live__spark-times">
                            <span>−30m</span>
                            <span>−15m</span>
                            <span>now</span>
                        </div>
                    </div>

                    <div className="sa-live__bottom">
                        <div>
                            <p className="sa-live__section-title">Top active pages</p>
                            <table className="sa-table">
                                <tbody>
                                    {(data.topPages || []).map(p => (
                                        <tr key={p.pathname}>
                                            <td className="sa-table__path" title={p.pathname}>{p.pathname}</td>
                                            <td className="sa-table__num">{p.views}</td>
                                        </tr>
                                    ))}
                                    {!data.topPages?.length && (
                                        <tr><td colSpan={2} style={{color:"rgba(130,130,130,0.55)",fontSize:"0.8rem"}}>No events yet</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div>
                            <p className="sa-live__section-title">Recent events</p>
                            <div className="sa-live__feed">
                                {(data.recent || []).slice(0, 10).map((e, i) => (
                                    <div key={i} className="sa-live__event">
                                        <span className="sa-live__event-path" title={e.host ? `${e.host}${e.path}` : e.path}>
                                            {e.host && e.host !== domain ? `${e.host}` : ""}{e.path}
                                        </span>
                                        <div className="sa-live__event-meta">
                                            {e.country && <span className="sa-live__event-flag">{e.country}</span>}
                                            <span className={"sa-live__event-level sa-live__event-level--" + e.level}>
                                                {e.level}
                                            </span>
                                            <span className="sa-live__event-time">{timeAgo(e.at)}</span>
                                        </div>
                                    </div>
                                ))}
                                {!data.recent?.length && (
                                    <p style={{color:"rgba(130,130,130,0.55)",fontSize:"0.8rem",margin:0}}>No events yet</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {data.topHosts && data.topHosts.length > 1 && (
                        <div className="sa-live__hosts">
                            <p className="sa-live__section-title">
                                Hosts serving this site key
                                <span className="sa-panel__consent-note"> — cross-site traffic detected</span>
                            </p>
                            <table className="sa-table">
                                <tbody>
                                    {data.topHosts.map(h => (
                                        <tr key={h.host}>
                                            <td className="sa-table__path" title={h.host}>{h.host}</td>
                                            <td className="sa-table__num">{h.views}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const INGEST_URL = "https://analytics.consentsmanagement.com/api/a";

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

function DailyChart({ daily }) {
    const W = 600, H = 160, PAD = { t: 10, r: 8, b: 28, l: 36 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">No data for this period</div>;

    const maxVal = Math.max(...daily.map(d => d.minimal + d.full), 1);
    const barW   = Math.max(2, Math.floor(cW / daily.length) - 2);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

    return (
        <div className="sa-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
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

                {daily.map((d, i) => {
                    const x  = PAD.l + (i / daily.length) * cW + (cW / daily.length - barW) / 2;
                    const hF = (d.full    / maxVal) * cH;
                    const hM = (d.minimal / maxVal) * cH;
                    return (
                        <g key={d.date}>
                            <rect x={x} y={PAD.t + cH - hM - hF} width={barW} height={hF}
                                fill="rgba(74,222,128,0.75)" rx="1" />
                            <rect x={x} y={PAD.t + cH - hM}      width={barW} height={hM}
                                fill="rgba(192,159,83,0.55)"  rx="1" />
                        </g>
                    );
                })}

                {[0, Math.floor(daily.length / 2), daily.length - 1]
                    .filter((v, i, a) => a.indexOf(v) === i && v < daily.length)
                    .map(i => {
                        const d = daily[i];
                        const x = PAD.l + (i / daily.length) * cW + (cW / daily.length) / 2;
                        return (
                            <text key={d.date} x={x} y={H - PAD.b + 14}
                                textAnchor="middle" fontSize="9" fill="rgba(160,160,160,0.7)">
                                {d.date.slice(5)}
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

function SetupCard({ domain, onKeyGenerated }) {
    const [siteKey,    setSiteKey]    = useState(null);
    const [loading,    setLoading]    = useState(true);
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
            <div className="sa-setup__icon"><IconRadio /></div>
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

// ── Main overview page ────────────────────────────────────────────────────────
export default function SiteAnalytics() {
    document.title = "Site Analytics | Intastellar Consents";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
        tick, setTick, data, loading, error, showSetup, showData,
    } = useAnalyticsPage();

    const maxPageViews = useMemo(() => Math.max(...(data?.topPages  || []).map(p => p.views),  1), [data]);
    const maxCountry   = useMemo(() => Math.max(...(data?.countries || []).map(c => c.events), 1), [data]);
    const maxReferrer  = useMemo(() => Math.max(...(data?.referrers || []).map(r => r.events), 1), [data]);
    const deviceTotal  = useMemo(() => (data?.devices || []).reduce((s, d) => s + d.events, 0), [data]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Site Analytics"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {data && !data.noSiteKey && (
                        <div className="sa-meta-row">
                            <span className="sa-site-key-badge">
                                Site key: <code>{data.siteId}</code>
                            </span>
                        </div>
                    )}

                    {!domain && (
                        <p className="sa-notice">Select a specific domain in the header to view analytics.</p>
                    )}
                    {domain && loading && (
                        <p className="sa-notice">Loading&hellip;</p>
                    )}
                    {domain && error && (
                        <p className="sa-notice sa-notice--error">{error}</p>
                    )}

                    {domain && showSetup && (
                        <SetupCard
                            domain={domain}
                            onKeyGenerated={() => setTick(t => t + 1)}
                        />
                    )}

                    {showData && (
                        <div className={"sa-dashboard-grid sa-dashboard-grid--overview" + (data.totals.qualityLeads !== null ? " sa-dashboard-grid--leads" : "")}>

                            <KpiCard className="sa-ga-kpi0"
                                icon={<IconRadio />}
                                label="Active users"
                                value={data.totals.engagedUsers.toLocaleString("de-DE")}
                                sub="engaged: 10s+, clicked, or 2+ pages"
                                variant="live"
                            />
                            <KpiCard className="sa-ga-kpi1"
                                icon={<IconBarChart />}
                                label="Total events"
                                value={data.totals.total.toLocaleString("de-DE")}
                                sub={`${data.totals.minimal.toLocaleString("de-DE")} minimal · ${data.totals.full.toLocaleString("de-DE")} full`}
                            />
                            <KpiCard className="sa-ga-kpi2"
                                icon={<IconUsers />}
                                label="Unique sessions"
                                value={data.totals.uniqueSessions.toLocaleString("de-DE")}
                                sub="consent-gated sessions only"
                            />
                            <KpiCard className="sa-ga-kpi3"
                                icon={<IconShieldCheck />}
                                label="Consent rate"
                                value={data.totals.consentRate + "%"}
                                sub="statisticCookies accepted"
                                variant={data.totals.consentRate < 20 ? "warn" : null}
                            />
                            <KpiCard className="sa-ga-kpi4"
                                icon={<IconGlobe />}
                                label="Countries"
                                value={data.countries.length}
                                sub={data.countries[0] ? `Top: ${data.countries[0].code}` : null}
                            />
                            {showData && data.totals.qualityLeads !== null && (
                                <KpiCard
                                    icon={<IconTarget />}
                                    label="Quality leads"
                                    value={data.totals.qualityLeads.toLocaleString("de-DE")}
                                    sub="engaged + page/event match (see Settings)"
                                    variant="live"
                                    className="sa-ga-kpi5"
                                />
                            )}

                            <div className="sa-chart-section sa-ga-chart">
                                <h3 className="sa-chart-section__title">
                                    <IconTrendingUp className="sa-icon" /> Events per day
                                </h3>
                                <DailyChart daily={data.daily} />
                            </div>

                            <LivePanel domain={domain} className="sa-ga-live" engagedUsers={data.totals.engagedUsers} />

                            <div className="sa-panel sa-ga-map">
                                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Active users by country</h3>
                                {data.countries.length > 0
                                    ? <AnalyticsWorldMap countries={data.countries} />
                                    : <p className="sa-notice">No geographic data for this period.</p>}
                            </div>

                            <div className="sa-panel sa-ga-countries">
                                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Top countries</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Country</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.countries.slice(0, 6).map(c => (
                                            <tr key={c.code}>
                                                <td>{c.code}</td>
                                                <td className="sa-table__num">{c.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={c.events} max={maxCountry} color="rgba(99,179,237,0.55)" />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.countries.length && (
                                            <tr><td colSpan={3} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                                <Link className="sa-panel__footer-link" to={analyticsAudiencePath(domain)}>View audience →</Link>
                            </div>

                            <div className="sa-panel sa-ga-sources">
                                <h3 className="sa-panel__title">
                                    <IconMegaphone className="sa-icon" /> Traffic sources
                                    <span className="sa-panel__consent-note">full events only</span>
                                </h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Referrer</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__num">Sessions</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.referrers.slice(0, 6).map((r, i) => (
                                            <tr key={i}>
                                                <td className="sa-table__path" title={r.referrer}>{r.referrer}</td>
                                                <td className="sa-table__num">{r.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__num">{r.sessions.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={r.events} max={maxReferrer} color="rgba(99,179,237,0.55)" />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.referrers.length && (
                                            <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                                <Link className="sa-panel__footer-link" to={analyticsAcquisitionPath(domain)}>View traffic acquisition →</Link>
                            </div>

                            <div className="sa-panel sa-ga-devices">
                                <h3 className="sa-panel__title"><IconUsers className="sa-icon" /> Devices</h3>
                                <div className="sa-consent-list">
                                    {data.devices.map(d => {
                                        const pct = deviceTotal > 0 ? Math.round((d.events / deviceTotal) * 100) : 0;
                                        return (
                                            <div key={d.type} className="sa-consent-row">
                                                <span className="sa-consent-row__label" style={{ textTransform: "capitalize" }}>{d.type}</span>
                                                <div className="sa-bar">
                                                    <div className="sa-bar__seg"
                                                        style={{ width: pct + "%", background: "rgba(192,159,83,0.55)" }}
                                                        title={d.events + " events"} />
                                                </div>
                                                <span className="sa-consent-row__pct">{pct}%</span>
                                            </div>
                                        );
                                    })}
                                    {!data.devices.length && (
                                        <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem", margin: 0 }}>No data yet</p>
                                    )}
                                </div>
                                <Link className="sa-panel__footer-link" to={analyticsAudiencePath(domain)}>View audience →</Link>
                            </div>

                            <div className="sa-panel sa-ga-pages">
                                <h3 className="sa-panel__title"><IconDocument className="sa-icon" /> Top pages</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Page</th>
                                            <th className="sa-table__num">Views</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topPages.map(p => (
                                            <tr key={p.pathname}>
                                                <td className="sa-table__path" title={p.pathname}>{p.pathname}</td>
                                                <td className="sa-table__num">{p.views.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={p.views} max={maxPageViews} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
