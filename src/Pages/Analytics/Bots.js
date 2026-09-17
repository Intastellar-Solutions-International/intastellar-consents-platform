const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome, KpiCard, MiniBar } from "./_shared.js";
import { IconBot, IconGlobe, IconDocument, IconRadio, IconAlertTriangle } from "./Icons.js";
import "./Analytics.css";

const BOTS_URL = `${ScannerHost}/api/analytics-bots`;

const CATEGORY_LABELS = {
    ai_crawler:      "AI crawler",
    search_engine:   "Search engine",
    social_preview:  "Social preview",
    seo_tool:        "SEO tool",
    data_aggregator: "Data aggregator",
    uptime_monitor:  "Uptime monitor",
    other:           "Other",
};

function timeAgo(isoString) {
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (diff < 60) return diff + "s";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    return Math.floor(diff / 3600) + "h";
}

const TABLE_PAGE_SIZE = 10;

// Client-side pager for a table's data array — the bot API already caps each
// list at a sane size (top 15-30), so paging in the browser avoids adding
// page/limit params to every query on the backend for what's a UI-only need.
function usePager(items, resetA, resetB, resetC) {
    const [page, setPage] = useState(0);
    useEffect(() => { setPage(0); }, [resetA, resetB, resetC]);
    const pageCount = Math.max(1, Math.ceil((items?.length || 0) / TABLE_PAGE_SIZE));
    const paged = useMemo(
        () => (items || []).slice(page * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE),
        [items, page]
    );
    return { page, setPage, pageCount, paged };
}

function Pager({ page, pageCount, onChange }) {
    if (pageCount <= 1) return null;
    return (
        <div className="sa-pager">
            <button
                className="sa-btn sa-btn--sm sa-btn--ghost"
                onClick={() => onChange(Math.max(0, page - 1))}
                disabled={page === 0}
            >
                Prev
            </button>
            <span className="sa-pager__label">Page {page + 1} of {pageCount}</span>
            <button
                className="sa-btn sa-btn--sm sa-btn--ghost"
                onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
                disabled={page >= pageCount - 1}
            >
                Next
            </button>
        </div>
    );
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

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading, error } = useBotReport(domain, fromIso, toIso);

    const bots       = usePager(data?.topBots,             domain, fromIso, toIso);
    const asns       = usePager(data?.topAsns,              domain, fromIso, toIso);
    const suspicious = usePager(data?.suspicious?.byOrg,    domain, fromIso, toIso);
    const pages      = usePager(data?.topPages,             domain, fromIso, toIso);

    const maxCategory = useMemo(() => Math.max(...(data?.byCategory || []).map(c => c.n), 1), [data]);
    const maxBot       = useMemo(() => Math.max(...(data?.topBots    || []).map(b => b.n), 1), [data]);
    const maxPage      = useMemo(() => Math.max(...(data?.topPages   || []).map(p => p.n), 1), [data]);
    const maxAsn        = useMemo(() => Math.max(...(data?.topAsns         || []).map(a => a.n), 1), [data]);
    const maxSuspicious = useMemo(() => Math.max(...(data?.suspicious?.byOrg || []).map(o => o.n), 1), [data]);

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
                        <p className="sa-notice">No known bot/crawler or suspicious hosting-IP traffic detected in this period — real visitor numbers elsewhere are unaffected either way.</p>
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
                                            <th>Hosts contacted</th>
                                            <th className="sa-table__num">Hits</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bots.paged.map(b => (
                                            <tr key={b.name}>
                                                <td>{b.name}</td>
                                                <td style={{ color: "rgba(150,150,150,0.7)", fontSize: "0.78rem" }}>
                                                    {CATEGORY_LABELS[b.category] || b.category}
                                                </td>
                                                <td style={{ fontSize: "0.78rem", color: "rgba(150,150,150,0.85)" }}>
                                                    {b.hosts && b.hosts.length
                                                        ? b.hosts.join(", ")
                                                        : <span style={{ color: "rgba(130,130,130,0.4)" }}>—</span>}
                                                </td>
                                                <td className="sa-table__num">{b.n.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={b.n} max={maxBot} />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.topBots.length && (
                                            <tr><td colSpan={5} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No bot hits recorded</td></tr>
                                        )}
                                    </tbody>
                                </table>
                                <Pager page={bots.page} pageCount={bots.pageCount} onChange={bots.setPage} />
                            </div>

                            <div className="sa-panel sa-bots-asns">
                                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Top hosting providers (bots)</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>ASN organisation</th>
                                            <th className="sa-table__num">Bots</th>
                                            <th className="sa-table__num">Hits</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {asns.paged.map(a => (
                                            <tr key={a.org}>
                                                <td>{a.org}</td>
                                                <td className="sa-table__num">{a.uniqueBots}</td>
                                                <td className="sa-table__num">{a.n.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={a.n} max={maxAsn} color="rgba(103,178,255,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.topAsns.length && (
                                            <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No hosting-provider data yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                                <Pager page={asns.page} pageCount={asns.pageCount} onChange={asns.setPage} />
                            </div>

                            <div className="sa-panel sa-bots-suspicious">
                                <h3 className="sa-panel__title"><IconAlertTriangle className="sa-icon" /> Suspicious traffic</h3>
                                <p style={{ color: "rgba(150,150,150,0.75)", fontSize: "0.78rem", margin: "0 0 10px" }}>
                                    {data.suspicious.total.toLocaleString("de-DE")} hit{data.suspicious.total === 1 ? "" : "s"} from a hosting/datacenter
                                    network with a normal browser UA — not diverted from your visitor counts, just worth a look.
                                </p>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Hosting provider</th>
                                            <th className="sa-table__num">Hits</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {suspicious.paged.map(o => (
                                            <tr key={o.org + o.asn}>
                                                <td>{o.org}{o.asn ? <span style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.74rem" }}> &middot; AS{o.asn}</span> : null}</td>
                                                <td className="sa-table__num">{o.n.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={o.n} max={maxSuspicious} color="rgba(240,138,93,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.suspicious.byOrg.length && (
                                            <tr><td colSpan={3} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No suspicious hosting-IP traffic detected</td></tr>
                                        )}
                                    </tbody>
                                </table>
                                <Pager page={suspicious.page} pageCount={suspicious.pageCount} onChange={suspicious.setPage} />
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
                                        {pages.paged.map(p => (
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
                                <Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />
                            </div>

                            <div className="sa-panel sa-bots-recent">
                                <h3 className="sa-panel__title"><IconRadio className="sa-icon" /> Recent hits</h3>
                                <div className="sa-live__feed">
                                    {data.recent.map((e, i) => (
                                        <div key={i} className="sa-live__event">
                                            <span className="sa-live__event-path">{e.name} &middot; {e.pathname}</span>
                                            <div className="sa-live__event-meta">
                                                {e.host && (
                                                    <span className="sa-live__event-level" style={{ fontFamily: "monospace", fontSize: "0.74rem", opacity: 0.75 }}>
                                                        {e.host}
                                                    </span>
                                                )}
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
