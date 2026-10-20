const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
import { DomainContext } from "../../App.js";
import {
    useSyncDomainFromRoute, isCombinedOrClearDomain, analyticsMarketingPath,
} from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import Authentication from "../../Authentication/Auth.js";
import { ScannerHost } from "../../API/host.js";
import { toIsoDate, formatPercent, KpiCard } from "./_shared.js";
import { IconBarChart, IconUsers, IconGlobe, IconCursorClick } from "./Icons.js";
import { Ga4SessionsChart } from "./GoogleAnalyticsChart.js";
import googleAnalyticsLogo from "../../Components/Header/icons/google-analytics.svg";
import "./Analytics.css";

function fmtInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return Math.round(x).toLocaleString("de-DE");
}

function fmtDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function useGa4Report(domain, fromDate, toDate) {
    const [state, setState] = useState({
        checked: false, connected: false,
        rows: null, platformBreakdown: null, summary: null,
        channelBreakdown: null, deviceBreakdown: null,
        countryBreakdown: null, topPages: null,
        loading: false,
    });

    useEffect(() => {
        if (!domain) { setState(s => ({ ...s, checked: false })); return; }
        const authToken = Authentication.getToken();
        const orgId     = Authentication.getOrganisation();
        if (!authToken || !orgId) return;
        const fromYmd = toIsoDate(fromDate);
        const toYmd   = toIsoDate(toDate);

        let cancelled = false;
        setState(s => ({ ...s, loading: true }));
        const headers = { Authorization: authToken, Organisation: String(orgId) };

        fetch(`${ScannerHost}/api/ad-connections?domain=${encodeURIComponent(domain)}`, { headers })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (cancelled) return null;
                const hasGa4 = (data?.connections || []).some(c => c.platform === "google_analytics" && c.account_id);
                if (!hasGa4) {
                    setState({ checked: true, connected: false, rows: null, platformBreakdown: null, summary: null, channelBreakdown: null, deviceBreakdown: null, countryBreakdown: null, topPages: null, loading: false });
                    return null;
                }
                const qs = `platform=google_analytics&domain=${encodeURIComponent(domain)}&fromDate=${fromYmd}&toDate=${toYmd}`;
                return fetch(`${ScannerHost}/api/ad-daily-data?${qs}`, { headers }).then(r => r.ok ? r.json() : null);
            })
            .then(daily => {
                if (cancelled || !daily) return;
                setState({
                    checked: true, connected: true,
                    rows:              daily.rows              || [],
                    platformBreakdown: daily.platformBreakdown || null,
                    summary:           daily.summary           || null,
                    channelBreakdown:  daily.channelBreakdown  || null,
                    deviceBreakdown:   daily.deviceBreakdown   || null,
                    countryBreakdown:  daily.countryBreakdown  || null,
                    topPages:          daily.topPages          || null,
                    loading: false,
                });
            })
            .catch(() => { if (!cancelled) setState(s => ({ ...s, checked: true, loading: false })); });

        return () => { cancelled = true; };
    }, [domain, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

    return state;
}

/* ── New vs Returning panel ──────────────────────────────────────────────── */
function NewVsReturningPanel({ summary }) {
    if (!summary) return null;
    const total     = summary.totalUsers || 0;
    const newUsers  = summary.newUsers   || 0;
    const returning = Math.max(0, total - newUsers);
    if (!total) return null;
    const newPct = (newUsers  / total) * 100;
    const retPct = (returning / total) * 100;
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">New vs. returning users</h3>
            <div className="ga4-nvr">
                <div className="ga4-nvr__bar-track">
                    <div className="ga4-nvr__bar-new"  style={{ width: `${newPct}%` }}  title={`New: ${formatPercent(newPct)}`} />
                    <div className="ga4-nvr__bar-ret"  style={{ width: `${retPct}%` }}  title={`Returning: ${formatPercent(retPct)}`} />
                </div>
                <div className="ga4-nvr__legend">
                    <span className="ga4-nvr__dot ga4-nvr__dot--new" />
                    <span className="ga4-nvr__label">New <strong>{formatPercent(newPct)}</strong> ({fmtInt(newUsers)})</span>
                    <span className="ga4-nvr__dot ga4-nvr__dot--ret" />
                    <span className="ga4-nvr__label">Returning <strong>{formatPercent(retPct)}</strong> ({fmtInt(returning)})</span>
                </div>
            </div>
        </div>
    );
}

/* ── Channel breakdown panel ─────────────────────────────────────────────── */
function ChannelPanel({ channelBreakdown }) {
    if (!channelBreakdown?.length) return null;
    const total = channelBreakdown.reduce((s, c) => s + c.sessions, 0) || 1;
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">Channel performance</h3>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th>Channel</th>
                        <th></th>
                        <th className="sa-table__num">Sessions</th>
                        <th className="sa-table__num">Users</th>
                        <th className="sa-table__num">Engagement</th>
                    </tr>
                </thead>
                <tbody>
                    {channelBreakdown.map(c => {
                        const share = (c.sessions / total) * 100;
                        return (
                            <tr key={c.channelGroup}>
                                <td style={{ width: "160px" }}>{c.channelGroup}</td>
                                <td className="ga4-ch-bar-cell">
                                    <div className="ga4-ch-bar-track">
                                        <div className="ga4-ch-bar-fill" style={{ width: `${share}%` }} />
                                    </div>
                                    <span className="ga4-ch-bar-pct">{formatPercent(share)}</span>
                                </td>
                                <td className="sa-table__num">{fmtInt(c.sessions)}</td>
                                <td className="sa-table__num">{fmtInt(c.users)}</td>
                                <td className="sa-table__num">{formatPercent(c.engagementRate * 100)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/* ── Device breakdown panel ──────────────────────────────────────────────── */
function DevicePanel({ deviceBreakdown }) {
    if (!deviceBreakdown?.length) return null;
    const total = deviceBreakdown.reduce((s, d) => s + d.sessions, 0) || 1;
    const COLORS = { desktop: "rgba(145,158,180,0.45)", mobile: "rgba(99,102,241,0.55)", tablet: "rgba(52,211,153,0.5)" };
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">Devices</h3>
            <div className="ga4-platform-breakdown__rows">
                {deviceBreakdown.map(d => {
                    const share = (d.sessions / total) * 100;
                    return (
                        <div key={d.device} className="ga4-pb-row">
                            <span className="ga4-pb-row__name" style={{ textTransform: "capitalize" }}>{d.device}</span>
                            <div className="ga4-pb-row__bar-wrap">
                                <div className="ga4-pb-row__bar" style={{ width: `${Math.max(1, share)}%`, background: COLORS[d.device] || "rgba(145,158,180,0.35)" }} />
                            </div>
                            <span className="ga4-pb-row__share">{formatPercent(share)}</span>
                            <span className="ga4-pb-row__count">{fmtInt(d.sessions)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Country breakdown panel ─────────────────────────────────────────────── */
function CountryPanel({ countryBreakdown }) {
    if (!countryBreakdown?.length) return null;
    const total = countryBreakdown.reduce((s, c) => s + c.sessions, 0) || 1;
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">Top countries</h3>
            <div className="ga4-platform-breakdown__rows">
                {countryBreakdown.map(c => {
                    const share = (c.sessions / total) * 100;
                    return (
                        <div key={c.country} className="ga4-pb-row">
                            <span className="ga4-pb-row__name">{c.country}</span>
                            <div className="ga4-pb-row__bar-wrap">
                                <div className="ga4-pb-row__bar" style={{ width: `${Math.max(1, share)}%`, background: "rgba(145,158,180,0.35)" }} />
                            </div>
                            <span className="ga4-pb-row__share">{formatPercent(share)}</span>
                            <span className="ga4-pb-row__count">{fmtInt(c.sessions)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Top pages panel ─────────────────────────────────────────────────────── */
function TopPagesPanel({ topPages }) {
    if (!topPages?.length) return null;
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">Top pages</h3>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th>Page</th>
                        <th className="sa-table__num">Page views</th>
                        <th className="sa-table__num">Sessions</th>
                        <th className="sa-table__num">Avg. time</th>
                        <th className="sa-table__num">Engagement</th>
                    </tr>
                </thead>
                <tbody>
                    {topPages.map(p => (
                        <tr key={p.page}>
                            <td className="sa-table__path" title={p.page}>{p.page}</td>
                            <td className="sa-table__num">{fmtInt(p.pageViews)}</td>
                            <td className="sa-table__num">{fmtInt(p.sessions)}</td>
                            <td className="sa-table__num">{fmtDuration(p.avgSessionDuration)}</td>
                            <td className="sa-table__num">{formatPercent(p.engagementRate * 100)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function GoogleAnalytics() {
    document.title = "Google Analytics 4 | Site Analytics";

    const { handle } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [getLastDays, setLastDays] = useState(30);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d;
    });
    const [toDate, setToDate] = useState(() => new Date());

    const ga4 = useGa4Report(domain, fromDate, toDate);
    const { summary } = ga4;

    const bounceRatePct = summary ? Math.round((summary.bounceRate || 0) * 100) : null;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Google Analytics 4"
                titleLogo={googleAnalyticsLogo}
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
                        <p className="sa-notice">Select a domain in the header to view Google Analytics data.</p>
                    )}

                    {domain && ga4.loading && !ga4.connected && (
                        <p className="sa-notice">Loading…</p>
                    )}

                    {domain && ga4.checked && !ga4.connected && (
                        <div className="sa-setup">
                            <div className="sa-setup__icon"><IconBarChart /></div>
                            <h3 className="sa-setup__title">No Google Analytics 4 property connected for <strong>{domain}</strong></h3>
                            <p className="sa-setup__body">
                                Connect a GA4 property to see sessions, engagement, channel breakdown, devices, and top pages here.
                            </p>
                            <Link className="sa-setup__gen-btn" to={analyticsMarketingPath(domain)}>
                                Connect Google Analytics
                            </Link>
                        </div>
                    )}

                    {(ga4.connected || (ga4.loading && ga4.rows)) && (
                        <div className="sa-ga4-stack">

                            {/* ── KPI strip ──────────────────────────────────────── */}
                            {summary && (
                                <div className="sa-kpi-row">
                                    <KpiCard
                                        icon={<IconBarChart />}
                                        label="Sessions"
                                        value={fmtInt(summary.sessions)}
                                    />
                                    <KpiCard
                                        icon={<IconUsers />}
                                        label="Users"
                                        value={fmtInt(summary.totalUsers)}
                                        sub={`${fmtInt(summary.newUsers)} new`}
                                    />
                                    <KpiCard
                                        icon={<IconCursorClick />}
                                        label="Page views"
                                        value={fmtInt(summary.pageViews)}
                                    />
                                    <KpiCard
                                        label="Engagement"
                                        value={formatPercent(summary.engagementRate * 100)}
                                        sub="engaged sessions / total"
                                    />
                                    <KpiCard
                                        label="Avg. session"
                                        value={fmtDuration(summary.avgSessionDuration)}
                                    />
                                    {bounceRatePct !== null && (
                                        <KpiCard
                                            label="Bounce rate"
                                            value={formatPercent(bounceRatePct)}
                                            variant={bounceRatePct > 60 ? "warn" : undefined}
                                        />
                                    )}
                                </div>
                            )}

                            {/* ── Sessions trend ─────────────────────────────────── */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Sessions trend</h3>
                                <Ga4SessionsChart
                                    rows={ga4.rows || []}
                                    platformBreakdown={ga4.platformBreakdown}
                                    summary={summary}
                                    channelBreakdown={ga4.channelBreakdown}
                                    syncing={ga4.loading}
                                />
                            </div>

                            {/* ── New vs Returning ───────────────────────────────── */}
                            <NewVsReturningPanel summary={summary} />

                            {/* ── Channel performance ────────────────────────────── */}
                            <ChannelPanel channelBreakdown={ga4.channelBreakdown} />

                            {/* ── Device + Country (2-col) ───────────────────────── */}
                            <div className="ga4-two-col">
                                <DevicePanel  deviceBreakdown={ga4.deviceBreakdown} />
                                <CountryPanel countryBreakdown={ga4.countryBreakdown} />
                            </div>

                            {/* ── Top pages ──────────────────────────────────────── */}
                            <TopPagesPanel topPages={ga4.topPages} />

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
