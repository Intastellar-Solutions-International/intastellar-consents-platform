const { useState, useEffect, useMemo, useContext, useCallback } = React;
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { defaultCompareWindowForPrimary } from "../../../components/Filter/filterDatePresets.js";
import { reportsLinks } from "../Reports";
import { DomainContext } from "../../../App.js";
import API from "../../../API/api";
import "../../Dashboard/Style.css";
import "./MarketingReport.css";
import {
    useSyncDomainFromRoute,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../../Functions/domainPathSegments.js";

const useParams = window.ReactRouterDOM.useParams;

function toYmd(d) {
    if (!d) return "";
    try {
        if (typeof d === "string") return d.split("T")[0];
        return d.toISOString().split("T")[0];
    } catch {
        return "";
    }
}

/** Accept several possible API shapes */
function extractRows(payload) {
    if (payload == null) return [];
    const root = payload.data != null ? payload.data : payload;
    if (Array.isArray(root)) return root;
    if (Array.isArray(root.rows)) return root.rows;
    if (Array.isArray(root.campaigns)) return root.campaigns;
    if (Array.isArray(root.items)) return root.items;
    if (Array.isArray(root.attribution)) return root.attribution;
    return [];
}

function extractSummary(payload) {
    if (payload == null) return null;
    const root = payload.data != null ? payload.data : payload;
    if (root && typeof root === "object" && root.summary && typeof root.summary === "object") return root.summary;
    if (root && typeof root === "object" && root.totals && typeof root.totals === "object") return root.totals;
    return null;
}

function normUtm(s) {
    return String(s ?? "")
        .trim()
        .toLowerCase();
}

/**
 * Shorten redundant Capterra UTM fragments in the campaign cell, e.g. utm_Capterra=capterra → Capterra.
 */
function simplifyCampaignDisplay(campaignRaw) {
    let t = String(campaignRaw ?? "").trim();
    if (!t || t === "—") {
        return t || "—";
    }
    t = t.replace(/\butm_capterra\s*=\s*capterra\b/gi, "Capterra");
    t = t.replace(/\s*·\s*(?:·\s*)+/g, " · ").replace(/^\s*·\s*|\s*·\s*$/g, "").trim();
    t = t.replace(/\s{2,}/g, " ");
    return t === "" ? "—" : t;
}

/**
 * Human-readable channel for the attribution table (source / medium / referrer heuristics).
 */
function deriveMarketingChannel(row) {
    const s = normUtm(row.utmSource);
    const m = normUtm(row.utmMedium);
    const campaign = normUtm(row.utmCampaign);
    const host = normUtm(row.referrer).replace(/^www\./, "");
    const paidLike = /cpc|ppc|paid|social|ads|display|paidsocial|paid_social/.test(m);

    if (s === "(fbclid)") return "Facebook Ads";
    if (s === "(gclid)") return "Google Ads";
    if (s === "(utm)") return "Marketing (custom parameters)";
    if (campaign.includes("capterra") || s.includes("capterra")) return "Capterra";

    if (s.includes("instagram") || host.includes("instagram.com")) {
        return paidLike ? "Instagram Ads" : "Instagram";
    }

    const isFacebookFamily =
        s === "fb" ||
        s === "facebook" ||
        s === "meta" ||
        s.includes("facebook") ||
        host.includes("facebook.com") ||
        host.includes("fb.com") ||
        host.includes("m.facebook.com");

    if (isFacebookFamily) {
        const isPaidFacebook = paidLike;
        return isPaidFacebook ? "Facebook Ads" : "Facebook (Organic)";
    }
    if (s.includes("google") || s === "google ads" || host.includes("google.")) {
        if (m.includes("cpc") || m.includes("ppc") || m === "paid") return "Google Ads";
        return "Google";
    }
    if (s.includes("linkedin") || host.includes("linkedin.com")) {
        return paidLike ? "LinkedIn Ads" : "LinkedIn";
    }
    if (
        s.includes("twitter") ||
        s === "tw" ||
        host.includes("twitter.com") ||
        host.includes("x.com") ||
        host.includes("t.co")
    ) {
        return paidLike ? "X (Twitter) Ads" : "X (Twitter)";
    }
    if (s.includes("bing") || s.includes("microsoft")) return "Microsoft Ads";
    if (s.includes("tiktok")) return paidLike ? "TikTok Ads" : "TikTok";
    if (s.includes("pinterest")) return paidLike ? "Pinterest Ads" : "Pinterest";
    if (m === "email" || m.includes("newsletter") || m.includes("e-mail")) return "Email";
    if (m.includes("affiliate")) return "Affiliate";
    if (m === "organic" || s === "organic") return "Organic search";

    const hasDims = (s && s !== "—") || (m && m !== "—");
    if (hasDims) {
        const srcLabel = row.utmSource === "—" ? "" : String(row.utmSource).trim();
        const medLabel = row.utmMedium === "—" ? "" : String(row.utmMedium).trim();
        if (srcLabel && medLabel) return `${medLabel} · ${srcLabel}`;
        if (srcLabel) return srcLabel;
        if (medLabel) return medLabel;
    }

    if (host && host !== "—") {
        const pretty = String(row.referrer).replace(/^www\./i, "");
        return `Referral (${pretty})`;
    }

    return "Other";
}

function mapRow(r) {
    const ref =
        r.referrerHost ??
        r.referrer_host ??
        r.referrer ??
        r.referrerUrl ??
        r.referrer_url ??
        (r.referrerDomain != null ? String(r.referrerDomain) : "—");
    const rawCampaign = String(r.utm_campaign ?? r.utmCampaign ?? r.campaign ?? "—");
    const base = {
        referrer: ref === "" || ref == null ? "—" : String(ref),
        utmSource: String(r.utm_source ?? r.utmSource ?? r.source ?? "—"),
        utmMedium: String(r.utm_medium ?? r.utmMedium ?? r.medium ?? "—"),
        utmCampaign: simplifyCampaignDisplay(rawCampaign),
        consents: Number(r.consents ?? r.consent_count ?? r.count ?? r.total ?? 0) || 0,
        acceptPct:
            r.acceptRate != null
                ? Number(r.acceptRate)
                : r.accepted_pct != null
                  ? Number(r.accepted_pct)
                  : r.accept_pct != null
                    ? Number(r.accept_pct)
                    : null,
        acceptAll: Number(r.acceptAll ?? r.accept_all ?? 0) || 0,
        essentialOnly: Number(r.essentialOnly ?? r.essential_only ?? 0) || 0,
        granular: Number(r.granular ?? 0) || 0,
    };
    return {
        ...base,
        channel: deriveMarketingChannel({ ...base, utmCampaign: rawCampaign }),
    };
}

/** Count + share of consents in this row (same semantics as CMP payload classification). */
function formatChoiceCountPct(count, consents) {
    const c = Number(count) || 0;
    const t = Number(consents) || 0;
    if (t <= 0) return "—";
    const pct = (c / t) * 100;
    return `${c.toLocaleString("de-DE")} (${pct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%)`;
}

/** Weighted average acceptance % by consent volume (rows without accept % are skipped). */
function aggregateWeightedAcceptPct(rowList) {
    let numerator = 0;
    let denominator = 0;
    for (const r of rowList) {
        if (r.acceptPct == null || !Number.isFinite(r.acceptPct)) continue;
        numerator += r.acceptPct * r.consents;
        denominator += r.consents;
    }
    if (denominator <= 0) return null;
    return Math.round((numerator / denominator) * 10) / 10;
}

/** One row per channel for level-1 overview. */
function buildChannelOverview(rowList) {
    const byChannel = new Map();
    for (const r of rowList) {
        const ch = r.channel;
        if (!byChannel.has(ch)) byChannel.set(ch, []);
        byChannel.get(ch).push(r);
    }
    const out = [];
    for (const [channel, list] of byChannel) {
        const consents = list.reduce((s, x) => s + x.consents, 0);
        out.push({
            channel,
            consents,
            acceptPct: aggregateWeightedAcceptPct(list),
            campaignCount: list.length,
            acceptAll: list.reduce((s, x) => s + (x.acceptAll ?? 0), 0),
            essentialOnly: list.reduce((s, x) => s + (x.essentialOnly ?? 0), 0),
            granular: list.reduce((s, x) => s + (x.granular ?? 0), 0),
        });
    }
    out.sort((a, b) => b.consents - a.consents);
    return out;
}

export default function MarketingReport() {
    document.title = "Marketing attribution | Reports | Intastellar Consents";
    const [currentDomain, setGlobalDomain] = useContext(DomainContext);
    const { id, handle } = useParams();
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const settings = (() => {
        try {
            return JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
        } catch {
            return { dateRange: 30 };
        }
    })();

    const today = new Date();
    const initialLastDays =
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - (settings?.dateRange ?? 30)))
    );
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [, setActiveData] = useState(null);
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - (settings?.dateRange ?? 30))),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - (settings?.dateRange ?? 30))),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).end
    );

    const listDomainLabel = useMemo(
        () => consentsDomainFromRoute(handle, currentDomain),
        [handle, currentDomain]
    );
    const domainsApiHeader = useMemo(() => toDomainsApiHeader(listDomainLabel), [listDomainLabel]);

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    /** Level 2: which channel’s campaigns are shown; null = channel overview. */
    const [selectedChannel, setSelectedChannel] = useState(null);

    const endpoint = API[id]?.marketingAttribution;

    const fetchReport = useCallback(async () => {
        if (!endpoint?.url) {
            setError("Marketing attribution is not configured for this platform.");
            setRows([]);
            setSummary(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const headers = {
                ...endpoint.headers,
                Domains: domainsApiHeader,
                FromDate: toYmd(fromDate),
                ToDate: toYmd(toDate),
            };
            if (compareRange !== 0 && compareRange != null) {
                headers.CompareRange =
                    compareRange === "Same period last year" ? "Same period last year" : String(compareRange);
                headers.PreviousPeriod = toYmd(previousPeriod);
                headers.PreviousPeriod2 = toYmd(previousPeriod2);
                headers["X-Compare-Start"] = toYmd(previousPeriod);
                headers["X-Compare-End"] = toYmd(previousPeriod2);
                headers["X-Compare-Range"] =
                    compareRange === "Same period last year" ? "Same period last year" : String(compareRange);
            } else {
                headers.CompareRange = "";
                headers["X-Compare-Range"] = "";
            }

            const res = await fetch(endpoint.url, {
                method: endpoint.method || "GET",
                headers,
            });
            const text = await res.text();
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                setError("The server returned a non-JSON response.");
                setRows([]);
                setSummary(null);
                return;
            }
            if (!res.ok) {
                setError(json?.message || `Request failed (${res.status}).`);
                setRows([]);
                setSummary(null);
                return;
            }
            if (json === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            const rawRows = extractRows(json);
            setRows(rawRows.map(mapRow).sort((a, b) => b.consents - a.consents));
            setSummary(extractSummary(json));
            setSelectedChannel(null);
        } catch (e) {
            setError(e?.message || "Network error while loading marketing attribution.");
            setRows([]);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, [
        endpoint,
        domainsApiHeader,
        fromDate,
        toDate,
        compareRange,
        previousPeriod,
        previousPeriod2,
    ]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const totalConsents = useMemo(() => rows.reduce((s, r) => s + r.consents, 0), [rows]);

    const channelOverview = useMemo(() => buildChannelOverview(rows), [rows]);

    const drilldownRows = useMemo(() => {
        if (!selectedChannel) return [];
        return rows.filter((r) => r.channel === selectedChannel).sort((a, b) => b.consents - a.consents);
    }, [rows, selectedChannel]);

    const drillConsents = useMemo(
        () => drilldownRows.reduce((s, r) => s + r.consents, 0),
        [drilldownRows]
    );

    const unclassifiedConsents = useMemo(
        () =>
            rows.reduce((sum, r) => {
                const c = (r.acceptAll ?? 0) + (r.essentialOnly ?? 0) + (r.granular ?? 0);
                return sum + Math.max(0, r.consents - c);
            }, 0),
        [rows]
    );

    useEffect(() => {
        if (!selectedChannel) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") setSelectedChannel(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedChannel]);

    const kpiCards = useMemo(() => {
        const cards = [
            {
                label: selectedChannel ? "Campaigns in channel" : "Channels",
                value: selectedChannel
                    ? drilldownRows.length.toLocaleString("de-DE")
                    : channelOverview.length.toLocaleString("de-DE"),
            },
            {
                label: selectedChannel ? "Consents (this channel)" : "Consents in view",
                value: (selectedChannel ? drillConsents : totalConsents).toLocaleString("de-DE"),
            },
        ];
        if (summary && typeof summary === "object") {
            if (summary.sessionsWithMarketingParams != null) {
                cards.push({
                    label: "Sessions w/ marketing params",
                    value: String(summary.sessionsWithMarketingParams),
                });
            }
            if (summary.distinctCampaigns != null) {
                cards.push({
                    label: "Distinct campaigns",
                    value: String(summary.distinctCampaigns),
                });
            }
        }
        return cards;
    }, [totalConsents, drillConsents, summary, selectedChannel, drilldownRows.length, channelOverview.length]);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <div>
                <StickyPageTitle
                    loadingUpdated={loading}
                    finalLoaded={!loading}
                    title="Marketing attribution"
                    numberofDays={setLastDays}
                    getLastDays={getLastDays}
                    setActiveData={setActiveData}
                    fromDate={fromDate}
                    toDate={toDate}
                    setFromDate={setFromDate}
                    setToDate={setToDate}
                    previousPeriod={previousPeriod}
                    previousPeriod2={previousPeriod2}
                    compareRange={compareRange}
                    setCompareRange={setCompareRange}
                    setCompareWindowStart={setPreviousPeriod}
                    setCompareWindowEnd={setPreviousPeriod2}
                />
                <div className="dashboard-content marketing-report-page">
                    <header className="marketing-report-hero">
                        <h1>Marketing attribution</h1>
                        <p>
                            <strong>Channel overview</strong> rolls up campaigns by channel (one row per channel). Open
                            a channel for a <strong>campaign breakdown</strong>. <strong>Accept all</strong>,{" "}
                            <strong>essential only</strong>, and <strong>granular</strong> columns count how users chose
                            cookie categories (from the consent payload). Use the date range in the header to match
                            your backend filters.
                        </p>
                    </header>

                    {error ? (
                        <div className="marketing-report-error" role="alert">
                            {error}
                            <pre className="marketing-report-code">
                                {`Example row: { "utm_source": "fb", "utm_medium": "paid", "utm_campaign": "spring_sale", "consents": 120, "acceptRate": 72.5, "acceptAll": 72, "essentialOnly": 30, "granular": 18 }`}
                            </pre>
                        </div>
                    ) : null}

                    <div className="marketing-report-summary">
                        {kpiCards.map((c) => (
                            <div key={c.label} className="marketing-report-kpi">
                                <span className="marketing-report-kpi__label">{c.label}</span>
                                <span className="marketing-report-kpi__value">{c.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="marketing-report-toolbar">
                        {selectedChannel ? (
                            <button
                                type="button"
                                className="marketing-report-back"
                                onClick={() => setSelectedChannel(null)}
                            >
                                ← Channel overview
                            </button>
                        ) : (
                            <span className="marketing-report-toolbar__placeholder" aria-hidden="true" />
                        )}
                        <span className="marketing-report-toolbar__meta">
                            {loading
                                ? "Loading…"
                                : selectedChannel
                                  ? `${drilldownRows.length} campaign${drilldownRows.length === 1 ? "" : "s"} · ${drilldownRows.reduce((s, r) => s + r.consents, 0).toLocaleString("de-DE")} consents in “${selectedChannel}”`
                                  : `${channelOverview.length} channel${channelOverview.length === 1 ? "" : "s"} · ${totalConsents.toLocaleString("de-DE")} consents`}
                        </span>
                    </div>

                    {selectedChannel ? (
                        <h2 className="marketing-report-drill-title">{selectedChannel}</h2>
                    ) : null}

                    <div className="marketing-report-table-wrap">
                        {rows.length === 0 && !loading ? (
                            <div className="marketing-report-empty">
                                No attribution rows for this scope and period. When your API returns data, it will appear
                                here.
                            </div>
                        ) : selectedChannel ? (
                            <table className="marketing-report-table marketing-report-table--with-choices">
                                <thead>
                                    <tr>
                                        <th className="marketing-report-table__col-campaign">Campaign name</th>
                                        <th className="marketing-report-table__col-num">Consents</th>
                                        <th className="marketing-report-table__col-num">Acceptance %</th>
                                        <th className="marketing-report-table__col-choice">Accept all</th>
                                        <th className="marketing-report-table__col-choice">Essential only</th>
                                        <th className="marketing-report-table__col-choice">Granular</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {drilldownRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="marketing-report-table__empty-row">
                                                No campaigns for this channel.
                                            </td>
                                        </tr>
                                    ) : (
                                        drilldownRows.map((r, i) => (
                                            <tr key={`${r.channel}-${r.utmCampaign}-${i}`}>
                                                <td className="marketing-report-table__col-campaign">{r.utmCampaign}</td>
                                                <td className="marketing-report-table__col-num">
                                                    {r.consents.toLocaleString("de-DE")}
                                                </td>
                                                <td className="marketing-report-table__col-num">
                                                    {r.acceptPct != null && Number.isFinite(r.acceptPct)
                                                        ? `${r.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`
                                                        : "—"}
                                                </td>
                                                <td className="marketing-report-table__col-choice">
                                                    {formatChoiceCountPct(r.acceptAll, r.consents)}
                                                </td>
                                                <td className="marketing-report-table__col-choice">
                                                    {formatChoiceCountPct(r.essentialOnly, r.consents)}
                                                </td>
                                                <td className="marketing-report-table__col-choice">
                                                    {formatChoiceCountPct(r.granular, r.consents)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="marketing-report-table marketing-report-table--with-choices">
                                <thead>
                                    <tr>
                                        <th className="marketing-report-table__col-channel">Channel</th>
                                        <th className="marketing-report-table__col-num">Campaigns</th>
                                        <th className="marketing-report-table__col-num">Consents</th>
                                        <th className="marketing-report-table__col-num">Acceptance %</th>
                                        <th className="marketing-report-table__col-choice">Accept all</th>
                                        <th className="marketing-report-table__col-choice">Essential only</th>
                                        <th className="marketing-report-table__col-choice">Granular</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {channelOverview.map((r) => (
                                        <tr
                                            key={r.channel}
                                            className="marketing-report-table__row--clickable"
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Open campaign breakdown for ${r.channel}`}
                                            onClick={() => setSelectedChannel(r.channel)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    setSelectedChannel(r.channel);
                                                }
                                            }}
                                        >
                                            <td className="marketing-report-table__col-channel">
                                                <span className="marketing-report-channel-cell">
                                                    <span className="marketing-report-channel-cell__label">
                                                        {r.channel}
                                                    </span>
                                                    <span className="marketing-report-channel-cell__chevron" aria-hidden>
                                                        →
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="marketing-report-table__col-num">
                                                {r.campaignCount.toLocaleString("de-DE")}
                                            </td>
                                            <td className="marketing-report-table__col-num">
                                                {r.consents.toLocaleString("de-DE")}
                                            </td>
                                            <td className="marketing-report-table__col-num">
                                                {r.acceptPct != null && Number.isFinite(r.acceptPct)
                                                    ? `${r.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`
                                                    : "—"}
                                            </td>
                                            <td className="marketing-report-table__col-choice">
                                                {formatChoiceCountPct(r.acceptAll, r.consents)}
                                            </td>
                                            <td className="marketing-report-table__col-choice">
                                                {formatChoiceCountPct(r.essentialOnly, r.consents)}
                                            </td>
                                            <td className="marketing-report-table__col-choice">
                                                {formatChoiceCountPct(r.granular, r.consents)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {rows.length > 0 && unclassifiedConsents > 0 ? (
                        <p className="marketing-report-footnote" role="note">
                            {unclassifiedConsents.toLocaleString("de-DE")} consent
                            {unclassifiedConsents === 1 ? "" : "s"} in this period had no classifiable choice pattern
                            (missing or legacy payload). They are included in <strong>Consents</strong> but not in the
                            three choice columns.
                        </p>
                    ) : null}
                </div>
            </div>
        </>
    );
}
