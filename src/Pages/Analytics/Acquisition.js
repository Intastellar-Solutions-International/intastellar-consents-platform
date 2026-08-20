const { useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsPage, MiniBar, KpiCard, useAnalyticsReport, toIsoDate, pctChange } from "./_shared.js";
import { IconMegaphone, IconTrendingUp, IconGlobe } from "./Icons.js";
import "./Analytics.css";

export default function AnalyticsAcquisition() {
    document.title = "Acquisition | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
        tick, data, loading, error, showData,
    } = useAnalyticsPage();

    // Previous period of the same length — same "vs previous period" pattern
    // the Overview page's KPI cards use (src/Pages/Analytics/index.js).
    const prevRange = useMemo(() => {
        const spanMs = toDate.getTime() - fromDate.getTime();
        const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
        const prevFrom = new Date(prevTo.getTime() - spanMs);
        return { fromIso: toIsoDate(prevFrom), toIso: toIsoDate(prevTo) };
    }, [fromDate, toDate]);
    const { data: prevData } = useAnalyticsReport(domain, prevRange.fromIso, prevRange.toIso, tick);

    const trendSessions = useMemo(() => pctChange(data?.totals?.uniqueSessions, prevData?.totals?.uniqueSessions), [data, prevData]);
    const trendPageviews = useMemo(() => pctChange(data?.totals?.total,          prevData?.totals?.total),          [data, prevData]);

    const maxUtm       = useMemo(() => Math.max(...(data?.utmSources || []).map(u => u.events), 1), [data]);
    const maxPages     = useMemo(() => Math.max(...(data?.topPages   || []).map(p => p.views),  1), [data]);
    const maxReferrer  = useMemo(() => Math.max(...(data?.referrers  || []).map(r => r.events), 1), [data]);
    const maxHost      = useMemo(() => Math.max(...(data?.hosts      || []).map(h => h.events), 1), [data]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Acquisition"
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
                        <p className="sa-notice">Select a domain in the header to view acquisition data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !loading && data?.noData && (
                        <p className="sa-notice">No data for the selected period.</p>
                    )}

                    {showData && (
                        <div className="sa-acq-grid">

                            {/* Top-line numbers */}
                            <div className="sa-acq-kpis">
                                <KpiCard
                                    icon={<IconGlobe />}
                                    label="Sessions"
                                    value={data.totals.uniqueSessions.toLocaleString("de-DE")}
                                    sub="consent-gated sessions only"
                                    trend={trendSessions}
                                />
                                <KpiCard
                                    icon={<IconTrendingUp />}
                                    label="Page views"
                                    value={data.totals.total.toLocaleString("de-DE")}
                                    trend={trendPageviews}
                                />
                            </div>

                            {/* Top pages */}
                            <div className="sa-panel sa-acq-pages">
                                <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> Top pages</h3>
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
                                                    <MiniBar value={p.views} max={maxPages} color="rgba(192,159,83,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Campaigns (UTM source / medium / campaign) */}
                            {data.utmSources.length > 0 ? (
                                <div className="sa-panel sa-acq-utm">
                                    <h3 className="sa-panel__title">
                                        <IconMegaphone className="sa-icon" /> Campaigns
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Campaign</th>
                                                <th>Source</th>
                                                <th>Medium</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.utmSources.map((u, i) => (
                                                <tr key={i}>
                                                    <td
                                                        title={u.campaignRaw && u.campaignRaw !== u.campaign ? `Raw value: ${u.campaignRaw}` : undefined}
                                                        style={!u.campaign || u.campaign.startsWith("Unresolved") || u.campaign.startsWith("Unnamed") ? { color: "rgba(130,130,130,0.7)", fontStyle: "italic" } : undefined}
                                                    >
                                                        {u.campaign || "—"}
                                                    </td>
                                                    <td>{u.source || "—"}</td>
                                                    <td>{u.medium || "—"}</td>
                                                    <td className="sa-table__num">{u.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={u.events} max={maxUtm} color="rgba(251,146,60,0.6)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="sa-panel sa-acq-utm">
                                    <h3 className="sa-panel__title">
                                        <IconMegaphone className="sa-icon" /> Campaigns
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.82rem", margin: 0 }}>
                                        No UTM-tagged traffic in this period. Add <code>?utm_source=&amp;utm_campaign=</code> parameters to your campaign links to see data here.
                                    </p>
                                </div>
                            )}

                            {/* Referrers — where traffic came from, tagged or not (third-party
                                sites, social shares, search results without UTMs). Un-referred
                                traffic shows as "(direct)". */}
                            <div className="sa-panel sa-acq-referrers">
                                <h3 className="sa-panel__title">
                                    <IconGlobe className="sa-icon" /> Referrers
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
                                        {data.referrers.map((r, i) => (
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
                            </div>

                            {/* Hosts — the hostname the embed actually ran on, as opposed to
                                the domain the site key was registered under. A booking widget
                                or white-label host embedded under the same site key (e.g. a
                                separate booking-system domain) shows up here as its own row,
                                which is what surfaces that kind of cross-site tracking. */}
                            <div className="sa-panel sa-acq-hosts">
                                <h3 className="sa-panel__title">
                                    <IconGlobe className="sa-icon" /> Hosts
                                    <span className="sa-panel__consent-note">where the tracker actually ran</span>
                                </h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Host</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__num">Sessions</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data?.hosts?.map((h, i) => (
                                            <tr key={i}>
                                                <td
                                                    className="sa-table__path"
                                                    title={h.host === "(unknown)"
                                                        ? "No hostname was reported with these events — usually pageviews sent before host tracking was added to this site's tracking snippet, or from a cached/self-hosted copy of the snippet that predates it. Re-copying the current snippet from Settings resolves this going forward."
                                                        : h.host}
                                                >
                                                    {h.host}
                                                    {h.host !== domain && h.host !== "(unknown)" && (
                                                        <span className="sa-panel__consent-note"> · cross-site</span>
                                                    )}
                                                    {h.host === "(unknown)" && (
                                                        <span className="sa-panel__consent-note"> · no host reported</span>
                                                    )}
                                                </td>
                                                <td className="sa-table__num">{h.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__num">{h.sessions.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={h.events} max={maxHost} color="rgba(192,159,83,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data?.hosts?.length && (
                                            <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                        )}
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
