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
 * Human-readable channel for the marketing table (source / medium / referrer heuristics).
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
        context: normalizeContext(r.context),
    };
    return {
        ...base,
        channel: deriveMarketingChannel({ ...base, utmCampaign: rawCampaign }),
    };
}

function normalizeContext(ctx) {
    if (!ctx || typeof ctx !== "object") {
        return null;
    }
    return {
        topCountries: Array.isArray(ctx.topCountries) ? ctx.topCountries : [],
        topLandingPaths: Array.isArray(ctx.topLandingPaths) ? ctx.topLandingPaths : [],
        topUtmContent: Array.isArray(ctx.topUtmContent) ? ctx.topUtmContent : [],
        topUtmTerms: Array.isArray(ctx.topUtmTerms) ? ctx.topUtmTerms : [],
    };
}

function mergeContextDim(rows, listKey, idFn, topN) {
    const map = new Map();
    for (const r of rows) {
        const list = r.context?.[listKey];
        if (!Array.isArray(list)) {
            continue;
        }
        for (const it of list) {
            const id = String(idFn(it) ?? "—");
            const cur = map.get(id) ?? { consents: 0, acceptAll: 0, essentialOnly: 0, granular: 0 };
            cur.consents += Number(it.consents) || 0;
            cur.acceptAll += Number(it.acceptAll) || 0;
            cur.essentialOnly += Number(it.essentialOnly) || 0;
            cur.granular += Number(it.granular) || 0;
            map.set(id, cur);
        }
    }
    return [...map.entries()]
        .map(([id, st]) => {
            const decided = st.acceptAll + st.essentialOnly + st.granular;
            const acceptPct =
                decided > 0 ? Math.round((st.acceptAll / decided) * 1000) / 10 : null;
            return { id, ...st, acceptPct };
        })
        .sort((a, b) => b.consents - a.consents)
        .slice(0, topN);
}

function mergeAllContext(rows) {
    const topCountries = mergeContextDim(rows, "topCountries", (it) => it.country, 12);
    const topLandingPaths = mergeContextDim(rows, "topLandingPaths", (it) => it.path, 8);
    const topUtmContent = mergeContextDim(rows, "topUtmContent", (it) => it.value, 5);
    const topUtmTerms = mergeContextDim(rows, "topUtmTerms", (it) => it.value, 5);
    const hasAny =
        topCountries.length > 0 ||
        topLandingPaths.length > 0 ||
        topUtmContent.length > 0 ||
        topUtmTerms.length > 0;
    return { topCountries, topLandingPaths, topUtmContent, topUtmTerms, hasAny };
}

function escapeCsvCell(value) {
    const s = value == null ? "" : String(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function summarizeContextList(list, formatter) {
    if (!Array.isArray(list) || list.length === 0) {
        return "";
    }
    return list
        .map(formatter)
        .join(" | ")
        .replace(/\r?\n/g, " ");
}

function buildMarketingCsvCampaignRows(rows, meta) {
    const lines = [
        `# Marketing — campaign rows`,
        `# From: ${meta.from}; To: ${meta.to}; Scope: ${meta.scope}`,
        `# Generated: ${meta.generatedAt}`,
        [
            "channel",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "referrer_host",
            "consents",
            "accept_rate_pct",
            "accept_all",
            "essential_only",
            "granular",
            "top_countries",
            "top_landing_paths",
            "top_utm_content",
            "top_utm_terms",
        ].join(","),
    ];
    for (const r of rows) {
        const ctx = r.context;
        const topCountries = summarizeContextList(ctx?.topCountries, (x) => `${x.country}:${x.consents}`);
        const topPaths = summarizeContextList(ctx?.topLandingPaths, (x) => `${x.path}:${x.consents}`);
        const topContent = summarizeContextList(ctx?.topUtmContent, (x) => `${x.value}:${x.consents}`);
        const topTerms = summarizeContextList(ctx?.topUtmTerms, (x) => `${x.value}:${x.consents}`);
        const row = [
            r.channel,
            r.utmSource,
            r.utmMedium,
            r.utmCampaign,
            r.referrer,
            String(r.consents),
            r.acceptPct != null && Number.isFinite(r.acceptPct) ? String(r.acceptPct) : "",
            String(r.acceptAll ?? 0),
            String(r.essentialOnly ?? 0),
            String(r.granular ?? 0),
            topCountries,
            topPaths,
            topContent,
            topTerms,
        ].map(escapeCsvCell);
        lines.push(row.join(","));
    }
    return lines.join("\r\n");
}

function buildMarketingCsvChannelRows(channelOverview, meta) {
    const lines = [
        `# Marketing — channel overview`,
        `# From: ${meta.from}; To: ${meta.to}; Scope: ${meta.scope}`,
        `# Generated: ${meta.generatedAt}`,
        [
            "channel",
            "campaigns",
            "consents",
            "accept_rate_pct_weighted",
            "accept_all",
            "essential_only",
            "granular",
        ].join(","),
    ];
    for (const r of channelOverview) {
        const row = [
            r.channel,
            String(r.campaignCount),
            String(r.consents),
            r.acceptPct != null && Number.isFinite(r.acceptPct) ? String(r.acceptPct) : "",
            String(r.acceptAll ?? 0),
            String(r.essentialOnly ?? 0),
            String(r.granular ?? 0),
        ].map(escapeCsvCell);
        lines.push(row.join(","));
    }
    return lines.join("\r\n");
}

function triggerCsvDownload(filename, csvText) {
    const blob = new Blob(["\uFEFF", csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function MarketingContextSection({ heading, rows }) {
    const merged = useMemo(() => mergeAllContext(rows), [rows]);
    if (!merged.hasAny) {
        return (
            <section className="marketing-context marketing-context--empty" aria-labelledby="marketing-context-h">
                <h2 id="marketing-context-h" className="marketing-context__title">
                    {heading}
                </h2>
                <p className="marketing-context__empty-note">
                    No geographic or landing-path breakdown in the API response yet. After you deploy the updated{" "}
                    <code>marketingAttribution</code> endpoint, top countries, paths, and UTM content/term slices appear
                    here.
                </p>
            </section>
        );
    }

    const fmtPct = (p) =>
        p != null && Number.isFinite(p) ? `${p.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%` : "—";

    const miniRows = (items) =>
        items.map((row) => (
            <tr key={row.id}>
                <td className="marketing-context__label">{row.id}</td>
                <td className="marketing-context__num">{row.consents.toLocaleString("de-DE")}</td>
                <td className="marketing-context__num">{fmtPct(row.acceptPct)}</td>
                <td className="marketing-context__split">
                    {formatChoiceCountPct(row.acceptAll, row.consents)} ·{" "}
                    {formatChoiceCountPct(row.essentialOnly, row.consents)} ·{" "}
                    {formatChoiceCountPct(row.granular, row.consents)}
                </td>
            </tr>
        ));

    return (
        <section className="marketing-context" aria-labelledby="marketing-context-h">
            <h2 id="marketing-context-h" className="marketing-context__title">
                {heading}
            </h2>
            <p className="marketing-context__lede">
                Merged from campaign-level slices in this view (union of each campaign’s top dimensions). Percentages
                use accept-all vs all classified choices within each slice.
            </p>
            <div className="marketing-context__grid">
                {merged.topCountries.length > 0 ? (
                    <div className="marketing-context__block">
                        <h3 className="marketing-context__block-title">Top countries</h3>
                        <table className="marketing-context__table">
                            <thead>
                                <tr>
                                    <th>Country</th>
                                    <th className="marketing-context__num">Consents</th>
                                    <th className="marketing-context__num">Accept %</th>
                                    <th>All / Essential / Granular</th>
                                </tr>
                            </thead>
                            <tbody>{miniRows(merged.topCountries)}</tbody>
                        </table>
                    </div>
                ) : null}
                {merged.topLandingPaths.length > 0 ? (
                    <div className="marketing-context__block">
                        <h3 className="marketing-context__block-title">Top landing paths</h3>
                        <table className="marketing-context__table">
                            <thead>
                                <tr>
                                    <th>Path</th>
                                    <th className="marketing-context__num">Consents</th>
                                    <th className="marketing-context__num">Accept %</th>
                                    <th>All / Essential / Granular</th>
                                </tr>
                            </thead>
                            <tbody>{miniRows(merged.topLandingPaths)}</tbody>
                        </table>
                    </div>
                ) : null}
                {merged.topUtmContent.length > 0 ? (
                    <div className="marketing-context__block">
                        <h3 className="marketing-context__block-title">UTM content</h3>
                        <table className="marketing-context__table">
                            <thead>
                                <tr>
                                    <th>Value</th>
                                    <th className="marketing-context__num">Consents</th>
                                    <th className="marketing-context__num">Accept %</th>
                                    <th>All / Essential / Granular</th>
                                </tr>
                            </thead>
                            <tbody>{miniRows(merged.topUtmContent)}</tbody>
                        </table>
                    </div>
                ) : null}
                {merged.topUtmTerms.length > 0 ? (
                    <div className="marketing-context__block">
                        <h3 className="marketing-context__block-title">UTM term</h3>
                        <table className="marketing-context__table">
                            <thead>
                                <tr>
                                    <th>Value</th>
                                    <th className="marketing-context__num">Consents</th>
                                    <th className="marketing-context__num">Accept %</th>
                                    <th>All / Essential / Granular</th>
                                </tr>
                            </thead>
                            <tbody>{miniRows(merged.topUtmTerms)}</tbody>
                        </table>
                    </div>
                ) : null}
            </div>
        </section>
    );
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
    document.title = "Marketing | Reports | Intastellar Consents";
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
            setError("Marketing is not configured for this platform.");
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
            setError(e?.message || "Network error while loading marketing data.");
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

    const exportCsvMeta = useMemo(
        () => ({
            from: toYmd(fromDate),
            to: toYmd(toDate),
            scope: listDomainLabel,
            generatedAt: new Date().toISOString(),
        }),
        [fromDate, toDate, listDomainLabel]
    );

    const exportFilenameBase = useMemo(() => {
        const safe = String(listDomainLabel || "report")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 60);
        return `marketing_${toYmd(fromDate)}_${toYmd(toDate)}_${safe}`;
    }, [listDomainLabel, fromDate, toDate]);

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
            <div style={{ flex: "1" }}>
                <StickyPageTitle
                    loadingUpdated={loading}
                    finalLoaded={loading}
                    title="Marketing"
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
                        <h1>Marketing</h1>
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
                        <div className="marketing-report-toolbar__left">
                            {selectedChannel ? (
                                <button
                                    type="button"
                                    className="marketing-report-back"
                                    onClick={() => setSelectedChannel(null)}
                                >
                                    ← Channel overview
                                </button>
                            ) : null}
                            {rows.length > 0 ? (
                                <>
                                    <button
                                        type="button"
                                        className="marketing-report-export"
                                        onClick={() => {
                                            const data = selectedChannel ? drilldownRows : rows;
                                            const slug = selectedChannel
                                                ? selectedChannel.replace(/[^\w\-]+/g, "_").slice(0, 48)
                                                : "";
                                            triggerCsvDownload(
                                                `${exportFilenameBase}_campaigns${slug ? `_${slug}` : ""}.csv`,
                                                buildMarketingCsvCampaignRows(data, exportCsvMeta)
                                            );
                                        }}
                                    >
                                        {selectedChannel ? "Export this channel (campaigns) CSV" : "Export campaigns CSV"}
                                    </button>
                                    <button
                                        type="button"
                                        className="marketing-report-export marketing-report-export--secondary"
                                        onClick={() =>
                                            triggerCsvDownload(
                                                `${exportFilenameBase}_channels.csv`,
                                                buildMarketingCsvChannelRows(channelOverview, exportCsvMeta)
                                            )
                                        }
                                    >
                                        Export channels CSV
                                    </button>
                                </>
                            ) : null}
                        </div>
                        <span className="marketing-report-toolbar__meta">
                            {loading
                                ? "Loading…"
                                : selectedChannel
                                  ? `${drilldownRows.length} campaign${drilldownRows.length === 1 ? "" : "s"} · ${drilldownRows.reduce((s, r) => s + r.consents, 0).toLocaleString("de-DE")} consents in “${selectedChannel}”`
                                  : `${channelOverview.length} channel${channelOverview.length === 1 ? "" : "s"} · ${totalConsents.toLocaleString("de-DE")} consents`}
                        </span>
                    </div>

                    {rows.length > 0 ? (
                        <MarketingContextSection
                            heading={
                                selectedChannel
                                    ? `Performance context · ${selectedChannel}`
                                    : "Performance context · all channels"
                            }
                            rows={selectedChannel ? drilldownRows : rows}
                        />
                    ) : null}

                    {selectedChannel ? (
                        <h2 className="marketing-report-drill-title">{selectedChannel}</h2>
                    ) : null}

                    <div className="marketing-report-table-wrap">
                        {rows.length === 0 && !loading ? (
                            <div className="marketing-report-empty">
                                No marketing rows for this scope and period. When your API returns data, it will appear
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
