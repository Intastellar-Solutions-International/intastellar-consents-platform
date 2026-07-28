const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, toIsoDate, KpiCard, MiniBar } from "./_shared.js";
import { IconBot, IconGlobe, IconDocument, IconRadio } from "./Icons.js";
import "./Analytics.css";

const BOTS_URL = `${ScannerHost}/api/analytics-bots`;

const CATEGORY_LABELS = {
    ai_crawler:      "AI crawler",
    search_engine:   "Search engine",
    social_preview:  "Social preview",
    seo_tool:        "SEO tool",
    uptime_monitor:  "Uptime monitor",
    other:           "Other",
};

function timeAgo(isoString) {
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (diff < 60) return diff + "s";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    return Math.floor(diff / 3600) + "h";
}

function useBotReport(domain, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${BOTS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load bot traffic."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso]);

    return { data, loading, error };
}

export default function AnalyticsBots() {
    document.title = "Bots | Site Analytics";

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
    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const { data, loading, error } = useBotReport(domain, fromIso, toIso);

    const maxCategory = useMemo(() => Math.max(...(data?.byCategory || []).map(c => c.n), 1), [data]);
    const maxBot       = useMemo(() => Math.max(...(data?.topBots    || []).map(b => b.n), 1), [data]);
    const maxPage      = useMemo(() => Math.max(...(data?.topPages   || []).map(p => p.n), 1), [data]);

    const showData = !loading && data && !data.noSiteKey && !data.noData;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Bots"
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
                        <p className="sa-notice">Select a domain in the header to view bot traffic.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !loading && data?.noData && !data?.noSiteKey && (
                        <p className="sa-notice">No known bot/crawler traffic detected in this period — real visitor numbers elsewhere are unaffected either way.</p>
                    )}

                    {showData && (
                        <div className="sa-bots-grid">

                            <KpiCard className="sa-bots-kpi1"
                                icon={<IconBot />}
                                label="Bot hits"
                                value={data.totals.total.toLocaleString("de-DE")}
                                sub="excluded from all other analytics"
                            />
                            <KpiCard className="sa-bots-kpi2"
                                icon={<IconGlobe />}
                                label="Distinct bots seen"
                                value={data.totals.uniqueBots.toLocaleString("de-DE")}
                                sub="in this period"
                            />

                            <div className="sa-panel sa-bots-category">
                                <h3 className="sa-panel__title"><IconRadio className="sa-icon" /> By category</h3>
                                <div className="sa-consent-list">
                                    {data.byCategory.map(c => (
                                        <div key={c.category} className="sa-consent-row">
                                            <span className="sa-consent-row__label">{CATEGORY_LABELS[c.category] || c.category}</span>
                                            <div className="sa-bar">
                                                <div className="sa-bar__seg"
                                                    style={{ width: Math.round((c.n / maxCategory) * 100) + "%", background: "rgba(192,159,83,0.55)" }}
                                                    title={`${c.n} hits`} />
                                            </div>
                                            <span className="sa-consent-row__pct">{c.n.toLocaleString("de-DE")}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="sa-panel sa-bots-list">
                                <h3 className="sa-panel__title"><IconBot className="sa-icon" /> Top bots</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Bot</th>
                                            <th>Category</th>
                                            <th className="sa-table__num">Hits</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topBots.map(b => (
                                            <tr key={b.name}>
                                                <td>{b.name}</td>
                                                <td style={{ color: "rgba(150,150,150,0.7)", fontSize: "0.78rem" }}>
                                                    {CATEGORY_LABELS[b.category] || b.category}
                                                </td>
                                                <td className="sa-table__num">{b.n.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={b.n} max={maxBot} />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.topBots.length && (
                                            <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No bot hits recorded</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="sa-panel sa-bots-pages">
                                <h3 className="sa-panel__title"><IconDocument className="sa-icon" /> Most-crawled pages</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Page</th>
                                            <th className="sa-table__num">Hits</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topPages.map(p => (
                                            <tr key={p.pathname}>
                                                <td className="sa-table__path" title={p.pathname}>{p.pathname}</td>
                                                <td className="sa-table__num">{p.n.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={p.n} max={maxPage} color="rgba(167,139,250,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="sa-panel sa-bots-recent">
                                <h3 className="sa-panel__title"><IconRadio className="sa-icon" /> Recent hits</h3>
                                <div className="sa-live__feed">
                                    {data.recent.map((e, i) => (
                                        <div key={i} className="sa-live__event">
                                            <span className="sa-live__event-path">{e.name} &middot; {e.pathname}</span>
                                            <div className="sa-live__event-meta">
                                                {e.country && <span className="sa-live__event-flag">{e.country}</span>}
                                                <span className="sa-live__event-level sa-live__event-level--minimal">
                                                    {CATEGORY_LABELS[e.category] || e.category}
                                                </span>
                                                <span className="sa-live__event-time">{timeAgo(e.at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {!data.recent.length && (
                                        <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem", margin: 0 }}>No recent hits</p>
                                    )}
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
