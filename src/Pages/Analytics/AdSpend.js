const { useState, useEffect, useContext, useMemo, useCallback } = React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
import { DomainContext } from "../../App.js";
import {
    useSyncDomainFromRoute, isCombinedOrClearDomain, toDomainsApiHeader, analyticsMarketingPath,
    consentsDomainFromRoute,
} from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import {
    authHeaders, toIsoDate, KpiCard, MiniBar, formatCurrency, formatCount, formatPercent,
    useCompareRange, usePrevRange, pctChange,
} from "./_shared.js";
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

const DISPLAY_CURRENCIES = ["EUR", "USD", "GBP", "DKK", "SEK", "NOK", "CHF"];
const CURRENCY_PREFS_KEY = "ia_ad_display_currency";

function readStoredCurrency() {
    try { return localStorage.getItem(CURRENCY_PREFS_KEY) || "EUR"; } catch { return "EUR"; }
}
function storeDisplayCurrency(c) {
    try { localStorage.setItem(CURRENCY_PREFS_KEY, c); } catch {}
}

function platformLabel(id) {
    return PLATFORM_LABELS[id] || id;
}

// One line per ad platform from cron-ad-sync's results — says what actually
// happened (days added / nothing new / the error) instead of a bare count,
// which used to read "Synced 2 platform(s)" while one had saved nothing.
function summarizeSync(results) {
    const rows = (results || []).filter(r => PLATFORM_LABELS[r.platform]);
    if (!rows.length) return [{ text: "No ad platforms to sync.", isError: false }];
    return rows.map(r => {
        const label = platformLabel(r.platform);
        switch (r.status) {
            case "synced":     return { text: `${label}: ${r.daysSaved} day${r.daysSaved === 1 ? "" : "s"} added`, isError: false };
            case "no-data":    return { text: `${label}: no data returned for this period`, isError: false };
            case "up-to-date": return { text: `${label}: up to date`, isError: false };
            case "skipped":    return { text: `${label}: outside the platform's history window`, isError: false };
            case "error":      return { text: `${label}: ${r.error || "sync failed"}`, isError: true };
            default:           return { text: `${label}: ${r.status}`, isError: false };
        }
    });
}

function useAdSpendReport(domainsHeaderValue, fromIso, toIso, displayCurrency, tick = 0) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        let ignore = false;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ from: fromIso, to: toIso, ...(displayCurrency ? { displayCurrency } : {}) }).toString();
        fetch(`${ScannerHost}/api/ad-spend-report?${qs}`, {
            headers: { ...authHeaders(), Domains: domainsHeaderValue },
        })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                if (!ignore) setData(json);
            })
            .catch(() => { if (!ignore) setError("Could not load ad spend data."); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domainsHeaderValue, fromIso, toIso, displayCurrency, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, error };
}

// Live per-campaign numbers (api/ad-campaign-report.js) — not cached like
// ad_daily_data, so it's slower and only fetched for a single domain.
function useCampaignReport(domain, fromIso, toIso, displayCurrency, tick = 0) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, fromDate: fromIso, toDate: toIso, ...(displayCurrency ? { displayCurrency } : {}) }).toString();
        fetch(`${ScannerHost}/api/ad-campaign-report?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                if (!ignore) setData(await r.json());
            })
            .catch(() => { if (!ignore) setData({ error: true, platforms: [] }); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso, displayCurrency, tick]);

    return { data, loading };
}

// Cost-efficiency ratios from raw totals; null where the denominator is 0
// so the UI shows "—" instead of Infinity/NaN.
function efficiency({ spend = 0, clicks = 0, impressions = 0 }) {
    return {
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
        cpc: clicks > 0 ? spend / clicks : null,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    };
}

// Sums a report's platforms into one { spend, clicks, impressions } total.
// Only meaningful when every platform is in the same (display) currency.
function sumPlatforms(platforms) {
    return (platforms || []).reduce((t, p) => ({
        spend:       t.spend + Number(p.amount || 0),
        clicks:      t.clicks + Number(p.clicks || 0),
        impressions: t.impressions + Number(p.impressions || 0),
    }), { spend: 0, clicks: 0, impressions: 0 });
}

const CAMPAIGN_PAGE = 15;

function CampaignTable({ report, loading, isCombined }) {
    const [showAll, setShowAll] = useState(false);

    const rows = useMemo(() => {
        const all = [];
        for (const p of report?.platforms || []) {
            for (const c of p.campaigns || []) {
                // Platforms also list paused/idle campaigns with all-zero metrics
                if (!(c.spend || c.clicks || c.impressions)) continue;
                all.push({ ...c, platform: p.platform });
            }
        }
        return all.sort((a, b) => (b.spend || 0) - (a.spend || 0));
    }, [report]);
    const failed = (report?.platforms || []).filter(p => p.error);
    const maxSpend = Math.max(...rows.map(r => r.spend || 0), 1);
    const visible = showAll ? rows : rows.slice(0, CAMPAIGN_PAGE);

    return (
        <div className="sa-panel sa-as-campaigns">
            <h3 className="sa-panel__title"><IconTarget className="sa-icon" /> Campaigns</h3>
            {isCombined ? (
                <p className="sa-as-note">Select a domain to see its campaigns — they're fetched live per ad account.</p>
            ) : loading ? (
                <p className="sa-as-note">Loading campaigns from the ad platforms&hellip;</p>
            ) : report?.error ? (
                <p className="sa-as-note sa-as-note--error">Could not load campaigns.</p>
            ) : (
                <>
                    {failed.map(p => (
                        <p key={p.platform} className="sa-as-note sa-as-note--error">
                            {platformLabel(p.platform)}: {p.error}
                        </p>
                    ))}
                    <div className="sa-as-table-scroll">
                        <table className="sa-table">
                            <thead>
                                <tr>
                                    <th>Campaign</th>
                                    <th>Platform</th>
                                    <th className="sa-table__num">Spend</th>
                                    <th className="sa-table__num">Clicks</th>
                                    <th className="sa-table__num">Impr.</th>
                                    <th className="sa-table__num">CTR</th>
                                    <th className="sa-table__num">CPC</th>
                                    <th className="sa-table__bar" />
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(c => {
                                    const e = efficiency(c);
                                    return (
                                        <tr key={`${c.platform}:${c.id}`}>
                                            <td className="sa-table__path" title={c.name}>
                                                {c.name}
                                                {c.status && !/^(enabled|active)$/i.test(c.status) && (
                                                    <span className="sa-as-status">{String(c.status).toLowerCase()}</span>
                                                )}
                                            </td>
                                            <td className="sa-as-muted">{platformLabel(c.platform)}</td>
                                            <td className="sa-table__num">{formatCurrency(c.spend, c.currency)}</td>
                                            <td className="sa-table__num">{formatCount(c.clicks)}</td>
                                            <td className="sa-table__num">{formatCount(c.impressions)}</td>
                                            <td className="sa-table__num">{formatPercent(e.ctr, 2)}</td>
                                            <td className="sa-table__num">{e.cpc != null ? formatCurrency(e.cpc, c.currency) : "—"}</td>
                                            <td className="sa-table__bar">
                                                <MiniBar value={c.spend || 0} max={maxSpend} />
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!rows.length && (
                                    <tr><td colSpan={8} className="sa-as-muted">No campaigns with activity in this period</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > CAMPAIGN_PAGE && (
                        <button type="button" className="sa-as-more-btn" onClick={() => setShowAll(v => !v)}>
                            {showAll ? "Show top " + CAMPAIGN_PAGE : `Show all ${rows.length} campaigns`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
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
// CMP's validated multi-series chart palette (--c-data, --c-data-2,
// --c-data-3 in src/styles/tokens.css), so the three lines stay distinct.
const CHANNEL_METRICS = [
    { key: "spend",       label: "Spend",       color: "rgb(var(--c-data))" },
    { key: "clicks",      label: "Clicks",      color: "rgb(var(--c-data-2))" },
    { key: "impressions", label: "Impressions", color: "rgb(var(--c-data-3))" },
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
        if (key === "spend") return formatCurrency(v, currency);
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
                    <span className="sa-channel-tile__value">{cpc != null ? formatCurrency(cpc, currency) : "—"}</span>
                </div>
            </div>
            {series.length ? (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                    {CHANNEL_METRICS.filter(m => m.key !== active).map(m => (
                        <polyline key={m.key} points={pointsFor(m.key)} fill="none"
                            style={{ stroke: m.color }} strokeOpacity="0.25" strokeWidth="1.5" />
                    ))}
                    {(() => {
                        const m = CHANNEL_METRICS.find(x => x.key === active);
                        // stroke via style: SVG presentation attributes don't resolve var()
                        return <polyline points={pointsFor(active)} fill="none" style={{ stroke: m.color }} strokeWidth="2.5" />;
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

    // Resolved directly from the URL :handle during render, not from
    // globalDomain alone — useSyncDomainFromRoute's effect (which corrects
    // globalDomain from the URL) only takes effect on the *next* render, so
    // reading globalDomain directly here could still be the pre-correction
    // value. consentsDomainFromRoute reads the handle synchronously and only
    // falls back to context when there's no handle at all (matching the
    // pattern MarketingReport already uses for the same combined/per-domain
    // toggle).
    const resolvedDomain = consentsDomainFromRoute(handle, globalDomain);
    const isCombined = isCombinedOrClearDomain(resolvedDomain);
    const domainsHeaderValue = useMemo(() => toDomainsApiHeader(resolvedDomain), [resolvedDomain]);
    const domainLabel = isCombined ? null : String(resolvedDomain || "").trim().toLowerCase();

    const [getLastDays, setLastDays] = useState(30);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d;
    });
    const [toDate, setToDate] = useState(() => new Date());

    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const [displayCurrency, setDisplayCurrency] = useState(readStoredCurrency);
    const changeCurrency = useCallback(c => { storeDisplayCurrency(c); setDisplayCurrency(c); }, []);

    const [tick, setTick] = useState(0);
    const { data, loading, error } = useAdSpendReport(domainsHeaderValue, fromIso, toIso, displayCurrency, tick);

    // Compare-to-previous-period header wiring (Phase 3, docs/design-audit-plan.md)
    // — same shared hook as every other Analytics page (_shared.js). The
    // previous period defaults to the same-length window right before the
    // selected one; the header's compare control overrides it.
    const compare = useCompareRange();
    const prevRange = usePrevRange(fromDate, toDate, compare);
    const { data: prevData } = useAdSpendReport(domainsHeaderValue, prevRange.fromIso, prevRange.toIso, displayCurrency, tick);
    const compareLabel = compare.compareActive ? "vs comparison period" : "vs previous period";

    const { data: campaignData, loading: campaignsLoading } =
        useCampaignReport(domainLabel, fromIso, toIso, displayCurrency, tick);

    // Every amount is in displayCurrency (the API converts), so totals and
    // ratios can be summed across platforms.
    const totals     = useMemo(() => sumPlatforms(data?.platforms), [data]);
    const prevTotals = useMemo(() => sumPlatforms(prevData?.platforms), [prevData]);
    const eff     = efficiency(totals);
    const prevEff = efficiency(prevTotals);
    const cac     = data?.blendedCac?.[0]?.cac ?? null;
    const prevCac = prevData?.blendedCac?.[0]?.cac ?? null;
    const prevByPlatform = useMemo(
        () => new Map((prevData?.platforms || []).map(p => [p.platform, p])),
        [prevData]
    );
    const delta = (cur, prev, invert = false) => {
        const value = pctChange(cur, prev);
        return value == null ? undefined : { value, invert, label: compareLabel };
    };

    const maxPlatform = useMemo(() => Math.max(...(data?.platforms || []).map(p => p.amount), 1), [data]);
    const maxDomain   = useMemo(() => Math.max(...(data?.byDomain  || []).map(d => d.amount), 1), [data]);

    const showData = !loading && data && !data.noConnections;

    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState(null);

    const handleSync = useCallback(async () => {
        if (!domainLabel || syncing) return;
        setSyncing(true);
        setSyncMsg(null);
        try {
            const qs = new URLSearchParams({ domain: domainLabel, fromDate: fromIso, toDate: toIso }).toString();
            const r = await fetch(`${ScannerHost}/api/cron-ad-sync?${qs}`, { headers: authHeaders() });
            const json = await r.json().catch(() => ({}));
            if (!r.ok) { setSyncMsg([{ text: json.error || `Sync failed (${r.status}).`, isError: true }]); }
            else {
                setSyncMsg(summarizeSync(json.results));
                setTick(t => t + 1);
            }
        } catch { setSyncMsg([{ text: "Sync failed — check your connection.", isError: true }]); }
        finally { setSyncing(false); }
    }, [domainLabel, syncing, fromIso, toIso]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title="Ad Spend"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={compare.previousPeriod}
                previousPeriod2={compare.previousPeriod2}
                compareRange={compare.compareRange}
                setCompareRange={compare.setCompareRange}
                setCompareWindowStart={compare.setCompareWindowStart}
                setCompareWindowEnd={compare.setCompareWindowEnd}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {loading && <p className="sa-notice">Loading&hellip;</p>}
                    {error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {!loading && data?.noConnections && <AdSpendSetupCard domain={domainLabel} />}

                    {showData && (
                        <div className="sa-as-toolbar">
                            {/* Currency picker */}
                            <div className="sa-currency-picker">
                                {DISPLAY_CURRENCIES.map(c => (
                                    <button
                                        key={c}
                                        className={"sa-currency-btn" + (displayCurrency === c ? " sa-currency-btn--active" : "")}
                                        onClick={() => changeCurrency(c)}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                            {/* Sync button (domain-scoped only) */}
                            {domainLabel && (
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <button className="sa-as-sync-btn" onClick={handleSync} disabled={syncing}>
                                        {syncing ? "Syncing…" : "Sync data now"}
                                    </button>
                                    {syncMsg && (
                                        <ul className="sa-as-sync-msg" aria-live="polite">
                                            {syncMsg.map((m, i) => (
                                                <li key={i} className={m.isError ? "sa-as-sync-msg__item--error" : undefined}>{m.text}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {showData && (
                        <div className={"sa-as-grid" + (isCombined ? " sa-as-grid--combined" : "")}>

                            {/* Spend uses the plain up/down trend chip; the rest
                                use delta, with cost metrics inverted so cheaper
                                reads as good. */}
                            <KpiCard className="sa-as-kpi0"
                                icon={<IconCash />}
                                label="Total spend"
                                value={data.spendByCurrency.length
                                    ? data.spendByCurrency.map(c => formatCurrency(c.amount, c.currency)).join(" · ")
                                    : "—"}
                                trend={pctChange(totals.spend, prevTotals.spend)}
                                sub={`${isCombined ? "across all domains" : domainLabel} · ${data.platforms.map(p => platformLabel(p.platform)).join(", ") || "no spend"}`}
                            />
                            <KpiCard className="sa-as-kpi1"
                                icon={<IconTrendingUp />}
                                label="Clicks"
                                value={formatCount(totals.clicks)}
                                delta={delta(totals.clicks, prevTotals.clicks)}
                                sub={`CTR ${formatPercent(eff.ctr, 2)} · ${formatCount(totals.impressions)} impressions`}
                            />
                            <KpiCard className="sa-as-kpi2"
                                icon={<IconGlobe />}
                                label="Avg. cost per click"
                                value={eff.cpc != null ? formatCurrency(eff.cpc, displayCurrency) : "—"}
                                delta={delta(eff.cpc, prevEff.cpc, true)}
                                sub={`CPM ${eff.cpm != null ? formatCurrency(eff.cpm, displayCurrency) : "—"}`}
                            />
                            <KpiCard className="sa-as-kpi3"
                                icon={<IconTarget />}
                                label="Blended CAC"
                                value={data.blendedCac?.length
                                    ? data.blendedCac.map(c => c.cac != null ? formatCurrency(c.cac, c.currency) : "—").join(" · ")
                                    : "—"}
                                delta={delta(cac, prevCac, true)}
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
                                <h3 className="sa-panel__title"><IconCash className="sa-icon" /> Platform comparison</h3>
                                <div className="sa-as-table-scroll">
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Platform</th>
                                                <th className="sa-table__num">Spend</th>
                                                <th className="sa-table__num">Share</th>
                                                <th className="sa-table__num">Clicks</th>
                                                <th className="sa-table__num">CTR</th>
                                                <th className="sa-table__num">CPC</th>
                                                <th className="sa-table__num">CPM</th>
                                                <th className="sa-table__num" title={compareLabel}>Δ spend</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.platforms.map(p => {
                                                const e = efficiency({ spend: p.amount, clicks: p.clicks, impressions: p.impressions });
                                                const prev = prevByPlatform.get(p.platform);
                                                const change = pctChange(p.amount, prev?.amount);
                                                return (
                                                    <tr key={p.platform}>
                                                        <td>{platformLabel(p.platform)}</td>
                                                        <td className="sa-table__num">{formatCurrency(p.amount, p.currency)}</td>
                                                        <td className="sa-table__num">{formatPercent(totals.spend > 0 ? (p.amount / totals.spend) * 100 : null)}</td>
                                                        <td className="sa-table__num">{formatCount(p.clicks)}</td>
                                                        <td className="sa-table__num">{formatPercent(e.ctr, 2)}</td>
                                                        <td className="sa-table__num">{e.cpc != null ? formatCurrency(e.cpc, p.currency) : "—"}</td>
                                                        <td className="sa-table__num">{e.cpm != null ? formatCurrency(e.cpm, p.currency) : "—"}</td>
                                                        <td className="sa-table__num sa-as-muted">
                                                            {change == null ? "new" : `${change >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(change))}`}
                                                        </td>
                                                        <td className="sa-table__bar">
                                                            <MiniBar value={p.amount} max={maxPlatform} />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {!data.platforms.length && (
                                                <tr><td colSpan={9} className="sa-as-muted">No data yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
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
                                                    <td className="sa-table__num">{formatCurrency(d.amount, d.currency)}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={d.amount} max={maxDomain} />
                                                    </td>
                                                </tr>
                                            ))}
                                            {!(data.byDomain || []).length && (
                                                <tr><td colSpan={3} className="sa-as-muted">No data yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <CampaignTable report={campaignData} loading={campaignsLoading} isCombined={isCombined} />

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
