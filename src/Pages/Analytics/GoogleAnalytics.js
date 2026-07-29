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
import { authHeaders, toIsoDate, KpiCard } from "./_shared.js";
import { IconBarChart, IconMegaphone, IconCash } from "./Icons.js";
import { Ga4SessionsChart } from "./GoogleAnalyticsChart.js";
import "./Analytics.css";

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr", PLN: "zł" };

function formatMoney(n, currency) {
    const symbol = CURRENCY_SYMBOLS[currency] || (currency ? currency + " " : "");
    return `${symbol} ${Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/*
 * GA4 connection + daily-sessions fetch, scoped to a single domain (GA4
 * connections are per-domain OAuth grants, so there's no meaningful
 * "combined view" the way first-party analytics has one).
 */
function useGa4Report(domain, fromDate, toDate) {
    const [state, setState] = useState({ checked: false, connected: false, rows: null, platformBreakdown: null, summary: null, channelBreakdown: null, loading: false });

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
                const hasGa4 = (data?.connections || []).some(c => c.platform === "google_analytics" && c.account_id);
                if (!hasGa4) {
                    setState({ checked: true, connected: false, rows: null, platformBreakdown: null, summary: null, channelBreakdown: null, loading: false });
                    return null;
                }
                const qs = `platform=google_analytics&domain=${encodeURIComponent(domain)}&fromDate=${fromYmd}&toDate=${toYmd2}`;
                return fetch(`${ScannerHost}/api/ad-daily-data?${qs}`, { headers }).then(r => r.ok ? r.json() : null);
            })
            .then(daily => {
                if (cancelled || !daily) return;
                setState({
                    checked: true,
                    connected: true,
                    rows: daily.rows || [],
                    platformBreakdown: daily.platformBreakdown || null,
                    summary: daily.summary || null,
                    channelBreakdown: daily.channelBreakdown || null,
                    loading: false,
                });
            })
            .catch(() => { if (!cancelled) setState(s => ({ ...s, checked: true, loading: false })); });

        return () => { cancelled = true; };
    }, [domain, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

    return state;
}

/* Real per-campaign performance from connected ad accounts (Google Ads today). */
function useCampaignReport(domain, fromIso, toIso) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, fromDate: fromIso, toDate: toIso }).toString();
        fetch(`${ScannerHost}/api/ad-campaign-report?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                if (!ignore) setData(await r.json());
            })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso]);

    return { data, loading };
}

function CampaignsPanel({ data, loading, domain }) {
    if (!domain) return null;

    if (loading && !data) {
        return (
            <div className="sa-panel">
                <h3 className="sa-panel__title"><IconMegaphone className="sa-icon" /> Campaigns</h3>
                <p className="sa-notice">Loading&hellip;</p>
            </div>
        );
    }

    if (!data || data.noConnections) {
        return (
            <div className="sa-panel">
                <h3 className="sa-panel__title"><IconMegaphone className="sa-icon" /> Campaigns</h3>
                <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.82rem", margin: 0 }}>
                    No ad platforms connected for this domain. <Link to={analyticsMarketingPath(domain)}>Connect an ad account</Link> to see
                    real per-campaign performance here.
                </p>
            </div>
        );
    }

    return (
        <>
            {data.platforms.map(p => (
                <div className="sa-panel" key={p.platform}>
                    <h3 className="sa-panel__title">
                        <IconMegaphone className="sa-icon" /> Campaigns — {p.platform.replace(/_/g, " ")}
                    </h3>
                    {!p.supported && (
                        <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.82rem", margin: 0 }}>
                            Per-campaign data isn't available for this platform yet.
                        </p>
                    )}
                    {p.supported && p.error && (
                        <p className="sa-notice sa-notice--error">{p.error}</p>
                    )}
                    {p.supported && !p.error && (
                        <table className="sa-table">
                            <thead>
                                <tr>
                                    <th>Campaign</th>
                                    <th className="sa-table__num">Clicks</th>
                                    <th className="sa-table__num">Impressions</th>
                                    <th className="sa-table__num">Spend</th>
                                    <th className="sa-table__num">CPC</th>
                                </tr>
                            </thead>
                            <tbody>
                                {p.campaigns.map(c => (
                                    <tr key={c.id}>
                                        <td className="sa-table__path" title={c.name}>{c.name}</td>
                                        <td className="sa-table__num">{c.clicks.toLocaleString("de-DE")}</td>
                                        <td className="sa-table__num">{c.impressions.toLocaleString("de-DE")}</td>
                                        <td className="sa-table__num">{formatMoney(c.spend, c.currency)}</td>
                                        <td className="sa-table__num">
                                            {c.clicks > 0 ? formatMoney(c.spend / c.clicks, c.currency) : "—"}
                                        </td>
                                    </tr>
                                ))}
                                {!p.campaigns.length && (
                                    <tr><td colSpan={5} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No campaigns with activity in this period</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            ))}
        </>
    );
}

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

    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const ga4 = useGa4Report(domain, fromDate, toDate);
    const campaigns = useCampaignReport(domain, fromIso, toIso);

    const totalCampaignSpend = useMemo(() => {
        if (!campaigns.data?.platforms) return null;
        const byCurrency = new Map();
        for (const p of campaigns.data.platforms) {
            for (const c of (p.campaigns || [])) {
                const cur = c.currency || "EUR";
                byCurrency.set(cur, (byCurrency.get(cur) || 0) + (Number(c.spend) || 0));
            }
        }
        return [...byCurrency.entries()];
    }, [campaigns.data]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Google Analytics 4"
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

                    {domain && (
                        <div className="sa-ga4-stack">
                            {ga4.checked && !ga4.connected && (
                                <div className="sa-setup">
                                    <div className="sa-setup__icon"><IconBarChart /></div>
                                    <h3 className="sa-setup__title">No Google Analytics 4 property connected for <strong>{domain}</strong></h3>
                                    <p className="sa-setup__body">
                                        Connect a GA4 property to see its sessions, engagement, and channel breakdown here.
                                    </p>
                                    <Link className="sa-setup__gen-btn" to={analyticsMarketingPath(domain)}>
                                        Connect Google Analytics
                                    </Link>
                                </div>
                            )}

                            {(ga4.connected || ga4.loading) && (
                                <Ga4SessionsChart
                                    rows={ga4.rows || []}
                                    platformBreakdown={ga4.platformBreakdown}
                                    summary={ga4.summary}
                                    channelBreakdown={ga4.channelBreakdown}
                                    syncing={ga4.loading}
                                />
                            )}

                            {totalCampaignSpend && totalCampaignSpend.length > 0 && (
                                <KpiCard
                                    icon={<IconCash />}
                                    label="Ad spend (connected campaigns)"
                                    value={totalCampaignSpend.map(([cur, amt]) => formatMoney(amt, cur)).join(" · ")}
                                    sub={`${fromIso} – ${toIso}`}
                                />
                            )}

                            <CampaignsPanel data={campaigns.data} loading={campaigns.loading} domain={domain} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
