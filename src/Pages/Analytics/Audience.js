const { useMemo, useState } = React;

// Subset of Chrome Topics API v1 taxonomy (IAB Content Taxonomy)
const TOPIC_LABELS = {
    1:"Arts & Entertainment",2:"Humor",3:"Movies",4:"Music & Audio",5:"Television",
    6:"Books & Literature",7:"Comics & Animation",8:"Concerts & Music Events",
    57:"Automotive",58:"Boats & Watercraft",65:"Beauty & Fitness",66:"Books & Literature",
    71:"Business & Industrial",83:"Business",84:"Advertising & Marketing",
    100:"Computers & Electronics",101:"Computer Hardware",102:"Computer Security",
    105:"Finance",106:"Banking",107:"Food & Drink",108:"Cooking & Recipes",
    109:"Food",136:"Games",137:"Card Games",138:"Computer & Video Games",
    140:"Health",141:"Fitness & Exercise",142:"Nutrition",148:"Hobbies & Leisure",
    155:"Home & Garden",161:"Internet & Telecom",165:"Jobs & Education",
    166:"Education",167:"Jobs",179:"Law & Government",182:"News",
    183:"Business News",184:"Politics",185:"Online Communities",
    187:"People & Society",199:"Pets & Animals",208:"Real Estate",
    213:"Reference",216:"Science",219:"Shopping",225:"Sports",
    226:"American Football",227:"Baseball",228:"Basketball",229:"Soccer",
    237:"Travel",238:"Air Travel",239:"Hotels & Accommodations",
    240:"Tourist Destinations",271:"TV & Video",272:"Movies",273:"TV Shows",
};
function topicLabel(id){ return TOPIC_LABELS[id] || ('Topic #' + id); }

// Maps raw schema.org @type values and OG types → readable interest labels.
// null = filter out (structural/generic types with no user-interest signal).
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import { useAnalyticsPage, MiniBar, KpiCard, useAnalyticsReport, toIsoDate, pctChange, PanelSkeleton } from "./_shared.js";
import { IconGlobe, IconUsers, IconRadio } from "./Icons.js";
import ErrorBoundary from "../../Components/Error/ErrorBoundary.js";
import "./Analytics.css";

function InterestRow({ label, sessions, events, max, color, badge }) {
    const val = sessions || events;
    return (
        <tr>
            <td>
                {color && <span style={{ display:"inline-block",width:8,height:8,borderRadius:"50%",background:color,marginRight:7,verticalAlign:"middle" }} />}
                {label}
                {badge && <span style={{ marginLeft:8,fontSize:10,padding:"1px 5px",borderRadius:3,background:"rgba(255,255,255,0.07)",color:"rgba(200,200,200,0.6)",verticalAlign:"middle" }}>{badge}</span>}
            </td>
            <td className="sa-table__num">{val.toLocaleString("de-DE")}</td>
            <td className="sa-table__bar"><MiniBar value={val} max={max} color={color || "rgba(139,92,246,0.6)"} /></td>
        </tr>
    );
}

function InterestsTable({ rows, max, emptyText }) {
    if (!rows.length) return <p className="sa-notice" style={{ margin:0,padding:"6px 0",fontSize:12 }}>{emptyText}</p>;
    return (
        <table className="sa-table">
            <thead><tr><th>Interest</th><th className="sa-table__num">Sessions</th><th className="sa-table__bar" /></tr></thead>
            <tbody>{rows}</tbody>
        </table>
    );
}

function scoreToTier(score) {
    if (score > 75) return { label: "High Intent", color: "rgba(16,185,129,0.9)"  };
    if (score > 50) return { label: "Engaged",     color: "rgba(249,115,22,0.9)"  };
    if (score > 25) return { label: "Warm",        color: "rgba(234,179,8,0.9)"   };
    return             { label: "Cold",         color: "rgba(150,150,180,0.75)" };
}

function RuleInterestRow({ interest }) {
    const { label, color, sessions, avgScore, onTopic, offTopic } = interest;
    const total  = sessions || 1;
    const onPct  = Math.round((onTopic  / total) * 100);
    const offPct = 100 - onPct;
    const { label: tierLabel, color: tierColor } = scoreToTier(avgScore);
    return (
        <div className="sa-int-rule-row">
            <div className="sa-int-rule-row__header">
                <span style={{ width:8,height:8,borderRadius:"50%",background:color||"rgba(139,92,246,0.6)",display:"inline-block",flexShrink:0 }} />
                <span className="sa-int-rule-row__label">{label}</span>
                <span className="sa-int-rule-row__stats">
                    {sessions.toLocaleString("de-DE")} sessions
                    <span className="sa-int-rule-row__score" style={{ color: tierColor }}>{avgScore}/100</span>
                    <span style={{ color: tierColor, fontSize:"0.72rem" }}>{tierLabel}</span>
                </span>
            </div>
            <div className="sa-int-rule-row__bar">
                <div className="sa-int-rule-row__bar-on" style={{ width: onPct + "%" }} />
            </div>
            <div className="sa-int-rule-row__legend">
                <span className="sa-int-rule-row__on">{onPct}% on-topic · {onTopic.toLocaleString("de-DE")}</span>
                <span className="sa-int-rule-row__off">{offPct}% off-topic · {offTopic.toLocaleString("de-DE")}</span>
            </div>
        </div>
    );
}

function InterestsPanel({ ruleInterests, topicInterests, maxTopics, detailLoading }) {
    const [tab, setTab] = useState("rules");

    const hasRules  = ruleInterests.length  > 0;
    const hasTopics = topicInterests.length > 0;
    const hasAny    = hasRules || hasTopics;

    const tabStyle = (t) => ({
        background: tab === t ? "rgba(255,255,255,0.07)" : "none",
        border: "none", cursor: "pointer", padding: "4px 10px",
        fontSize: 12, borderRadius: 4, fontWeight: tab === t ? 600 : 400,
        color: tab === t ? "rgba(240,235,225,0.9)" : "rgba(180,180,180,0.55)",
    });

    return (
        <div className="sa-panel sa-aud-interests">
            <h3 className="sa-panel__title" style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                <IconRadio className="sa-icon" /> Users by Interests
                {hasAny && (
                    <span style={{ display:"flex",gap:3,marginLeft:"auto" }}>
                        <button style={tabStyle("rules")}  onClick={() => setTab("rules")}>Rules</button>
                        <button style={tabStyle("topics")} onClick={() => setTab("topics")}>Chrome Topics</button>
                    </span>
                )}
            </h3>

            {detailLoading && !hasAny ? (
                <PanelSkeleton rows={4} />
            ) : !hasAny ? (
                <p className="sa-notice" style={{ margin:0,padding:"8px 0" }}>
                    No interest data yet. Define{" "}
                    <a href="settings" style={{ color:"rgba(139,92,246,0.9)" }}>URL-pattern rules</a>{" "}
                    to classify visitors by intent — each matched session is scored on scroll depth, time on page, pages visited, and conversions to determine whether they are genuinely on-topic or just passing through.
                </p>
            ) : tab === "rules" ? (
                detailLoading && !hasRules ? (
                    <PanelSkeleton rows={4} />
                ) : !hasRules ? (
                    <p className="sa-notice" style={{ margin:0,padding:"6px 0",fontSize:12 }}>
                        No rules configured yet. Add URL-pattern → label rules in{" "}
                        <a href="settings" style={{ color:"rgba(139,92,246,0.9)" }}>Analytics Settings</a>.
                    </p>
                ) : (
                    <div className="sa-int-rules-list">
                        {ruleInterests.map(i => <RuleInterestRow key={i.id} interest={i} />)}
                        <p style={{ fontSize:11,color:"rgba(150,150,175,0.4)",marginTop:10,lineHeight:1.5 }}>
                            On-topic = engagement score ≥ 50 · off-topic = score &lt; 50 · scored from full-consent sessions only
                        </p>
                    </div>
                )
            ) : (
                <>
                    <InterestsTable
                        max={maxTopics}
                        emptyText="No Chrome Topics data yet — appears for Chrome 115+ visitors who granted functional consent."
                        rows={topicInterests.map(i => (
                            <InterestRow key={i.topicId} label={topicLabel(i.topicId)} sessions={i.sessions} events={i.events} max={maxTopics} color="rgba(96,165,250,0.7)" badge="IAB" />
                        ))}
                    />
                    {hasTopics && (
                        <p style={{ fontSize:11,color:"rgba(150,150,175,0.45)",marginTop:8,lineHeight:1.5 }}>
                            Chrome Topics API · IAB Content Taxonomy · Chrome 115+ only · functional consent required
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

export default function AnalyticsAudience() {
    document.title = "Audience | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
        tick, data, loading, detailLoading, error, showData,
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

    const maxCountry   = useMemo(() => Math.max(...(data?.countries  || []).map(c => c.events), 1), [data]);
    const maxBrowser   = useMemo(() => Math.max(...(data?.browsers   || []).map(b => b.events), 1), [data]);
    const maxOs        = useMemo(() => Math.max(...(data?.os         || []).map(o => o.events), 1), [data]);
    const maxScreens   = useMemo(() => Math.max(...(data?.screens    || []).map(s => s.events), 1), [data]);
    const maxLang      = useMemo(() => Math.max(...(data?.languages  || []).map(l => l.events), 1), [data]);
    const maxTz        = useMemo(() => Math.max(...(data?.timezones  || []).map(t => t.events), 1), [data]);
    const deviceTotal  = useMemo(() => (data?.devices || []).reduce((s, d) => s + d.events, 0), [data]);
    const maxTopicInterests= useMemo(() => Math.max(...(data?.topicInterests || []).map(i => i.sessions || i.events), 1), [data]);

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
                            <ErrorBoundary>
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
                            </ErrorBoundary>

                            {/* New vs Returning */}
                            <ErrorBoundary>
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
                            </ErrorBoundary>

                            {/* Users by Interests — three complementary sources */}
                            <ErrorBoundary>
                                <InterestsPanel
                                    ruleInterests={data.interests || []}
                                    topicInterests={data.topicInterests || []}
                                    maxTopics={maxTopicInterests}
                                    detailLoading={detailLoading}
                                />
                            </ErrorBoundary>

                            {/* Countries */}
                            <ErrorBoundary>
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
                            </ErrorBoundary>

                            {/* Devices */}
                            <ErrorBoundary>
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
                            </ErrorBoundary>

                            {/* Browsers */}
                            <ErrorBoundary>
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
                            </ErrorBoundary>

                            {/* Operating systems */}
                            <ErrorBoundary>
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
                            </ErrorBoundary>

                            {/* Screen resolutions */}
                            {data.screens?.length > 0 && (
                                <ErrorBoundary>
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
                                </ErrorBoundary>
                            )}

                            {/* Languages */}
                            {data.languages?.length > 0 && (
                                <ErrorBoundary>
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
                                </ErrorBoundary>
                            )}

                            {/* Timezones */}
                            {data.timezones?.length > 0 && (
                                <ErrorBoundary>
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
                                </ErrorBoundary>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
