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

/** Prefer API summary (full dataset) when rows are paginated. */
function pickTotalConsentsFromSummary(summary, rowList) {
    const v = summary && summary.totalConsents != null ? Number(summary.totalConsents) : NaN;
    if (Number.isFinite(v) && v >= 0) return v;
    return rowList.reduce((s, r) => s + (Number(r.consents) || 0), 0);
}

function pickMeasurementReadyCount(summary, rowList) {
    const v = summary && summary.measurementReadyConsents != null ? Number(summary.measurementReadyConsents) : NaN;
    if (Number.isFinite(v) && v >= 0) return v;
    return rowList.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0);
}

function pickMeasurementReadySharePct(summary, rowList) {
    const v = summary && summary.measurementReadySharePct != null ? Number(summary.measurementReadySharePct) : NaN;
    if (Number.isFinite(v)) return v;
    const t = rowList.reduce((s, r) => s + (Number(r.consents) || 0), 0);
    const a = rowList.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0);
    return t > 0 ? Math.round((a / t) * 1000) / 10 : null;
}

function compareRangeActive(compareRange) {
    return compareRange !== 0 && compareRange != null;
}

/** Stable join key for matching primary-period rows to baseline-period rows. */
function marketingAttributionRowKey(utmSource, utmMedium, rawCampaign, referrer) {
    return [
        normUtm(utmSource),
        normUtm(utmMedium),
        normUtm(String(rawCampaign ?? "").trim()),
        normUtm(referrer),
    ].join("|");
}

function aggregateBaselineByRowKey(baselineRows) {
    const m = new Map();
    for (const r of baselineRows) {
        const k = r.rowKey;
        if (!k) continue;
        if (!m.has(k)) {
            m.set(k, {
                consents: 0,
                acceptAll: 0,
                essentialOnly: 0,
                granular: 0,
                acceptNum: 0,
                acceptDen: 0,
            });
        }
        const x = m.get(k);
        x.consents += Number(r.consents) || 0;
        x.acceptAll += Number(r.acceptAll) || 0;
        x.essentialOnly += Number(r.essentialOnly) || 0;
        x.granular += Number(r.granular) || 0;
        if (r.acceptPct != null && Number.isFinite(r.acceptPct) && r.consents > 0) {
            x.acceptNum += r.acceptPct * r.consents;
            x.acceptDen += r.consents;
        }
    }
    const out = new Map();
    for (const [k, x] of m) {
        const acceptPct =
            x.acceptDen > 0 ? Math.round((x.acceptNum / x.acceptDen) * 10) / 10 : null;
        out.set(k, {
            consents: x.consents,
            acceptAll: x.acceptAll,
            essentialOnly: x.essentialOnly,
            granular: x.granular,
            acceptPct,
        });
    }
    return out;
}

/**
 * Attach baseline metrics to each primary row (matched by rowKey).
 * When no baseline row exists, prev* fields are null (treat as new / unmatched in baseline).
 */
function attachBaselineToRows(primaryRows, baselineRows) {
    if (!baselineRows?.length) {
        return primaryRows.map((r) => ({
            ...r,
            prevConsents: null,
            prevAcceptPct: null,
            prevAcceptAll: null,
            prevEssentialOnly: null,
            prevGranular: null,
        }));
    }
    const agg = aggregateBaselineByRowKey(baselineRows);
    return primaryRows.map((r) => {
        const b = agg.get(r.rowKey);
        if (!b) {
            return {
                ...r,
                prevConsents: null,
                prevAcceptPct: null,
                prevAcceptAll: null,
                prevEssentialOnly: null,
                prevGranular: null,
            };
        }
        return {
            ...r,
            prevConsents: b.consents,
            prevAcceptPct: b.acceptPct,
            prevAcceptAll: b.acceptAll,
            prevEssentialOnly: b.essentialOnly,
            prevGranular: b.granular,
        };
    });
}

/** Merge channel-level baseline totals for the overview table (all campaigns in baseline window). */
function mergeChannelOverviewWithBaseline(currentOverview, baselineRows) {
    if (!baselineRows?.length) {
        return currentOverview.map((c) => ({
            ...c,
            prevConsents: null,
            prevCampaignCount: null,
            prevAcceptPct: null,
            prevAcceptAll: null,
            prevEssentialOnly: null,
            prevGranular: null,
        }));
    }
    const baselineOverview = buildChannelOverview(baselineRows);
    const bMap = new Map(baselineOverview.map((x) => [x.channel, x]));
    return currentOverview.map((c) => {
        const b = bMap.get(c.channel);
        if (!b) {
            return {
                ...c,
                prevConsents: null,
                prevCampaignCount: null,
                prevAcceptPct: null,
                prevAcceptAll: null,
                prevEssentialOnly: null,
                prevGranular: null,
            };
        }
        return {
            ...c,
            prevConsents: b.consents,
            prevCampaignCount: b.campaignCount,
            prevAcceptPct: b.acceptPct,
            prevAcceptAll: b.acceptAll,
            prevEssentialOnly: b.essentialOnly,
            prevGranular: b.granular,
        };
    });
}

function formatPctChange(current, previous) {
    if (current == null) return null;
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(c)) return null;
    if (previous == null || !Number.isFinite(p)) return null;
    if (p === 0 && c === 0) return "0%";
    if (p === 0) return "—";
    const pct = ((c - p) / p) * 100;
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`;
}

function formatPtsChange(current, previous) {
    if (current == null) return null;
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(c) || previous == null || !Number.isFinite(p)) return null;
    const d = c - p;
    const rounded = Math.round(d * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded.toLocaleString("de-DE", { maximumFractionDigits: 1 })} pts`;
}

function marketingCompareVolumeClass(current, previous) {
    if (current == null || previous == null) return "";
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(p) || !Number.isFinite(c)) return "";
    if (p === 0) return c > 0 ? "marketing-report-delta--up" : "";
    const pct = ((c - p) / p) * 100;
    if (pct > 0.5) return "marketing-report-delta--up";
    if (pct < -0.5) return "marketing-report-delta--down";
    return "marketing-report-delta--flat";
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
 * Google paid traffic → single "Google Ads" bucket (Search, Display, legacy AdWords / PPC labels).
 */
function isGoogleOrganicMedium(mediumNorm) {
    const m = mediumNorm;
    return m === "organic" || m.includes("organic") || m === "natural" || m === "seo";
}

function isGooglePaidMedium(mediumNorm) {
    const m = mediumNorm;
    return (
        m.includes("cpc") ||
        m.includes("ppc") ||
        m === "paid" ||
        m.includes("paidsearch") ||
        m.includes("paid search") ||
        m.includes("adwords") ||
        m.includes("display") ||
        m.includes("cpm") ||
        /cpc|ppc|paid|social|ads|display|paidsocial|paid_social/.test(m)
    );
}

function isGoogleAdsFamilySource(sourceNorm) {
    const s = sourceNorm;
    return (
        s.includes("google") ||
        s === "google ads" ||
        s.includes("googleads") ||
        s.includes("google_ads") ||
        s.includes("adwords")
    );
}

/**
 * Meta Ads Manager often sends placement as utm_medium (e.g. Facebook_Mobile_Feed, Instagram_Stories)
 * without "cpc" / "paid" — still paid inventory.
 */
function isMetaPaidPlacementMedium(mediumNorm) {
    const m = mediumNorm;
    if (!m || m === "—") return false;
    if (/mobile_feed|desktop_feed|inline_feed|instagram_stories|instagram_story|instagram_reels|instagram_reel/i.test(m)) {
        return true;
    }
    if (/(^|_)(facebook|fb|meta|instagram|ig)($|_)/i.test(m) && /(_feed|_stories|_story|_reels|_reel|marketplace|messenger|carousel|_search|instream|video)/i.test(m)) {
        return true;
    }
    if ((m.includes("facebook") || m.includes("instagram")) && (m.includes("feed") || m.includes("story") || m.includes("reel"))) {
        return true;
    }
    return false;
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
    const metaPaidPlacement = isMetaPaidPlacementMedium(m);

    if (s === "(fbclid)") return "Facebook Ads";
    if (s === "(gclid)") return "Google Ads";
    if (s === "(utm)") return "Marketing (custom parameters)";
    if (campaign.includes("capterra") || s.includes("capterra")) return "Capterra";

    if (s.includes("instagram") || host.includes("instagram.com")) {
        return paidLike || metaPaidPlacement ? "Instagram Ads" : "Instagram";
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
        const isPaidFacebook = paidLike || metaPaidPlacement;
        return isPaidFacebook ? "Facebook Ads" : "Facebook (Organic)";
    }

    const fromGoogleReferrer = host.includes("google.") && !host.includes("doubleclick.net");
    const googleSource = isGoogleAdsFamilySource(s);
    if (googleSource || fromGoogleReferrer) {
        if (isGoogleOrganicMedium(m)) return "Google";
        if (isGooglePaidMedium(m) || paidLike) return "Google Ads";
        return "Google";
    }

    // Legacy UTM: "ppc" as source only (old labels) — fold into Google Ads when clearly paid
    if (!s.includes("bing") && !s.includes("microsoft")) {
        const legacyPpcSource =
            s === "ppc" || s.startsWith("ppc/") || (s.includes("ppc") && s.includes("adwords"));
        if (legacyPpcSource && (isGooglePaidMedium(m) || paidLike)) {
            return "Google Ads";
        }
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
    const utmSource = String(r.utm_source ?? r.utmSource ?? r.source ?? "—");
    const utmMedium = String(r.utm_medium ?? r.utmMedium ?? r.medium ?? "—");
    const referrerNorm = ref === "" || ref == null ? "—" : String(ref);
    const base = {
        referrer: referrerNorm,
        utmSource,
        utmMedium,
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
        rowKey: marketingAttributionRowKey(utmSource, utmMedium, rawCampaign, referrerNorm),
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

function csvRelativeChangeNumber(current, previous) {
    const c = Number(current);
    const p = Number(previous);
    if (previous == null || !Number.isFinite(p) || !Number.isFinite(c)) return "";
    if (p === 0) return c === 0 ? "0" : "";
    return String(Math.round(((c - p) / p) * 10000) / 100);
}

function buildMarketingCsvCampaignRows(rows, meta) {
    const cmp = Boolean(meta.compareExport);
    const lines = [
        `# Marketing — campaign rows`,
        `# From: ${meta.from}; To: ${meta.to}; Scope: ${meta.scope}`,
        ...(meta.compareOn ? [`# Compare: ${meta.compareFrom} – ${meta.compareTo}`] : []),
        `# Generated: ${meta.generatedAt}`,
    ];
    const header = [
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
    ];
    if (cmp) {
        header.push(
            "baseline_consents",
            "consents_change_pct",
            "baseline_accept_rate_pct",
            "accept_rate_pts_change"
        );
    }
    lines.push(header.join(","));
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
        ];
        if (cmp) {
            const pts =
                r.acceptPct != null &&
                Number.isFinite(r.acceptPct) &&
                r.prevAcceptPct != null &&
                Number.isFinite(r.prevAcceptPct)
                    ? String(Math.round((r.acceptPct - r.prevAcceptPct) * 10) / 10)
                    : "";
            row.push(
                r.prevConsents != null ? String(r.prevConsents) : "",
                csvRelativeChangeNumber(r.consents, r.prevConsents),
                r.prevAcceptPct != null && Number.isFinite(r.prevAcceptPct) ? String(r.prevAcceptPct) : "",
                pts
            );
        }
        lines.push(row.map(escapeCsvCell).join(","));
    }
    return lines.join("\r\n");
}

function buildMarketingCsvChannelRows(channelOverview, meta) {
    const cmp = Boolean(meta.compareExport);
    const lines = [
        `# Marketing — channel overview`,
        `# From: ${meta.from}; To: ${meta.to}; Scope: ${meta.scope}`,
        ...(meta.compareOn ? [`# Compare: ${meta.compareFrom} – ${meta.compareTo}`] : []),
        `# Generated: ${meta.generatedAt}`,
    ];
    const header = [
        "channel",
        "campaigns",
        "consents",
        "accept_rate_pct_weighted",
        "accept_all",
        "essential_only",
        "granular",
    ];
    if (cmp) {
        header.push(
            "baseline_campaigns",
            "baseline_consents",
            "campaigns_change_pct",
            "consents_change_pct",
            "baseline_accept_rate_pct_weighted",
            "accept_rate_pts_change"
        );
    }
    lines.push(header.join(","));
    for (const r of channelOverview) {
        const row = [
            r.channel,
            String(r.campaignCount),
            String(r.consents),
            r.acceptPct != null && Number.isFinite(r.acceptPct) ? String(r.acceptPct) : "",
            String(r.acceptAll ?? 0),
            String(r.essentialOnly ?? 0),
            String(r.granular ?? 0),
        ];
        if (cmp) {
            const pts =
                r.acceptPct != null &&
                Number.isFinite(r.acceptPct) &&
                r.prevAcceptPct != null &&
                Number.isFinite(r.prevAcceptPct)
                    ? String(Math.round((r.acceptPct - r.prevAcceptPct) * 10) / 10)
                    : "";
            row.push(
                r.prevCampaignCount != null ? String(r.prevCampaignCount) : "",
                r.prevConsents != null ? String(r.prevConsents) : "",
                csvRelativeChangeNumber(r.campaignCount, r.prevCampaignCount),
                csvRelativeChangeNumber(r.consents, r.prevConsents),
                r.prevAcceptPct != null && Number.isFinite(r.prevAcceptPct) ? String(r.prevAcceptPct) : "",
                pts
            );
        }
        lines.push(row.map(escapeCsvCell).join(","));
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
                <h3 id="marketing-context-h" className="marketing-context__title">
                    {heading}
                </h3>
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
            <h3 id="marketing-context-h" className="marketing-context__title">
                {heading}
            </h3>
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

function formatPeriodRange(fromDate, toDate) {
    const a = toYmd(fromDate);
    const b = toYmd(toDate);
    if (!a && !b) {
        return "";
    }
    return a === b ? a : `${a} – ${b}`;
}

function truncateLabel(str, maxLen) {
    const s = String(str ?? "").trim() || "—";
    if (s.length <= maxLen) {
        return s;
    }
    return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** @typedef {{ column: string | null, step: 0 | 1 | 2 }} MarketingTableSortState */

const MARKETING_SORT_LOCALE = "de";

const CHANNEL_SORT_KEYS = {
    channel: "text",
    campaignCount: "number",
    consents: "number",
    acceptPct: "number",
    acceptAll: "number",
    essentialOnly: "number",
    granular: "number",
};

const CAMPAIGN_SORT_KEYS = {
    utmCampaign: "text",
    consents: "number",
    acceptPct: "number",
    acceptAll: "number",
    essentialOnly: "number",
    granular: "number",
};

function defaultChannelOverviewOrder(a, b) {
    const c = b.consents - a.consents;
    if (c !== 0) return c;
    return String(a.channel).localeCompare(String(b.channel), MARKETING_SORT_LOCALE, { sensitivity: "base" });
}

function defaultCampaignRowOrder(a, b) {
    const c = b.consents - a.consents;
    if (c !== 0) return c;
    return String(a.utmCampaign).localeCompare(String(b.utmCampaign), MARKETING_SORT_LOCALE, { sensitivity: "base" });
}

function cmpNullableFiniteNumber(a, b, desc) {
    const na = a == null || !Number.isFinite(a);
    const nb = b == null || !Number.isFinite(b);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return desc ? b - a : a - b;
}

function channelRowNumberValue(row, column) {
    switch (column) {
        case "campaignCount":
            return row.campaignCount;
        case "consents":
            return row.consents;
        case "acceptPct":
            return row.acceptPct;
        case "acceptAll":
            return row.acceptAll;
        case "essentialOnly":
            return row.essentialOnly;
        case "granular":
            return row.granular;
        default:
            return 0;
    }
}

function campaignRowNumberValue(row, column) {
    switch (column) {
        case "consents":
            return row.consents;
        case "acceptPct":
            return row.acceptPct;
        case "acceptAll":
            return row.acceptAll;
        case "essentialOnly":
            return row.essentialOnly;
        case "granular":
            return row.granular;
        default:
            return 0;
    }
}

/** @param {MarketingTableSortState} sort */
function sortChannelOverviewRows(rows, sort) {
    const list = [...rows];
    if (!sort.column || sort.step === 0) {
        list.sort(defaultChannelOverviewOrder);
        return list;
    }
    const kind = CHANNEL_SORT_KEYS[sort.column];
    if (!kind) {
        list.sort(defaultChannelOverviewOrder);
        return list;
    }
    if (kind === "text" && sort.column === "channel") {
        const desc = sort.step === 2;
        list.sort((a, b) => {
            const cmp = String(a.channel).localeCompare(String(b.channel), MARKETING_SORT_LOCALE, {
                sensitivity: "base",
            });
            if (cmp !== 0) return desc ? -cmp : cmp;
            return defaultChannelOverviewOrder(a, b);
        });
        return list;
    }
    if (kind === "number") {
        const desc = sort.step === 1;
        list.sort((a, b) => {
            const va = channelRowNumberValue(a, sort.column);
            const vb = channelRowNumberValue(b, sort.column);
            if (sort.column === "acceptPct") {
                const c = cmpNullableFiniteNumber(va, vb, desc);
                if (c !== 0) return c;
            } else {
                const na = Number(va) || 0;
                const nb = Number(vb) || 0;
                if (na !== nb) return desc ? nb - na : na - nb;
            }
            return defaultChannelOverviewOrder(a, b);
        });
        return list;
    }
    list.sort(defaultChannelOverviewOrder);
    return list;
}

function sortCampaignDrilldownRows(rows, sort) {
    const list = [...rows];
    if (!sort.column || sort.step === 0) {
        list.sort(defaultCampaignRowOrder);
        return list;
    }
    const kind = CAMPAIGN_SORT_KEYS[sort.column];
    if (!kind) {
        list.sort(defaultCampaignRowOrder);
        return list;
    }
    if (kind === "text" && sort.column === "utmCampaign") {
        const desc = sort.step === 2;
        list.sort((a, b) => {
            const cmp = String(a.utmCampaign).localeCompare(String(b.utmCampaign), MARKETING_SORT_LOCALE, {
                sensitivity: "base",
            });
            if (cmp !== 0) return desc ? -cmp : cmp;
            return defaultCampaignRowOrder(a, b);
        });
        return list;
    }
    if (kind === "number") {
        const desc = sort.step === 1;
        list.sort((a, b) => {
            const va = campaignRowNumberValue(a, sort.column);
            const vb = campaignRowNumberValue(b, sort.column);
            if (sort.column === "acceptPct") {
                const c = cmpNullableFiniteNumber(va, vb, desc);
                if (c !== 0) return c;
            } else {
                const na = Number(va) || 0;
                const nb = Number(vb) || 0;
                if (na !== nb) return desc ? nb - na : na - nb;
            }
            return defaultCampaignRowOrder(a, b);
        });
        return list;
    }
    list.sort(defaultCampaignRowOrder);
    return list;
}

function cycleMarketingTableSort(prev, columnKey) {
    if (prev.column !== columnKey) {
        return { column: columnKey, step: 1 };
    }
    if (prev.step >= 2) {
        return { column: null, step: 0 };
    }
    return { column: columnKey, step: (prev.step + 1) };
}

function marketingSortButtonGlyph(columnKey, kind, sort) {
    const active = sort.column === columnKey && sort.step > 0;
    if (!active) {
        return "↕";
    }
    if (kind === "text") {
        return sort.step === 1 ? "A→Z" : "Z→A";
    }
    return sort.step === 1 ? "9→1" : "1→9";
}

function marketingSortAriaLabel(label, columnKey, kind, sort) {
    const active = sort.column === columnKey && sort.step > 0;
    if (!active) {
        return `Sort ${label}: default (by consents). Activate for alphabetic or amount order.`;
    }
    if (kind === "text") {
        if (sort.step === 1) {
            return `Sort ${label}: A to Z. Press again for Z to A, then default.`;
        }
        return `Sort ${label}: Z to A. Press again for default.`;
    }
    if (sort.step === 1) {
        return `Sort ${label}: highest to lowest. Press again for lowest to highest, then default.`;
    }
    return `Sort ${label}: lowest to highest. Press again for default.`;
}

function MarketingCompareInline({ current, previous, kind = "volume" }) {
    if (kind === "rate") {
        const c = Number(current);
        const hasCur = current != null && Number.isFinite(c);
        if (previous == null && !hasCur) return null;
    }
    if (previous == null) {
        return (
            <span
                className="marketing-report-delta marketing-report-delta--new"
                title="No matching attribution row in the comparison window"
            >
                new
            </span>
        );
    }
    if (kind === "rate") {
        const pts = formatPtsChange(current, previous);
        if (pts == null) return null;
        const c = Number(current);
        const p = Number(previous);
        const cls =
            Number.isFinite(c) && Number.isFinite(p)
                ? c > p
                    ? "marketing-report-delta--up"
                    : c < p
                      ? "marketing-report-delta--down"
                      : "marketing-report-delta--flat"
                : "";
        return (
            <span className={["marketing-report-delta", cls].filter(Boolean).join(" ")} title="Change vs comparison window (points)">
                {pts}
            </span>
        );
    }
    const rel = formatPctChange(current, previous);
    if (rel == null) return null;
    return (
        <span
            className={["marketing-report-delta", marketingCompareVolumeClass(current, previous)].filter(Boolean).join(" ")}
            title="Change vs comparison window"
        >
            {rel}
        </span>
    );
}

function MarketingMetricStack({ compareUi, primary, current, previous, kind = "volume" }) {
    return (
        <div className="marketing-report-cell-stack">
            <span className="marketing-report-cell-stack__primary">{primary}</span>
            {compareUi ? (
                <span className="marketing-report-cell-stack__compare">
                    <MarketingCompareInline kind={kind} current={current} previous={previous} />
                </span>
            ) : null}
        </div>
    );
}

function MarketingTableSortTh({ label, columnKey, kind, sortState, onCycle, className }) {
    const glyph = marketingSortButtonGlyph(columnKey, kind, sortState);
    const active = sortState.column === columnKey && sortState.step > 0;
    return (
        <th className={className}>
            <span className="marketing-report-th-inner">
                <span className="marketing-report-th-label">{label}</span>
                <button
                    type="button"
                    className={`marketing-report-col-sort${active ? " marketing-report-col-sort--active" : ""}`}
                    aria-label={marketingSortAriaLabel(label, columnKey, kind, sortState)}
                    title={marketingSortAriaLabel(label, columnKey, kind, sortState)}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onCycle(columnKey);
                    }}
                >
                    {glyph}
                </button>
            </span>
        </th>
    );
}

/**
 * Marketer-first signals: volume, acceptance, choice mix, data gaps.
 */
function computeMarketingHighlights({
    selectedChannel,
    channelOverview,
    drilldownRows,
    totalConsents,
    drillConsents,
    unclassifiedConsents,
    fromDate,
    toDate,
}) {
    const period = formatPeriodRange(fromDate, toDate);
    const periodPhrase = period ? `For ${period}` : "For your selected dates";

    if (selectedChannel) {
        const total = drillConsents;
        const nCamp = drilldownRows.length;
        const headline = `${total.toLocaleString("de-DE")} consents · ${nCamp} campaign${nCamp === 1 ? "" : "s"}`;
        const subline = `${selectedChannel} · ${periodPhrase.toLowerCase()}. Compare campaigns, then use Performance context for geography and paths.`;
        const items = [];
        if (nCamp === 0) {
            return {
                eyebrow: "Here's what to care about in this channel",
                headline,
                subline,
                items: [],
            };
        }

        const sorted = [...drilldownRows].sort((a, b) => b.consents - a.consents);
        const topCamp = sorted[0];
        const share = total > 0 ? Math.round((topCamp.consents / total) * 1000) / 10 : 0;
        items.push({
            accent: "spotlight",
            title: "Campaign carrying the load",
            body: `“${truncateLabel(topCamp.utmCampaign, 64)}” represents about ${share}% of this channel (${topCamp.consents.toLocaleString("de-DE")} events).`,
        });

        const minC = Math.max(5, Math.floor(total * 0.05));
        const withRate = sorted.filter(
            (r) => r.consents >= minC && r.acceptPct != null && Number.isFinite(r.acceptPct)
        );
        if (withRate.length >= 2) {
            const best = [...withRate].sort((a, b) => b.acceptPct - a.acceptPct)[0];
            const worst = [...withRate].sort((a, b) => a.acceptPct - b.acceptPct)[0];
            items.push({
                accent: "win",
                title: "Strongest acceptance",
                body: `“${truncateLabel(best.utmCampaign, 56)}” leads at ${best.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}% among campaigns with enough volume to compare.`,
            });
            if (worst.utmCampaign !== best.utmCampaign) {
                items.push({
                    accent: "watch",
                    title: "Review next",
                    body: `“${truncateLabel(worst.utmCampaign, 56)}” is lowest in that set (${worst.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%)—worth checking creative, landing, or consent timing.`,
                });
            }
        } else if (withRate.length === 1) {
            const only = withRate[0];
            items.push({
                accent: "data",
                title: "Acceptance",
                body: `One campaign clears the volume bar: ${only.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}% on “${truncateLabel(only.utmCampaign, 48)}”.`,
            });
        }

        const merged = mergeAllContext(drilldownRows);
        if (merged.topCountries.length > 0) {
            const c = merged.topCountries[0];
            items.push({
                accent: "data",
                title: "Top geography (merged)",
                body: `${c.id} shows the most volume in the slices returned (${c.consents.toLocaleString("de-DE")} consents). Expand Performance context for the full list.`,
            });
        }

        return {
            eyebrow: "Here's what to care about in this channel",
            headline,
            subline,
            items: items.slice(0, 5),
        };
    }

    if (channelOverview.length === 0) {
        return {
            eyebrow: "Here's what to care about today",
            headline: "No attributed marketing traffic in this window yet",
            subline: `${periodPhrase}. Widen the range, switch domain scope, or confirm UTMs on landing URLs.`,
            items: [],
        };
    }

    const headline = `${totalConsents.toLocaleString("de-DE")} tagged consent events · ${channelOverview.length} channel${channelOverview.length === 1 ? "" : "s"}`;
    const subline = `${periodPhrase}. Scan highlights first, then open a channel to compare campaigns.`;
    const items = [];
    const topCh = channelOverview[0];
    if (totalConsents > 0 && topCh) {
        const pct = Math.round((topCh.consents / totalConsents) * 1000) / 10;
        items.push({
            accent: "spotlight",
            title: "Where volume concentrates",
            body: `${topCh.channel} drives about ${pct}% of consents (${topCh.consents.toLocaleString("de-DE")} events)—often the first place to optimize spend and messaging.`,
        });
    }

    const minCh = Math.max(10, Math.floor(totalConsents * 0.04));
    const chWithRate = channelOverview.filter(
        (c) => c.consents >= minCh && c.acceptPct != null && Number.isFinite(c.acceptPct)
    );
    if (chWithRate.length >= 2) {
        const best = [...chWithRate].sort((a, b) => b.acceptPct - a.acceptPct)[0];
        const worst = [...chWithRate].sort((a, b) => a.acceptPct - b.acceptPct)[0];
        items.push({
            accent: "win",
            title: "Best acceptance among larger channels",
            body: `${best.channel} leads at ${best.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}% weighted acceptance (channels above a small volume floor).`,
        });
        if (worst.channel !== best.channel) {
            items.push({
                accent: "watch",
                title: "Softest signal in that set",
                body: `${worst.channel} is lowest at ${worst.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%—creative, landing page, or banner timing may deserve a pass.`,
            });
        }
    } else if (chWithRate.length === 1) {
        const only = chWithRate[0];
        items.push({
            accent: "data",
            title: "Acceptance snapshot",
            body: `With current volume, ${only.channel} is the main comparable signal: ${only.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}% weighted acceptance.`,
        });
    }

    const topEssential = [...channelOverview]
        .map((c) => ({
            ...c,
            essentialPct: c.consents > 0 ? (c.essentialOnly / c.consents) * 100 : 0,
        }))
        .sort((a, b) => b.essentialPct - a.essentialPct)[0];
    if (topEssential && topEssential.consents >= minCh && topEssential.essentialPct >= 18) {
        items.push({
            accent: "watch",
            title: "Necessary-only lean",
            body: `${topEssential.channel}: ${Math.round(topEssential.essentialPct * 10) / 10}% chose essential cookies only—align tags and analytics with how people actually consent.`,
        });
    }

    if (unclassifiedConsents > 0) {
        items.push({
            accent: "data",
            title: "Incomplete choice data",
            body: `${unclassifiedConsents.toLocaleString("de-DE")} events could not be split into accept / essential / granular; consent totals still include them.`,
        });
    }

    return {
        eyebrow: "Here's what to care about today",
        headline,
        subline,
        items: items.slice(0, 5),
    };
}

function MarketingHighlightsSection({ highlights }) {
    if (!highlights) {
        return null;
    }
    return (
        <section className="marketing-highlights" aria-labelledby="marketing-highlights-heading">
            <h2 id="marketing-highlights-heading" className="marketing-report-section__title marketing-highlights__h2">
                Highlights
            </h2>
            <p className="marketing-highlights__eyebrow">{highlights.eyebrow}</p>
            <p className="marketing-highlights__headline">{highlights.headline}</p>
            <p className="marketing-highlights__sub">{highlights.subline}</p>
            {highlights.items.length > 0 ? (
                <ul className="marketing-highlights__list">
                    {highlights.items.map((it, i) => (
                        <li
                            key={`${it.title}-${i}`}
                            className={`marketing-highlights__item marketing-highlights__item--${it.accent}`}
                        >
                            <span className="marketing-highlights__item-title">{it.title}</span>
                            <p className="marketing-highlights__item-body">{it.body}</p>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
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
    /** Raw baseline window rows (same shape as primary) when period comparison is on. */
    const [baselineRows, setBaselineRows] = useState([]);
    const [baselineSummary, setBaselineSummary] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [compareBaselineNote, setCompareBaselineNote] = useState(null);
    /** Level 2: which channel’s campaigns are shown; null = channel overview. */
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [channelTableSort, setChannelTableSort] = useState({ column: null, step: 0 });
    const [campaignTableSort, setCampaignTableSort] = useState({ column: null, step: 0 });

    const endpoint = API[id]?.marketingAttribution;

    const fetchReport = useCallback(async () => {
        if (!endpoint?.url) {
            setError("Marketing is not configured for this platform.");
            setRows([]);
            setBaselineRows([]);
            setSummary(null);
            setBaselineSummary(null);
            return;
        }
        setLoading(true);
        setError(null);
        setCompareBaselineNote(null);
        try {
            const compareOn = compareRangeActive(compareRange);
            const baseHeaders = { ...endpoint.headers, Domains: domainsApiHeader };
            const primaryHeaders = {
                ...baseHeaders,
                FromDate: toYmd(fromDate),
                ToDate: toYmd(toDate),
            };
            if (compareOn) {
                primaryHeaders.CompareRange =
                    compareRange === "Same period last year" ? "Same period last year" : String(compareRange);
                primaryHeaders.PreviousPeriod = toYmd(previousPeriod);
                primaryHeaders.PreviousPeriod2 = toYmd(previousPeriod2);
                primaryHeaders["X-Compare-Start"] = toYmd(previousPeriod);
                primaryHeaders["X-Compare-End"] = toYmd(previousPeriod2);
                primaryHeaders["X-Compare-Range"] = primaryHeaders.CompareRange;
            } else {
                primaryHeaders.CompareRange = "";
                primaryHeaders.PreviousPeriod = "";
                primaryHeaders.PreviousPeriod2 = "";
                primaryHeaders["X-Compare-Start"] = "";
                primaryHeaders["X-Compare-End"] = "";
                primaryHeaders["X-Compare-Range"] = "";
            }

            const baselineHeaders = {
                ...baseHeaders,
                FromDate: toYmd(previousPeriod),
                ToDate: toYmd(previousPeriod2),
                CompareRange: "",
                PreviousPeriod: "",
                PreviousPeriod2: "",
                "X-Compare-Start": "",
                "X-Compare-End": "",
                "X-Compare-Range": "",
            };

            const reqMethod = endpoint.method || "GET";
            const primaryFetch = fetch(endpoint.url, { method: reqMethod, headers: primaryHeaders });
            const fetches = compareOn
                ? [primaryFetch, fetch(endpoint.url, { method: reqMethod, headers: baselineHeaders })]
                : [primaryFetch];
            const responses = await Promise.all(fetches);
            const res = responses[0];
            const resBaseline = compareOn ? responses[1] : null;

            const text = await res.text();
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                setError("The server returned a non-JSON response.");
                setRows([]);
                setBaselineRows([]);
                setSummary(null);
                setBaselineSummary(null);
                return;
            }
            if (!res.ok) {
                setError(json?.message || `Request failed (${res.status}).`);
                setRows([]);
                setBaselineRows([]);
                setSummary(null);
                setBaselineSummary(null);
                return;
            }
            if (json === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            let baselineMapped = [];
            let baselineSummaryNext = null;
            if (compareOn && resBaseline) {
                const textB = await resBaseline.text();
                let jsonB = null;
                try {
                    jsonB = textB ? JSON.parse(textB) : null;
                } catch {
                    setCompareBaselineNote("Comparison window returned non-JSON data.");
                }
                if (jsonB === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                if (!resBaseline.ok) {
                    setCompareBaselineNote(jsonB?.message || `Comparison request failed (${resBaseline.status}).`);
                } else if (jsonB != null) {
                    baselineMapped = extractRows(jsonB).map(mapRow);
                    baselineSummaryNext = extractSummary(jsonB);
                }
            }

            const rawRows = extractRows(json);
            const primaryMapped = rawRows.map(mapRow).sort((a, b) => b.consents - a.consents);
            const merged = attachBaselineToRows(primaryMapped, compareOn ? baselineMapped : []);
            setRows(merged);
            setBaselineRows(compareOn ? baselineMapped : []);
            setSummary(extractSummary(json));
            setBaselineSummary(compareOn ? baselineSummaryNext : null);
            setSelectedChannel(null);
        } catch (e) {
            setError(e?.message || "Network error while loading marketing data.");
            setRows([]);
            setBaselineRows([]);
            setSummary(null);
            setBaselineSummary(null);
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

    const compareOn = useMemo(() => compareRangeActive(compareRange), [compareRange]);
    const compareUi = compareOn && !compareBaselineNote;

    const totalConsents = useMemo(
        () => pickTotalConsentsFromSummary(summary, rows),
        [summary, rows]
    );

    const totalBaselineConsents = useMemo(() => {
        if (!compareUi) return null;
        return pickTotalConsentsFromSummary(baselineSummary, baselineRows);
    }, [compareUi, baselineSummary, baselineRows]);

    const channelOverview = useMemo(() => buildChannelOverview(rows), [rows]);

    const channelOverviewWithCompare = useMemo(
        () => mergeChannelOverviewWithBaseline(channelOverview, compareUi ? baselineRows : []),
        [channelOverview, baselineRows, compareUi]
    );

    const drilldownRows = useMemo(() => {
        if (!selectedChannel) return [];
        return rows.filter((r) => r.channel === selectedChannel);
    }, [rows, selectedChannel]);

    const sortedChannelOverview = useMemo(
        () => sortChannelOverviewRows(channelOverviewWithCompare, channelTableSort),
        [channelOverviewWithCompare, channelTableSort]
    );

    const sortedDrilldownRows = useMemo(
        () => sortCampaignDrilldownRows(drilldownRows, campaignTableSort),
        [drilldownRows, campaignTableSort]
    );

    const cycleChannelTableSort = useCallback((columnKey) => {
        setChannelTableSort((prev) => cycleMarketingTableSort(prev, columnKey));
    }, []);

    const cycleCampaignTableSort = useCallback((columnKey) => {
        setCampaignTableSort((prev) => cycleMarketingTableSort(prev, columnKey));
    }, []);

    const drillConsents = useMemo(
        () => drilldownRows.reduce((s, r) => s + r.consents, 0),
        [drilldownRows]
    );

    const measurementReadyCount = useMemo(() => {
        if (selectedChannel) {
            return drilldownRows.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0);
        }
        return pickMeasurementReadyCount(summary, rows);
    }, [selectedChannel, drilldownRows, summary, rows]);

    const measurementReadySharePct = useMemo(() => {
        if (selectedChannel) {
            const t = drilldownRows.reduce((s, r) => s + (Number(r.consents) || 0), 0);
            const a = drilldownRows.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0);
            return t > 0 ? Math.round((a / t) * 1000) / 10 : null;
        }
        return pickMeasurementReadySharePct(summary, rows);
    }, [selectedChannel, drilldownRows, summary, rows]);

    const baselineMeasurementReadyCount = useMemo(() => {
        if (!compareUi) return null;
        if (selectedChannel) {
            return baselineRows
                .filter((r) => r.channel === selectedChannel)
                .reduce((s, r) => s + (Number(r.acceptAll) || 0), 0);
        }
        return pickMeasurementReadyCount(baselineSummary, baselineRows);
    }, [compareUi, selectedChannel, baselineRows, baselineSummary]);

    const baselineMeasurementReadySharePct = useMemo(() => {
        if (!compareUi) return null;
        if (selectedChannel) {
            const br = baselineRows.filter((r) => r.channel === selectedChannel);
            const t = br.reduce((s, r) => s + (Number(r.consents) || 0), 0);
            const a = br.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0);
            return t > 0 ? Math.round((a / t) * 1000) / 10 : null;
        }
        return pickMeasurementReadySharePct(baselineSummary, baselineRows);
    }, [compareUi, selectedChannel, baselineRows, baselineSummary]);

    const drillBaselineConsents = useMemo(() => {
        if (!compareUi || !selectedChannel) return null;
        return baselineRows
            .filter((r) => r.channel === selectedChannel)
            .reduce((s, r) => s + (Number(r.consents) || 0), 0);
    }, [compareUi, baselineRows, selectedChannel]);

    const drillBaselineCampaignCount = useMemo(() => {
        if (!compareUi || !selectedChannel) return null;
        return baselineRows.filter((r) => r.channel === selectedChannel).length;
    }, [compareUi, baselineRows, selectedChannel]);

    const baselineChannelCount = useMemo(() => {
        if (!compareUi) return null;
        return buildChannelOverview(baselineRows).length;
    }, [compareUi, baselineRows]);

    const unclassifiedConsents = useMemo(
        () =>
            rows.reduce((sum, r) => {
                const c = (r.acceptAll ?? 0) + (r.essentialOnly ?? 0) + (r.granular ?? 0);
                return sum + Math.max(0, r.consents - c);
            }, 0),
        [rows]
    );

    const highlights = useMemo(
        () =>
            computeMarketingHighlights({
                selectedChannel,
                channelOverview,
                drilldownRows,
                totalConsents,
                drillConsents,
                unclassifiedConsents,
                fromDate,
                toDate,
            }),
        [
            selectedChannel,
            channelOverview,
            drilldownRows,
            totalConsents,
            drillConsents,
            unclassifiedConsents,
            fromDate,
            toDate,
        ]
    );

    const exportCsvMeta = useMemo(
        () => ({
            from: toYmd(fromDate),
            to: toYmd(toDate),
            scope: listDomainLabel,
            generatedAt: new Date().toISOString(),
            compareOn,
            compareExport: compareUi,
            compareFrom: compareOn ? toYmd(previousPeriod) : "",
            compareTo: compareOn ? toYmd(previousPeriod2) : "",
        }),
        [fromDate, toDate, listDomainLabel, compareOn, compareUi, previousPeriod, previousPeriod2]
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

    useEffect(() => {
        setChannelTableSort({ column: null, step: 0 });
        setCampaignTableSort({ column: null, step: 0 });
    }, [selectedChannel]);

    const kpiCards = useMemo(() => {
        const cards = [
            {
                key: "channels",
                label: selectedChannel ? "Campaigns in channel" : "Channels",
                value: selectedChannel
                    ? drilldownRows.length.toLocaleString("de-DE")
                    : channelOverview.length.toLocaleString("de-DE"),
                hint: null,
                compare:
                    compareUi && selectedChannel && drillBaselineCampaignCount != null ? (
                        <MarketingCompareInline
                            kind="volume"
                            current={drilldownRows.length}
                            previous={drillBaselineCampaignCount}
                        />
                    ) : compareUi && !selectedChannel && baselineChannelCount != null ? (
                        <MarketingCompareInline
                            kind="volume"
                            current={channelOverview.length}
                            previous={baselineChannelCount}
                        />
                    ) : null,
            },
            {
                key: "consents",
                label: selectedChannel ? "Consents (this channel)" : "Consents in view",
                value: (selectedChannel ? drillConsents : totalConsents).toLocaleString("de-DE"),
                hint: selectedChannel
                    ? null
                    : "Total includes all attributed rows for this period (not only the table page).",
                compare:
                    compareUi && selectedChannel && drillBaselineConsents != null ? (
                        <MarketingCompareInline kind="volume" current={drillConsents} previous={drillBaselineConsents} />
                    ) : compareUi && !selectedChannel && totalBaselineConsents != null ? (
                        <MarketingCompareInline kind="volume" current={totalConsents} previous={totalBaselineConsents} />
                    ) : null,
            },
            {
                key: "measurement-ready",
                label: selectedChannel ? "Full-stack consents (channel)" : "Full-stack consent events",
                value: measurementReadyCount.toLocaleString("de-DE"),
                hint: "Accept-all choices: optional analytics & marketing categories fully on. Useful for budget discussions — not revenue or ROAS.",
                compare:
                    compareUi && baselineMeasurementReadyCount != null ? (
                        <MarketingCompareInline
                            kind="volume"
                            current={measurementReadyCount}
                            previous={baselineMeasurementReadyCount}
                        />
                    ) : null,
            },
            {
                key: "measurement-share",
                label: selectedChannel ? "Full-stack share (channel)" : "Full-stack share of tagged traffic",
                value:
                    measurementReadySharePct != null && Number.isFinite(measurementReadySharePct)
                        ? `${measurementReadySharePct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`
                        : "—",
                hint: "Share of attributed consent events in this view with accept-all. Compare periods to see if spend reaches consenting audiences.",
                compare:
                    compareUi &&
                    baselineMeasurementReadySharePct != null &&
                    measurementReadySharePct != null &&
                    Number.isFinite(measurementReadySharePct) &&
                    Number.isFinite(baselineMeasurementReadySharePct) ? (
                        <MarketingCompareInline
                            kind="rate"
                            current={measurementReadySharePct}
                            previous={baselineMeasurementReadySharePct}
                        />
                    ) : null,
            },
        ];
        if (summary && typeof summary === "object") {
            if (summary.sessionsWithMarketingParams != null) {
                cards.push({
                    key: "sessions-marketing",
                    label: "Sessions w/ marketing params",
                    value: String(summary.sessionsWithMarketingParams),
                    hint: null,
                    compare: null,
                });
            }
            if (summary.distinctCampaigns != null) {
                cards.push({
                    key: "distinct-campaigns",
                    label: "Distinct campaigns",
                    value: String(summary.distinctCampaigns),
                    hint: null,
                    compare: null,
                });
            }
        }
        return cards;
    }, [
        totalConsents,
        drillConsents,
        summary,
        selectedChannel,
        drilldownRows.length,
        channelOverview.length,
        compareUi,
        drillBaselineCampaignCount,
        drillBaselineConsents,
        baselineChannelCount,
        totalBaselineConsents,
        measurementReadyCount,
        measurementReadySharePct,
        baselineMeasurementReadyCount,
        baselineMeasurementReadySharePct,
    ]);

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
                        <p className="marketing-report-hero__lede">
                            <strong>Start with Highlights</strong> for what deserves attention in your selected period,
                            then drill into channels and campaigns. <strong>Full-stack consent events</strong> show how
                            much of your tagged traffic actually accepted every optional category — a budget signal, not
                            ROAS. Cookie choices (accept all, essential only, granular) explain how tags can fire;
                            exports sit below if you need a spreadsheet.
                        </p>
                        {compareOn ? (
                            <p className="marketing-report-compare-banner">
                                Period comparison is on: <strong>{formatPeriodRange(fromDate, toDate)}</strong> vs{" "}
                                <strong>{formatPeriodRange(previousPeriod, previousPeriod2)}</strong>. Table deltas match
                                rows by source, medium, campaign, and referrer host.
                            </p>
                        ) : null}
                        {compareBaselineNote ? (
                            <p className="marketing-report-compare-warning" role="status">
                                {compareBaselineNote} Current-period figures are still shown; baseline deltas are hidden
                                until the comparison request succeeds.
                            </p>
                        ) : null}
                    </header>

                    {error ? (
                        <div className="marketing-report-error" role="alert">
                            {error}
                            <pre className="marketing-report-code">
                                {`Example row: { "utm_source": "fb", "utm_medium": "paid", "utm_campaign": "spring_sale", "consents": 120, "acceptRate": 72.5, "acceptAll": 72, "essentialOnly": 30, "granular": 18 }`}
                            </pre>
                        </div>
                    ) : null}

                    {!error && !(loading && rows.length === 0) ? (
                        <MarketingHighlightsSection highlights={highlights} />
                    ) : null}

                    <section className="marketing-report-section" aria-labelledby="at-a-glance-heading">
                        <h2 id="at-a-glance-heading" className="marketing-report-section__title">
                            At a glance
                        </h2>
                        <p className="marketing-report-section__hint">
                            {compareOn
                                ? `Primary window ${formatPeriodRange(fromDate, toDate)} · Baseline ${formatPeriodRange(previousPeriod, previousPeriod2)}.`
                                : "Quick counts for the same date range as the header filter."}{" "}
                            Full-stack metrics use the API summary when available so totals stay correct even if the
                            campaign table is paginated.
                        </p>
                        <div className="marketing-report-summary">
                            {kpiCards.map((c) => (
                                <div key={c.key || c.label} className="marketing-report-kpi">
                                    <span className="marketing-report-kpi__label">{c.label}</span>
                                    <span className="marketing-report-kpi__value">{c.value}</span>
                                    {c.hint ? <p className="marketing-report-kpi__hint">{c.hint}</p> : null}
                                    {c.compare ? <div className="marketing-report-kpi__compare">{c.compare}</div> : null}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="marketing-report-section" aria-labelledby="exports-heading">
                        <h2 id="exports-heading" className="marketing-report-section__title">
                            Exports & navigation
                        </h2>
                        <p className="marketing-report-section__hint">
                            Download CSV for stakeholders; use back to return to all channels.
                        </p>
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
                                            const data = selectedChannel ? sortedDrilldownRows : rows;
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
                                                buildMarketingCsvChannelRows(sortedChannelOverview, exportCsvMeta)
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
                    </section>

                    <section className="marketing-report-section" aria-labelledby="perf-context-section-h">
                        <h2 id="perf-context-section-h" className="marketing-report-section__title">
                            What's driving differences
                        </h2>
                        <p className="marketing-report-section__hint">
                            Geography, landing paths, and UTM variants (merged from campaign-level API slices).
                        </p>
                    {rows.length > 0 ? (
                        <MarketingContextSection
                            heading={
                                selectedChannel
                                    ? `${selectedChannel} · detail`
                                    : "All channels · detail"
                            }
                            rows={selectedChannel ? drilldownRows : rows}
                        />
                    ) : null}
                    </section>

                    <section className="marketing-report-section" aria-labelledby="detail-table-heading">
                        <h2 id="detail-table-heading" className="marketing-report-section__title">
                            {selectedChannel ? `Campaigns · ${selectedChannel}` : "Channels & campaigns"}
                        </h2>
                        <p className="marketing-report-section__hint">
                            {selectedChannel
                                ? compareUi
                                    ? "Per-campaign metrics vs the comparison window for matched rows. Choice columns are current period only."
                                    : "Per-campaign consent and cookie-choice mix for this channel."
                                : compareUi
                                  ? "Channel totals vs the comparison window. Deltas use baseline traffic grouped the same way as the primary table."
                                  : "Open a channel row to see individual campaigns."}
                        </p>

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
                                        <MarketingTableSortTh
                                            label="Campaign name"
                                            columnKey="utmCampaign"
                                            kind={CAMPAIGN_SORT_KEYS.utmCampaign}
                                            sortState={campaignTableSort}
                                            onCycle={cycleCampaignTableSort}
                                            className="marketing-report-table__col-campaign"
                                        />
                                        <MarketingTableSortTh
                                            label="Consents"
                                            columnKey="consents"
                                            kind={CAMPAIGN_SORT_KEYS.consents}
                                            sortState={campaignTableSort}
                                            onCycle={cycleCampaignTableSort}
                                            className="marketing-report-table__col-num"
                                        />
                                        <MarketingTableSortTh
                                            label="Acceptance %"
                                            columnKey="acceptPct"
                                            kind={CAMPAIGN_SORT_KEYS.acceptPct}
                                            sortState={campaignTableSort}
                                            onCycle={cycleCampaignTableSort}
                                            className="marketing-report-table__col-num"
                                        />
                                        <MarketingTableSortTh
                                            label="Accept all"
                                            columnKey="acceptAll"
                                            kind={CAMPAIGN_SORT_KEYS.acceptAll}
                                            sortState={campaignTableSort}
                                            onCycle={cycleCampaignTableSort}
                                            className="marketing-report-table__col-choice"
                                        />
                                        <MarketingTableSortTh
                                            label="Essential only"
                                            columnKey="essentialOnly"
                                            kind={CAMPAIGN_SORT_KEYS.essentialOnly}
                                            sortState={campaignTableSort}
                                            onCycle={cycleCampaignTableSort}
                                            className="marketing-report-table__col-choice"
                                        />
                                        <MarketingTableSortTh
                                            label="Granular"
                                            columnKey="granular"
                                            kind={CAMPAIGN_SORT_KEYS.granular}
                                            sortState={campaignTableSort}
                                            onCycle={cycleCampaignTableSort}
                                            className="marketing-report-table__col-choice"
                                        />
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
                                        sortedDrilldownRows.map((r, i) => (
                                            <tr key={`${r.channel}-${r.utmCampaign}-${i}`}>
                                                <td className="marketing-report-table__col-campaign">{r.utmCampaign}</td>
                                                <td className="marketing-report-table__col-num">
                                                    <MarketingMetricStack
                                                        compareUi={compareUi}
                                                        primary={r.consents.toLocaleString("de-DE")}
                                                        current={r.consents}
                                                        previous={r.prevConsents}
                                                        kind="volume"
                                                    />
                                                </td>
                                                <td className="marketing-report-table__col-num">
                                                    <MarketingMetricStack
                                                        compareUi={compareUi}
                                                        primary={
                                                            r.acceptPct != null && Number.isFinite(r.acceptPct)
                                                                ? `${r.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`
                                                                : "—"
                                                        }
                                                        current={r.acceptPct}
                                                        previous={r.prevAcceptPct}
                                                        kind="rate"
                                                    />
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
                                        <MarketingTableSortTh
                                            label="Channel"
                                            columnKey="channel"
                                            kind={CHANNEL_SORT_KEYS.channel}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-channel"
                                        />
                                        <MarketingTableSortTh
                                            label="Campaigns"
                                            columnKey="campaignCount"
                                            kind={CHANNEL_SORT_KEYS.campaignCount}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-num"
                                        />
                                        <MarketingTableSortTh
                                            label="Consents"
                                            columnKey="consents"
                                            kind={CHANNEL_SORT_KEYS.consents}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-num"
                                        />
                                        <MarketingTableSortTh
                                            label="Acceptance %"
                                            columnKey="acceptPct"
                                            kind={CHANNEL_SORT_KEYS.acceptPct}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-num"
                                        />
                                        <MarketingTableSortTh
                                            label="Accept all"
                                            columnKey="acceptAll"
                                            kind={CHANNEL_SORT_KEYS.acceptAll}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-choice"
                                        />
                                        <MarketingTableSortTh
                                            label="Essential only"
                                            columnKey="essentialOnly"
                                            kind={CHANNEL_SORT_KEYS.essentialOnly}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-choice"
                                        />
                                        <MarketingTableSortTh
                                            label="Granular"
                                            columnKey="granular"
                                            kind={CHANNEL_SORT_KEYS.granular}
                                            sortState={channelTableSort}
                                            onCycle={cycleChannelTableSort}
                                            className="marketing-report-table__col-choice"
                                        />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedChannelOverview.map((r) => (
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
                                                <MarketingMetricStack
                                                    compareUi={compareUi}
                                                    primary={r.campaignCount.toLocaleString("de-DE")}
                                                    current={r.campaignCount}
                                                    previous={r.prevCampaignCount}
                                                    kind="volume"
                                                />
                                            </td>
                                            <td className="marketing-report-table__col-num">
                                                <MarketingMetricStack
                                                    compareUi={compareUi}
                                                    primary={r.consents.toLocaleString("de-DE")}
                                                    current={r.consents}
                                                    previous={r.prevConsents}
                                                    kind="volume"
                                                />
                                            </td>
                                            <td className="marketing-report-table__col-num">
                                                <MarketingMetricStack
                                                    compareUi={compareUi}
                                                    primary={
                                                        r.acceptPct != null && Number.isFinite(r.acceptPct)
                                                            ? `${r.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`
                                                            : "—"
                                                    }
                                                    current={r.acceptPct}
                                                    previous={r.prevAcceptPct}
                                                    kind="rate"
                                                />
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
                    </section>
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
