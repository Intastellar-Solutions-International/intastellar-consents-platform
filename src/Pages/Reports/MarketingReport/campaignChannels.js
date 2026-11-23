// Campaign rows → marketing channels. Shared by the Campaign consent page
// (index.js) and the mobile app (apps/mobile), so both group traffic the
// same way. Plain functions only — no React, no browser APIs.

/** Accept several possible API shapes */
export function extractRows(payload) {
    if (payload == null) return [];
    const root = payload.data != null ? payload.data : payload;
    if (Array.isArray(root)) return root;
    if (Array.isArray(root.rows)) return root.rows;
    if (Array.isArray(root.campaigns)) return root.campaigns;
    if (Array.isArray(root.items)) return root.items;
    if (Array.isArray(root.attribution)) return root.attribution;
    return [];
}

export function normUtm(s) {
    return String(s ?? "")
        .trim()
        .toLowerCase();
}

/** Stable join key for matching primary-period rows to baseline-period rows. */
export function marketingAttributionRowKey(utmSource, utmMedium, rawCampaign, referrer) {
    return [
        normUtm(utmSource),
        normUtm(utmMedium),
        normUtm(String(rawCampaign ?? "").trim()),
        normUtm(referrer),
    ].join("|");
}

/**
 * Shorten redundant Capterra UTM fragments in the campaign cell, e.g. utm_Capterra=capterra → Capterra.
 */
export function simplifyCampaignDisplay(campaignRaw) {
    let t = String(campaignRaw ?? "").trim();
    if (!t || t === "—") {
        return t || "—";
    }
    t = t.replace(/\butm_capterra\s*=\s*capterra\b/gi, "Capterra");
    t = t.replace(/\s*·\s*(?:·\s*)+/g, " · ").replace(/^\s*·\s*|\s*·\s*$/g, "").trim();
    t = t.replace(/\s{2,}/g, " ");
    return t === "" ? "—" : t;
}

/*
 * Known search-engine hosts for classifying untagged organic traffic.
 *
 * We match Google's country TLDs (google.com, google.de, google.co.uk,
 * google.com.au…) with a regex, and the rest of the long tail with an
 * exact-host set. Hostnames are compared lowercased and with a stripped
 * `www.` prefix. The list intentionally excludes platform-specific
 * hosts (instagram.com, facebook.com, linkedin.com, etc.) because those
 * are already classified as platform-organic channels earlier in
 * `deriveMarketingChannel` and we don't want to collapse that detail.
 */
const SEARCH_ENGINE_HOSTS = new Set([
    "bing.com",
    "duckduckgo.com",
    "yahoo.com",
    "search.yahoo.com",
    "baidu.com",
    "yandex.com",
    "yandex.ru",
    "ecosia.org",
    "qwant.com",
    "startpage.com",
    "search.brave.com",
    "ask.com",
    "naver.com",
    "kagi.com",
    "search.aol.com",
    "search.aol.co.uk",
    "presearch.com",
]);

export function isSearchEngineHost(host) {
    if (!host || host === "—") return false;
    const h = String(host).toLowerCase().replace(/^www\./, "");
    if (!h) return false;
    if (/^google(?:\.[a-z]{2,}){1,3}$/.test(h)) return true;
    return SEARCH_ENGINE_HOSTS.has(h);
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
export function deriveMarketingChannel(row) {
    const s = normUtm(row.utmSource);
    const m = normUtm(row.utmMedium);
    const campaign = normUtm(row.utmCampaign);
    const host = normUtm(row.referrer).replace(/^www\./, "");
    const paidLike = /cpc|ppc|paid|social|ads|display|paidsocial|paid_social/.test(m);
    const metaPaidPlacement = isMetaPaidPlacementMedium(m);
    /*
     * A row is "untagged" when neither utm_source nor utm_medium carry
     * a real value (both null/empty or the COALESCE'd "—" placeholder).
     * Platform-family host checks below still short-circuit first, so
     * organic Instagram / Facebook / LinkedIn / X referrals keep their
     * own labels. Everything that falls past those checks gets routed
     * into Direct / Organic search / Referral by referrer host.
     */
    const isUntagged = (!s || s === "—") && (!m || m === "—");

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
        /*
         * A referrer from google.com with no UTM tags at all is
         * an organic SERP click, not a campaign. Routing it under
         * "Google" used to conflate it with branded paid traffic
         * and inflated the "Google" channel with SEO visits.
         */
        if (isUntagged && fromGoogleReferrer) return "Organic search";
        if (isGoogleOrganicMedium(m)) return "Organic search";
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

    /*
     * Untagged traffic fallback. Three buckets:
     *   - no referrer host        → Direct traffic (typed URL, bookmark, app, etc.)
     *   - referrer is a search UI → Organic search (Bing, DuckDuckGo, Yahoo, Yandex, Ecosia, …)
     *   - any other referrer      → Referral (host) — a blog post, partner link, email client, etc.
     * Google organic is handled earlier in the Google block.
     */
    if (host && host !== "—") {
        if (isSearchEngineHost(host)) return "Organic search";
        const pretty = String(row.referrer).replace(/^www\./i, "");
        return `Referral (${pretty})`;
    }

    return "Direct traffic";
}

export function mapRow(r) {
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
        granular:
            Number(
                r.granular ??
                    r.granular_choices ??
                    r.granularChoices ??
                    r.granular_consents ??
                    r.granularConsents ??
                    r.partial ??
                    r.partial_consents ??
                    r.partialConsents ??
                    r.custom ??
                    r.custom_choice ??
                    r.customChoice ??
                    r.custom_consents ??
                    r.customConsents ??
                    0
            ) || 0,
        context: normalizeContext(r.context),
        rowKey: marketingAttributionRowKey(utmSource, utmMedium, rawCampaign, referrerNorm),
    };
    return {
        ...base,
        channel: deriveMarketingChannel({ ...base, utmCampaign: rawCampaign }),
    };
}

export function normalizeContext(ctx) {
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

/** Weighted average acceptance % by consent volume (rows without accept % are skipped). */
export function aggregateWeightedAcceptPct(rowList) {
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
export function buildChannelOverview(rowList) {
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
