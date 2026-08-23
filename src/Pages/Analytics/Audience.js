const { useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import { useAnalyticsPage, MiniBar, KpiCard, useAnalyticsReport, toIsoDate, pctChange } from "./_shared.js";
import { IconGlobe, IconUsers, IconRadio } from "./Icons.js";
import "./Analytics.css";

export default function AnalyticsAudience() {
    document.title = "Audience | Site Analytics";

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
    const trendEngaged  = useMemo(() => pctChange(data?.totals?.engagedUsers,   prevData?.totals?.engagedUsers),   [data, prevData]);
    const trendCountries = useMemo(() => pctChange(data?.countries?.length,     prevData?.countries?.length),      [data, prevData]);

    const nvrData = useMemo(() => {
        const nvr = data?.newVsReturning;
        if (!nvr || nvr.tracked === 0) return null;
        return {
            newPct:       Math.round((nvr.newSessions       / nvr.tracked) * 100),
            returningPct: Math.round((nvr.returningSessions / nvr.tracked) * 100),
            newSessions:       nvr.newSessions,
            returningSessions: nvr.returningSessions,
            tracked:           nvr.tracked,
        };
    }, [data]);

    const maxCountry = useMemo(() => Math.max(...(data?.countries  || []).map(c => c.events), 1), [data]);
    const maxBrowser = useMemo(() => Math.max(...(data?.browsers   || []).map(b => b.events), 1), [data]);
    const maxOs      = useMemo(() => Math.max(...(data?.os         || []).map(o => o.events), 1), [data]);
    const maxScreens = useMemo(() => Math.max(...(data?.screens    || []).map(s => s.events), 1), [data]);
    const maxLang    = useMemo(() => Math.max(...(data?.languages  || []).map(l => l.events), 1), [data]);
    const maxTz      = useMemo(() => Math.max(...(data?.timezones  || []).map(t => t.events), 1), [data]);
    const deviceTotal = useMemo(() => (data?.devices || []).reduce((s, d) => s + d.events, 0), [data]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Audience"
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
                        <p className="sa-notice">Select a domain in the header to view audience data.</p>
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
                        <div className="sa-audience-grid">

                            {/* Top-line numbers */}
                            <div className="sa-aud-kpis">
                                <KpiCard
                                    icon={<IconUsers />}
                                    label="Unique sessions"
                                    value={data.totals.uniqueSessions.toLocaleString("de-DE")}
                                    sub="consent-gated sessions only"
                                    variant="purple"
                                    trend={trendSessions}
                                />
                                <KpiCard
                                    icon={<IconRadio />}
                                    label="Active users"
                                    value={data.totals.engagedUsers.toLocaleString("de-DE")}
                                    sub="engaged: 10s+, clicked, or 2+ pages"
                                    variant="live"
                                    trend={trendEngaged}
                                />
                                <KpiCard
                                    icon={<IconGlobe />}
                                    label="Countries reached"
                                    value={data.countries.length.toLocaleString("de-DE")}
                                    variant="teal"
                                    trend={trendCountries}
                                />
                            </div>

                            {/* New vs Returning */}
                            <div className="sa-panel sa-aud-nvr">
                                <h3 className="sa-panel__title">
                                    <IconUsers className="sa-icon" /> New vs Returning visitors
                                    <span className="sa-panel__consent-note">full events only · based on persistent visitor cookie</span>
                                </h3>
                                {nvrData ? (
                                    <div className="sa-aud-nvr-bars">
                                        <div>
                                            <div className="sa-consent-row">
                                                <span className="sa-consent-row__label">New visitors</span>
                                                <div className="sa-bar">
                                                    <div className="sa-bar__seg"
                                                        style={{ width: nvrData.newPct + "%", background: "rgba(74,222,128,0.5)" }}
                                                        title={nvrData.newSessions.toLocaleString("de-DE") + " sessions"} />
                                                </div>
                                                <span className="sa-consent-row__pct">{nvrData.newPct}%</span>
                                            </div>
                                            <div className="sa-consent-row">
                                                <span className="sa-consent-row__label">Returning visitors</span>
                                                <div className="sa-bar">
                                                    <div className="sa-bar__seg"
                                                        style={{ width: nvrData.returningPct + "%", background: "rgba(192,159,83,0.55)" }}
                                                        title={nvrData.returningSessions.toLocaleString("de-DE") + " sessions"} />
                                                </div>
                                                <span className="sa-consent-row__pct">{nvrData.returningPct}%</span>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "16px", alignItems: "center", paddingLeft: "8px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: "22px", fontWeight: 600, color: "rgba(74,222,128,0.9)" }}>{nvrData.newSessions.toLocaleString("de-DE")}</div>
                                                <div style={{ fontSize: "11px", color: "rgba(240,235,225,0.5)", marginTop: "2px" }}>new</div>
                                            </div>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: "22px", fontWeight: 600, color: "rgba(192,159,83,0.9)" }}>{nvrData.returningSessions.toLocaleString("de-DE")}</div>
                                                <div style={{ fontSize: "11px", color: "rgba(240,235,225,0.5)", marginTop: "2px" }}>returning</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="sa-notice" style={{ margin: 0, padding: "8px 0" }}>
                                        No visitor tracking data yet — appears once visitors with the new analytics embed are recorded.
                                    </p>
                                )}
                            </div>

                            {/* Countries */}
                            <div className="sa-panel sa-aud-countries">
                                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Countries</h3>
                                <div className="sa-aud-countries-grid">
                                    {data.countries.length > 0 && <AnalyticsWorldMap countries={data.countries} />}
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
                                                        <MiniBar value={c.events} max={maxCountry} color="rgba(99,179,237,0.55)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Devices */}
                            <div className="sa-panel sa-aud-devices">
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
                                </div>
                            </div>

                            {/* Browsers */}
                            <div className="sa-panel sa-aud-browsers">
                                <h3 className="sa-panel__title">
                                    <IconGlobe className="sa-icon" /> Browsers
                                    <span className="sa-panel__consent-note">full events only</span>
                                </h3>
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
                                                    <MiniBar value={b.events} max={maxBrowser} color="rgba(167,139,250,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Operating systems */}
                            <div className="sa-panel sa-aud-os">
                                <h3 className="sa-panel__title">
                                    <IconRadio className="sa-icon" /> Operating systems
                                    <span className="sa-panel__consent-note">full events only</span>
                                </h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>OS</th>
                                            <th className="sa-table__num">Events</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data.os || []).map(o => (
                                            <tr key={o.name}>
                                                <td>{o.name}</td>
                                                <td className="sa-table__num">{o.events.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={o.events} max={maxOs} color="rgba(129,140,248,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Screen resolutions */}
                            {data.screens?.length > 0 && (
                                <div className="sa-panel sa-aud-screens">
                                    <h3 className="sa-panel__title">
                                        <IconRadio className="sa-icon" /> Screen resolutions
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Resolution</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.screens.map((s, i) => (
                                                <tr key={i}>
                                                    <td>{s.width}&thinsp;&times;&thinsp;{s.height}</td>
                                                    <td className="sa-table__num">{s.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={s.events} max={maxScreens} color="rgba(52,211,153,0.6)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Languages */}
                            {data.languages?.length > 0 && (
                                <div className="sa-panel sa-aud-lang">
                                    <h3 className="sa-panel__title">
                                        <IconGlobe className="sa-icon" /> Languages
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Language</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.languages.map(l => (
                                                <tr key={l.lang}>
                                                    <td>{l.lang}</td>
                                                    <td className="sa-table__num">{l.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={l.events} max={maxLang} color="rgba(251,146,60,0.55)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Timezones */}
                            {data.timezones?.length > 0 && (
                                <div className="sa-panel sa-aud-tz">
                                    <h3 className="sa-panel__title">
                                        <IconGlobe className="sa-icon" /> Timezones
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Timezone</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.timezones.map(t => (
                                                <tr key={t.tz}>
                                                    <td>{t.tz}</td>
                                                    <td className="sa-table__num">{t.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={t.events} max={maxTz} color="rgba(248,113,113,0.5)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
