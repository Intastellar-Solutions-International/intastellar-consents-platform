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
import { toIsoDate, KpiCard, formatPercent } from "./_shared.js";
import { IconTrendingUp, IconGlobe, IconTarget } from "./Icons.js";
import TrendLineChart from "./TrendLineChart.js";
import "./Analytics.css";

/*
 * Search Console connection + daily clicks/impressions/position fetch —
 * same two-step shape as GoogleAnalytics.js's useGa4Report (check
 * ad-connections for a live account, then pull the cached/live daily rows),
 * plus topQueries/topPages which ad-daily-data.js only populates for this
 * platform (fetched live there, see that file's fetchGSCDimension doc
 * comment for why those aren't cached the way the daily trend is).
 */
function useGscReport(domain, fromDate, toDate) {
    const [state, setState] = useState({
        checked: false, connected: false, rows: null,
        topQueries: null, topPages: null, loading: false,
    });

    useEffect(() => {
        if (!domain) { setState(s => ({ ...s, checked: false })); return; }
        const authToken = Authentication.getToken();
        const orgId = Authentication.getOrganisation();
        if (!authToken || !orgId) return;
        const fromYmd = toIsoDate(fromDate);
        const toYmd2 = toIsoDate(toDate);

        let cancelled = false;
        setState(s => ({ ...s, loading: true }));
        const headers = { Authorization: authToken, Organisation: String(orgId) };

        fetch(`${ScannerHost}/api/ad-connections?domain=${encodeURIComponent(domain)}`, { headers })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (cancelled) return null;
                const hasGsc = (data?.connections || []).some(c => c.platform === "google_search_console" && c.account_id);
                if (!hasGsc) {
                    setState({ checked: true, connected: false, rows: null, topQueries: null, topPages: null, loading: false });
                    return null;
                }
                const qs = `platform=google_search_console&domain=${encodeURIComponent(domain)}&fromDate=${fromYmd}&toDate=${toYmd2}`;
                return fetch(`${ScannerHost}/api/ad-daily-data?${qs}`, { headers }).then(r => r.ok ? r.json() : null);
            })
            .then(daily => {
                if (cancelled || !daily) return;
                setState({
                    checked: true,
                    connected: true,
                    rows: daily.rows || [],
                    topQueries: daily.topQueries || [],
                    topPages: daily.topPages || [],
                    loading: false,
                });
            })
            .catch(() => { if (!cancelled) setState(s => ({ ...s, checked: true, loading: false })); });

        return () => { cancelled = true; };
    }, [domain, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

    return state;
}

function DimensionTable({ icon, title, rows, keyLabel }) {
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">{icon} {title}</h3>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th>{keyLabel}</th>
                        <th className="sa-table__num">Clicks</th>
                        <th className="sa-table__num">Impressions</th>
                        <th className="sa-table__num">CTR</th>
                        <th className="sa-table__num">Avg. position</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows || []).map((r, i) => (
                        <tr key={i}>
                            <td className="sa-table__path" title={r.key}>{r.key}</td>
                            <td className="sa-table__num">{r.clicks.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{r.impressions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{formatPercent(r.ctr * 100)}</td>
                            <td className="sa-table__num">{r.position.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        </tr>
                    ))}
                    {!rows?.length && (
                        <tr><td colSpan={5} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data for this period</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default function SearchConsole() {
    document.title = "Search Console | Site Analytics";

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

    const gsc = useGscReport(domain, fromDate, toDate);

    // Avg position must be weighted by each day's impressions, not a flat
    // average across days — a day with 10 impressions at position 40 and a
    // day with 10,000 impressions at position 4 should read close to 4, not
    // 22. Matches the same weighting api/ad-daily-data.js / _ad-platform-
    // fetch.js's doc comments call for when aggregating this metric.
    const totals = useMemo(() => {
        const rows = gsc.rows || [];
        const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
        const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
        const positionWeightSum = rows.reduce((s, r) => s + ((r.avgPosition || 0) * (r.impressions || 0)), 0);
        return {
            clicks,
            impressions,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
            avgPosition: impressions > 0 ? positionWeightSum / impressions : null,
        };
    }, [gsc.rows]);

    const trendData = useMemo(() => (gsc.rows || []).map(r => ({ date: r.date, num: r.clicks })), [gsc.rows]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Search Console"
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
                        <p className="sa-notice">Select a domain in the header to view Search Console data.</p>
                    )}

                    {domain && (
                        <div className="sa-gsc-stack">
                            {gsc.checked && !gsc.connected && (
                                <div className="sa-setup">
                                    <div className="sa-setup__icon"><IconGlobe /></div>
                                    <h3 className="sa-setup__title">No Search Console property connected for <strong>{domain}</strong></h3>
                                    <p className="sa-setup__body">
                                        Connect a verified property to see organic search clicks, impressions, and ranking here.
                                    </p>
                                    <Link className="sa-setup__gen-btn" to={analyticsMarketingPath(domain)}>
                                        Connect Search Console
                                    </Link>
                                </div>
                            )}

                            {(gsc.connected || gsc.loading) && (
                                <>
                                    <div className="sa-kpi-row">
                                        <KpiCard icon={<IconTarget />} label="Clicks" value={totals.clicks.toLocaleString("de-DE")} />
                                        <KpiCard icon={<IconTrendingUp />} label="Impressions" value={totals.impressions.toLocaleString("de-DE")} />
                                        <KpiCard icon={<IconTarget />} label="Avg. CTR" value={totals.ctr != null ? formatPercent(totals.ctr) : "—"} />
                                        <KpiCard icon={<IconTrendingUp />} label="Avg. position" value={totals.avgPosition != null ? totals.avgPosition.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} />
                                    </div>

                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> Clicks over time</h3>
                                        <TrendLineChart data={trendData} title="Clicks" height={220} />
                                    </div>

                                    <DimensionTable icon={<IconTarget className="sa-icon" />} title="Top queries" rows={gsc.topQueries} keyLabel="Query" />
                                    <DimensionTable icon={<IconGlobe className="sa-icon" />} title="Top pages" rows={gsc.topPages} keyLabel="Page" />
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
