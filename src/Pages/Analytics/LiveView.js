import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import { useAnalyticsPageChrome, useSiteConfig, useLiveData, formatCurrency, timeAgo } from "./_shared.js";
import { IconGlobe } from "./Icons.js";
import "./Analytics.css";

/**
 * Dedicated Live View page — docs/design-audit-plan.md Phase 4. The
 * embedded Overview widget (LivePanel, index.js) is deliberately minimal
 * now (hero number, sparkline, top-5 countries); everything it used to
 * carry — the full sparkline + 2x2 KPI grid, the recent-events feed,
 * conversions, cross-site hosts — lives here instead, alongside a large
 * map hero (same AnalyticsWorldMap component Overview/Audience use, fed
 * live per-country active-user counts instead of a period aggregate).
 * Polls the same /api/analytics-live endpoint via the shared useLiveData()
 * hook (_shared.js) — no separate data source from the widget.
 */
export default function LiveView() {
    document.title = "Live View | Site Analytics";

    const { domain } = useAnalyticsPageChrome();
    const siteConfig = useSiteConfig(domain);
    const { data, countdown } = useLiveData(domain, siteConfig?.id);

    const mapCountries = (data?.countries || []).map(c => ({ code: c.code, events: c.activeUsers }));
    const maxUserBar = Math.max(...(data?.perMinuteUsers || [1]), 1);
    const consentPct = data?.total > 0 ? Math.round((data.full / data.total) * 100) : 0;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle className="sa-sticky-header" title="Live View" />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view live activity.</p>
                    )}
                    {domain && !data && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}

                    {domain && data && !data.noSiteKey && (
                        <div className="sa-liveview">
                            <div className="sa-liveview__status">
                                <span className="sa-live__dot" />
                                <span className="sa-liveview__status-text">
                                    <strong>{data.sessions.toLocaleString("de-DE")}</strong> active user{data.sessions !== 1 ? "s" : ""} right now
                                </span>
                                <span className="sa-live__countdown">refreshing in {countdown}s</span>
                            </div>

                            <div className="sa-panel sa-liveview__map-panel">
                                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Active countries</h3>
                                <AnalyticsWorldMap countries={mapCountries} metricLabel="Active users" />
                            </div>

                            <div className="sa-liveview__grid">
                                <div className="sa-live sa-liveview__card">
                                    <div className="sa-live__body sa-liveview__card-body">
                                        <div className="sa-live__sparkline">
                                            <div className="sa-live__spark-hd">
                                                <span className="sa-live__spark-label">Active users per minute</span>
                                            </div>
                                            <div className="sa-live__spark-bars">
                                                {(data.perMinuteUsers || []).map((v, i) => (
                                                    <div
                                                        key={i}
                                                        className={"sa-live__spark-bar" + (i === data.perMinuteUsers.length - 1 ? " sa-live__spark-bar--last" : "")}
                                                        style={{ height: Math.max(3, Math.round((v / maxUserBar) * 44)) + "px" }}
                                                        title={`${v} active user${v !== 1 ? "s" : ""}`}
                                                    />
                                                ))}
                                            </div>
                                            <div className="sa-live__spark-times">
                                                <span>−30m</span><span>−15m</span><span>now</span>
                                            </div>
                                        </div>

                                        <div className="sa-live__kpis">
                                            <div className="sa-live__kpi">
                                                <span className="sa-live__kpi-label">Events</span>
                                                <span className="sa-live__kpi-value">{data.total.toLocaleString("de-DE")}</span>
                                                <span className="sa-live__kpi-sub">{data.minimal}m · {data.full}f</span>
                                            </div>
                                            <div className="sa-live__kpi">
                                                <span className="sa-live__kpi-label">Sessions</span>
                                                <span className="sa-live__kpi-value">{data.sessions.toLocaleString("de-DE")}</span>
                                                <span className="sa-live__kpi-sub">consent-gated</span>
                                            </div>
                                            <div className="sa-live__kpi sa-live__kpi--consent" style={{ '--cpct': consentPct + '%' }}>
                                                <span className="sa-live__kpi-label">Consent</span>
                                                <span className="sa-live__kpi-value">{consentPct}%</span>
                                                <span className="sa-live__kpi-sub">this window</span>
                                            </div>
                                            <div className="sa-live__kpi">
                                                <span className="sa-live__kpi-label">Top pages</span>
                                                <span className="sa-live__kpi-value">{data.topPages?.length || 0}</span>
                                                <span className="sa-live__kpi-sub">active now</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="sa-live sa-liveview__card">
                                    <div className="sa-live__body sa-liveview__card-body">
                                        <p className="sa-live__section-title">Recent events</p>
                                        <div className="sa-live__feed">
                                            {(data.recent || []).map((e, i) => (
                                                <div key={i} className={"sa-live__event" + (e.eventName ? " sa-live__event--custom" : "")}>
                                                    <span className="sa-live__event-path" title={e.host ? `${e.host}${e.path}` : e.path}>
                                                        {e.eventName
                                                            ? <span className="sa-live__event-name">{e.eventName.replace(/_/g, " ")}</span>
                                                            : <>{e.host && e.host !== domain ? `${e.host}` : ""}{e.path}</>
                                                        }
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
                                            {!data.recent?.length && !data.trackerMismatch && (
                                                <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem", margin: 0 }}>No events yet</p>
                                            )}
                                            {data.trackerMismatch && (
                                                <p className="sa-live__mismatch">
                                                    Tracker is sending events under a different site key — the script tag on <strong>{domain}</strong> likely has a stale or wrong <code>data-site</code> value. Check Analytics Settings → Script.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="sa-live sa-liveview__card">
                                    <div className="sa-live__body sa-liveview__card-body">
                                        <p className="sa-live__section-title">
                                            Conversions
                                            {data.conversions?.length > 0 && (
                                                <span className="sa-live__conv-total">
                                                    {data.conversions.reduce((s, c) => s + c.count, 0)} total
                                                </span>
                                            )}
                                        </p>
                                        {data.conversions?.length > 0 ? (
                                            <div className="sa-live__conv-list">
                                                {data.conversions.map(c => (
                                                    <div key={c.name} className="sa-live__conv-row">
                                                        <span className="sa-live__conv-label" title={c.name}>{c.label}</span>
                                                        <div className="sa-live__conv-right">
                                                            {c.valueCents != null && (
                                                                <span className="sa-live__conv-value">
                                                                    {formatCurrency(c.valueCents, c.currency || "EUR", { cents: true })}
                                                                </span>
                                                            )}
                                                            <span className="sa-live__conv-count">{c.count}×</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="sa-live__conv-empty">No conversions in this window</p>
                                        )}
                                    </div>
                                </div>

                                {data.topHosts && data.topHosts.length > 1 && (
                                    <div className="sa-live sa-liveview__card">
                                        <div className="sa-live__body sa-liveview__card-body">
                                            <p className="sa-live__section-title">Cross-site hosts</p>
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
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
