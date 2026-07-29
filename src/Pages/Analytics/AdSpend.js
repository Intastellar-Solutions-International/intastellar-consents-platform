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

// Fixed categorical order, not brand colors — Google/LinkedIn/Microsoft all
// trend blue, so using real brand hues would make three of four series hard
// to tell apart. Assigned in this stable order regardless of which platforms
// are actually connected; legend maps color -> label.
const CHART_COLOR_ORDER = ["google_ads", "meta_ads", "linkedin_ads", "microsoft_ads"];
const CHART_COLORS = {
    google_ads:    "#3987e5",
    meta_ads:      "#199e70",
    linkedin_ads:  "#c98500",
    microsoft_ads: "#9085e9",
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

// Stacked bar-per-day chart for one currency group's platforms — same SVG
// structure as the DailyChart in Pages/Analytics/index.js, generalized from
// 2 fixed series to N dynamic platform series. Kept to one currency's
// platforms per chart instance so bars never stack amounts across
// incompatible currencies (same principle as the "group by currency" KPI).
function AdSpendChart({ daily, platformIds, currency }) {
    const W = 600, H = 160, PAD = { t: 10, r: 8, b: 28, l: 40 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    const orderedPlatforms = CHART_COLOR_ORDER.filter(p => platformIds.includes(p));

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">No data for this period</div>;

    const maxVal = Math.max(
        ...daily.map(d => orderedPlatforms.reduce((sum, p) => sum + (d.byPlatform?.[p] || 0), 0)),
        1
    );
    const barW = Math.max(2, Math.floor(cW / daily.length) - 2);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

    return (
        <div className="sa-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                {yTicks.map((v, i) => {
                    const y = PAD.t + cH - (v / maxVal) * cH;
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.l - 4} y={y + 4} textAnchor="end"
                                fontSize="9" fill="rgba(160,160,160,0.6)">{v}</text>
                        </g>
                    );
                })}

                {daily.map((d, i) => {
                    const x = PAD.l + (i / daily.length) * cW + (cW / daily.length - barW) / 2;
                    let yOffset = PAD.t + cH;
                    return (
                        <g key={d.date}>
                            {orderedPlatforms.map(p => {
                                const v = d.byPlatform?.[p] || 0;
                                const h = (v / maxVal) * cH;
                                yOffset -= h;
                                return (
                                    <rect key={p} x={x} y={yOffset} width={barW} height={h}
                                        fill={CHART_COLORS[p]} rx="1" />
                                );
                            })}
                        </g>
                    );
                })}

                {[0, Math.floor(daily.length / 2), daily.length - 1]
                    .filter((v, i, a) => a.indexOf(v) === i && v < daily.length)
                    .map(i => {
                        const d = daily[i];
                        const x = PAD.l + (i / daily.length) * cW + (cW / daily.length) / 2;
                        return (
                            <text key={d.date} x={x} y={H - PAD.b + 14}
                                textAnchor="middle" fontSize="9" fill="rgba(160,160,160,0.7)">
                                {d.date.slice(5)}
                            </text>
                        );
                    })
                }
            </svg>
            <div className="sa-chart__legend">
                {orderedPlatforms.map(p => (
                    <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginRight: "12px" }}>
                        <span className="sa-chart__legend-dot" style={{ background: CHART_COLORS[p] }} />
                        {platformLabel(p)}
                    </span>
                ))}
                <span style={{ marginLeft: "auto", color: "rgba(160,160,160,0.6)" }}>{currency}</span>
            </div>
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

    // Group platforms by currency so the spend chart never stacks amounts
    // across incompatible currencies inside a single bar.
    const currencyGroups = useMemo(() => {
        const map = new Map();
        for (const p of (data?.platforms || [])) {
            if (!map.has(p.currency)) map.set(p.currency, []);
            map.get(p.currency).push(p.platform);
        }
        return Array.from(map.entries());
    }, [data]);

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
                                value="—"
                                sub="coming soon"
                            />

                            <div className="sa-chart-section sa-as-chart">
                                <h3 className="sa-chart-section__title">
                                    <IconTrendingUp className="sa-icon" /> Spend per day
                                </h3>
                                {currencyGroups.length === 0 && (
                                    <div className="sa-chart sa-chart--empty">No data for this period</div>
                                )}
                                {currencyGroups.map(([currency, platformIds]) => (
                                    <AdSpendChart key={currency} daily={data.daily} platformIds={platformIds} currency={currency} />
                                ))}
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
