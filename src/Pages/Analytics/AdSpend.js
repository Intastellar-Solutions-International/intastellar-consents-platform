const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
import { DomainContext } from "../../App.js";
import {
    useSyncDomainFromRoute, isCombinedOrClearDomain, toDomainsApiHeader, analyticsMarketingPath,
} from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, toIsoDate, KpiCard, MiniBar } from "./_shared.js";
import { IconCash, IconTarget, IconGlobe, IconTrendingUp } from "./Icons.js";
import "./Analytics.css";

// Duplicated per-file, same convention as AdConnectionManager.js/MarketingReconciliationPanel.js
// (no shared platform-constants module exists in this codebase).
const PLATFORM_LABELS = {
    google_ads:   "Google Ads",
    meta_ads:     "Meta (Facebook / Instagram)",
    linkedin_ads: "LinkedIn Ads",
    microsoft_ads: "Microsoft Ads",
};

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr", PLN: "zł" };

function formatMoney(n, currency) {
    const symbol = CURRENCY_SYMBOLS[currency] || (currency ? currency + " " : "");
    return `${symbol} ${Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function platformLabel(id) {
    return PLATFORM_LABELS[id] || id;
}

function useAdSpendReport(domainsHeaderValue, fromIso, toIso, tick = 0) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/ad-spend-report?${qs}`, {
            headers: { ...authHeaders(), Domains: domainsHeaderValue },
        })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load ad spend data."))
            .finally(() => setLoading(false));
    }, [domainsHeaderValue, fromIso, toIso, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, error };
}

function AdSpendSetupCard({ domain }) {
    return (
        <div className="sa-setup">
            <div className="sa-setup__icon"><IconCash /></div>
            <h3 className="sa-setup__title">
                No ad platforms connected{domain ? <> for <strong>{domain}</strong></> : ""}
            </h3>
            <p className="sa-setup__body">
                Connect Google Ads, Meta Ads, LinkedIn Ads, or Microsoft Ads to see combined
                spend, blended CAC, and budget pacing alerts here.
            </p>
            <Link className="sa-setup__gen-btn" to={analyticsMarketingPath(domain)}>
                Connect an ad account
            </Link>
        </div>
    );
}

// Per-channel metric card — a row of clickable KPI tiles (Spend / Clicks /
// Impressions, plus a static Cost-per-click tile) above a shared line chart.
// Clicking a tile makes that metric's line the bold/highlighted one; the
// others stay visible but dimmed. Modeled on Google Ads' own campaign-report
// widget. Each metric is normalized to its own max (0-1) before plotting —
// spend/clicks/impressions live on wildly different scales, so a shared
// literal y-axis would flatten whichever series has the smallest numbers.
const CHANNEL_METRICS = [
    { key: "spend",       label: "Spend",       color: "#3987e5" },
    { key: "clicks",      label: "Clicks",      color: "#e5484d" },
    { key: "impressions", label: "Impressions", color: "#c98500" },
];

function ChannelMetricCard({ platform, currency, totals, daily }) {
    const [active, setActive] = useState("spend");

    const series = useMemo(
        () => daily.map(d => d.byPlatform?.[platform] || { spend: 0, clicks: 0, impressions: 0 }),
        [daily, platform]
    );

    const maxByMetric = useMemo(() => {
        const m = {};
        for (const metric of CHANNEL_METRICS) {
            m[metric.key] = Math.max(...series.map(s => s[metric.key] || 0), 1);
        }
        return m;
    }, [series]);

    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : null;

    const formatTile = (key, v) => {
        if (key === "spend") return formatMoney(v, currency);
        return Math.round(v).toLocaleString("de-DE");
    };

    const W = 560, H = 140, PAD = { t: 10, r: 8, b: 8, l: 8 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

    const pointsFor = (key) => series.map((s, i) => {
        const x = PAD.l + (series.length > 1 ? (i / (series.length - 1)) * cW : cW / 2);
        const y = PAD.t + cH - ((s[key] || 0) / maxByMetric[key]) * cH;
        return `${x},${y}`;
    }).join(" ");

    return (
        <div className="sa-channel-card">
            <h4 className="sa-channel-card__title">{platformLabel(platform)}</h4>
            <div className="sa-channel-card__tiles">
                {CHANNEL_METRICS.map(m => (
                    <button
                        key={m.key}
                        type="button"
                        className={"sa-channel-tile" + (active === m.key ? " sa-channel-tile--active" : "")}
                        style={active === m.key ? { background: m.color } : undefined}
                        onClick={() => setActive(m.key)}
                    >
                        <span className="sa-channel-tile__label">{m.label}</span>
                        <span className="sa-channel-tile__value">{formatTile(m.key, totals[m.key] || 0)}</span>
                    </button>
                ))}
                <div className="sa-channel-tile sa-channel-tile--static">
                    <span className="sa-channel-tile__label">Cost / click</span>
                    <span className="sa-channel-tile__value">{cpc != null ? formatMoney(cpc, currency) : "—"}</span>
                </div>
            </div>
            {series.length ? (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                    {CHANNEL_METRICS.filter(m => m.key !== active).map(m => (
                        <polyline key={m.key} points={pointsFor(m.key)} fill="none"
                            stroke={m.color} strokeOpacity="0.25" strokeWidth="1.5" />
                    ))}
                    {(() => {
                        const m = CHANNEL_METRICS.find(x => x.key === active);
                        return <polyline points={pointsFor(active)} fill="none" stroke={m.color} strokeWidth="2.5" />;
                    })()}
                </svg>
            ) : (
                <div className="sa-chart sa-chart--empty">No data for this period</div>
            )}
        </div>
    );
}

export default function AdSpend() {
    document.title = "Ad Spend | Site Analytics";

    const { handle } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const isCombined = isCombinedOrClearDomain(globalDomain);
    const domainsHeaderValue = useMemo(() => toDomainsApiHeader(globalDomain), [globalDomain]);
    const domainLabel = isCombined ? null : String(globalDomain || "").trim().toLowerCase();

    const [getLastDays, setLastDays] = useState(30);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d;
    });
    const [toDate, setToDate] = useState(() => new Date());

    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const { data, loading, error } = useAdSpendReport(domainsHeaderValue, fromIso, toIso);

    const maxPlatform = useMemo(() => Math.max(...(data?.platforms || []).map(p => p.amount), 1), [data]);
    const maxDomain   = useMemo(() => Math.max(...(data?.byDomain  || []).map(d => d.amount), 1), [data]);

    const showData = !loading && data && !data.noConnections;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Ad Spend"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {loading && <p className="sa-notice">Loading&hellip;</p>}
                    {error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {!loading && data?.noConnections && <AdSpendSetupCard domain={domainLabel} />}

                    {showData && (
                        <div className="sa-as-grid">

                            <KpiCard className="sa-as-kpi0"
                                icon={<IconCash />}
                                label="Total spend"
                                value={data.spendByCurrency.length
                                    ? data.spendByCurrency.map(c => formatMoney(c.amount, c.currency)).join(" · ")
                                    : "—"}
                                sub={isCombined ? "across all domains" : domainLabel}
                            />
                            <KpiCard className="sa-as-kpi1"
                                icon={<IconGlobe />}
                                label="Connected platforms"
                                value={data.platforms.length}
                                sub={data.platforms.map(p => platformLabel(p.platform)).join(", ") || null}
                            />
                            <KpiCard className="sa-as-kpi2"
                                icon={<IconTarget />}
                                label="Blended CAC"
                                value={data.blendedCac?.length
                                    ? data.blendedCac.map(c => c.cac != null ? formatMoney(c.cac, c.currency) : "—").join(" · ")
                                    : "—"}
                                sub={data.conversions?.totalQualityLeads
                                    ? `spend ÷ ${data.conversions.totalQualityLeads.toLocaleString("de-DE")} ${data.conversions.source === "lead_quality" ? "quality leads" : "conversion events"}`
                                    : "no conversions tracked yet"}
                            />

                            <div className="sa-chart-section sa-as-chart">
                                <h3 className="sa-chart-section__title">
                                    <IconTrendingUp className="sa-icon" /> By channel
                                </h3>
                                {!data.platforms.length && (
                                    <div className="sa-chart sa-chart--empty">No data for this period</div>
                                )}
                                <div className="sa-channel-cards">
                                    {data.platforms.map(p => (
                                        <ChannelMetricCard
                                            key={p.platform}
                                            platform={p.platform}
                                            currency={p.currency}
                                            totals={{ spend: p.amount, clicks: p.clicks, impressions: p.impressions }}
                                            daily={data.daily}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="sa-panel sa-as-platforms">
                                <h3 className="sa-panel__title"><IconCash className="sa-icon" /> Spend by platform</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Platform</th>
                                            <th className="sa-table__num">Spend</th>
                                            <th className="sa-table__num">Clicks</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.platforms.map((p, i) => (
                                            <tr key={i}>
                                                <td>{platformLabel(p.platform)}</td>
                                                <td className="sa-table__num">{formatMoney(p.amount, p.currency)}</td>
                                                <td className="sa-table__num">{p.clicks.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={p.amount} max={maxPlatform} color="rgba(192,159,83,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.platforms.length && (
                                            <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {isCombined && (
                                <div className="sa-panel sa-as-domains">
                                    <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Spend by domain</h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Domain</th>
                                                <th className="sa-table__num">Spend</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(data.byDomain || []).map((d, i) => (
                                                <tr key={i}>
                                                    <td className="sa-table__path" title={d.domain}>{d.domain}</td>
                                                    <td className="sa-table__num">{formatMoney(d.amount, d.currency)}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={d.amount} max={maxDomain} color="rgba(99,179,237,0.55)" />
                                                    </td>
                                                </tr>
                                            ))}
                                            {!(data.byDomain || []).length && (
                                                <tr><td colSpan={3} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                            )}
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
