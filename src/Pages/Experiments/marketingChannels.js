/*
 * --- KNOWN_CHANNELS -----------------------------------------------------
 *
 * Shared registry of paid channels recognised across the platform. Used by:
 *
 *  - The Experiment Builder to populate the "audience targeting" dropdown
 *    and to pre-fill the utm_source matcher when a marketer creates an
 *    experiment scoped to one channel.
 *  - (Eventually) the consent-banner runtime, which reads
 *    `window.INTA.experiment.channel.match.utmSource` to decide whether
 *    to enroll the current visitor in the experiment.
 *
 * The `utmSource` arrays mirror the example aliases the marketing
 * reconciliation panel uses to filter consent rows. Keeping them in
 * lock-step here means: if a marketer sees "Google Ads has 60% invisible
 * traffic" in the dashboard, then creates a Google-Ads-scoped experiment,
 * the visitors who get enrolled are exactly the visitors that fed the
 * dashboard number. No surprise mismatches.
 *
 * The `match.utmSource` list is *literal aliases*, not a regex. The
 * banner runtime is expected to:
 *   1. Lower-case + strip punctuation/whitespace from the visitor's
 *      utm_source.
 *   2. Test whether any alias is a *prefix* of the canonicalised value.
 *
 * That mirrors the dashboard's `^(?:google|adwords|gads)/` style without
 * forcing customers to ship a regex inside their data layer. If/when a
 * customer needs a custom matcher, "Other / custom" lets them list their
 * own aliases.
 */

/*
 * `aliases` covers every channel name the marketing dashboard's
 * `deriveMarketingChannel` is known to emit for this paid channel
 * (paid + organic variants both — when an organic Facebook visit gets
 * scoped into an experiment, "Meta Ads" is still the right audience
 * bucket on the banner side, since the utm_source matcher is what
 * actually decides enrollment).
 *
 * The matcher canonicalises both sides (lowercase, strip non-alphanumeric)
 * before comparing, so "Facebook Ads" and "facebook-ads" hit the same
 * entry. Add new aliases here whenever the dashboard learns to emit a
 * new label — that keeps the deep-link prefill in the experiment builder
 * forgiving without forcing each callsite to know about every variant.
 */
export const KNOWN_CHANNELS = [
    {
        id: "google_ads",
        label: "Google Ads",
        aliases: ["Google Ads", "Google", "AdWords", "Adwords"],
        utmSource: ["google", "googleads", "adwords", "gads"],
    },
    {
        id: "meta_ads",
        label: "Meta (Facebook / Instagram) Ads",
        aliases: [
            "Meta Ads",
            "Meta",
            "Facebook Ads",
            "Facebook",
            "Facebook (Organic)",
            "Instagram Ads",
            "Instagram",
        ],
        utmSource: ["facebook", "fb", "meta", "instagram", "ig"],
    },
    {
        id: "microsoft_ads",
        label: "Microsoft / Bing Ads",
        aliases: ["Microsoft Ads", "Bing Ads", "Bing", "Microsoft"],
        utmSource: ["bing", "microsoft", "msads", "msn"],
    },
    {
        id: "linkedin_ads",
        label: "LinkedIn Ads",
        aliases: ["LinkedIn Ads", "LinkedIn"],
        utmSource: ["linkedin", "liads"],
    },
    {
        id: "tiktok_ads",
        label: "TikTok Ads",
        aliases: ["TikTok Ads", "TikTok"],
        utmSource: ["tiktok", "ttads"],
    },
    {
        id: "pinterest_ads",
        label: "Pinterest Ads",
        aliases: ["Pinterest Ads", "Pinterest"],
        utmSource: ["pinterest"],
    },
    {
        id: "twitter_ads",
        label: "X (Twitter) Ads",
        aliases: [
            "X (Twitter) Ads",
            "X Ads",
            "X (Twitter)",
            "Twitter Ads",
            "Twitter",
        ],
        utmSource: ["twitter", "twtr", "xads", "x"],
    },
    {
        id: "reddit_ads",
        label: "Reddit Ads",
        aliases: ["Reddit Ads", "Reddit"],
        utmSource: ["reddit", "rdtads"],
    },
];

const CHANNEL_BY_ID = KNOWN_CHANNELS.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
}, {});

export function getChannelById(id) {
    if (!id) return null;
    return CHANNEL_BY_ID[id] || null;
}

/**
 * Canonicalise an arbitrary channel name / scope hint for fuzzy matching.
 *
 * The marketing dashboard exposes channels with display labels like
 * "Google Ads" or "Meta (Facebook / Instagram) Ads". Deep-link CTAs from
 * the suggestions strip pass them through `?scope=channel:Google%20Ads`,
 * so we need a forgiving normaliser that turns both "google_ads" and
 * "Google Ads" into the same key.
 */
function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

/**
 * Try to find a known channel that matches a free-form scope hint.
 *
 *   findChannelFromHint("channel:Google Ads")    → google_ads entry
 *   findChannelFromHint("Facebook Ads")          → meta_ads entry
 *   findChannelFromHint("X (Twitter) Ads")       → twitter_ads entry
 *   findChannelFromHint("Direct traffic")        → null  (no paid match)
 *
 * Matching runs in two passes so a more-specific alias wins over a
 * shorter prefix:
 *
 *   1. Exact match against id, label, or any alias.
 *   2. Fallback prefix/contains match against the same set.
 *
 * Without the two passes, an ambiguous hint like "Google" could end up
 * matching whichever entry happens to come first in the array via prefix
 * matching, even when an exact alias exists later. Returns `null` when
 * nothing reasonable matches; the caller drops back to "all visitors".
 */
export function findChannelFromHint(hint) {
    if (!hint) return null;
    const stripped = String(hint).startsWith("channel:")
        ? String(hint).slice("channel:".length)
        : String(hint);
    const norm = normalize(stripped);
    if (!norm) return null;

    const candidates = KNOWN_CHANNELS.map((c) => ({
        channel: c,
        haystack: [c.id, c.label, ...(c.aliases || [])]
            .map(normalize)
            .filter(Boolean),
    }));

    for (const { channel, haystack } of candidates) {
        if (haystack.includes(norm)) return channel;
    }

    for (const { channel, haystack } of candidates) {
        for (const candidate of haystack) {
            if (
                candidate.startsWith(norm) ||
                norm.startsWith(candidate) ||
                candidate.includes(norm)
            ) {
                return channel;
            }
        }
    }

    return null;
}
