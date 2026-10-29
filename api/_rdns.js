import dns from "dns";
const dnsPromises = dns.promises;

// Forward-confirmed reverse-DNS (FCrDNS) verification for self-identified
// bot traffic. detectBot() in api/a.js trusts the User-Agent string alone,
// which anyone can spoof; this adds a second, independent signal checked
// against the request's actual IP, which a UA string can't fake.
//
// Vendors that publish an official verification domain for their crawler
// fleet (the PTR hostname must end in one of these suffixes) — this is the
// same check Google/Bing/Yandex/Baidu/Apple document for verifying their own
// bots. Bot names not listed here (most AI crawlers, SEO tools, uptime
// monitors, ...) don't publish a specific domain to check against, so they
// fall back to a generic FCrDNS check below: "does this IP have *any*
// forward-confirmed reverse DNS" rather than "does it belong to vendor X".
const VERIFIED_DOMAINS = {
    "Googlebot":                 [".googlebot.com", ".google.com"],
    "Googlebot-Image":           [".googlebot.com", ".google.com"],
    "Googlebot-Video":           [".googlebot.com", ".google.com"],
    "Googlebot-News":            [".googlebot.com", ".google.com"],
    "AdsBot-Google":              [".google.com"],
    "AdsBot-Google-Mobile":       [".google.com"],
    "Mediapartners-Google (AdSense)": [".google.com"],
    "APIs-Google":                [".google.com"],
    "Storebot-Google":           [".googlebot.com", ".google.com"],
    "FeedFetcher-Google":         [".google.com"],
    "Google-InspectionTool":     [".googlebot.com", ".google.com"],
    "Google-Read-Aloud":          [".google.com"],
    "Google-Site-Verification":   [".google.com"],
    "Google-Extended":           [".googlebot.com", ".google.com"],
    "Bingbot":                    [".search.msn.com"],
    "YandexBot":                  [".yandex.ru", ".yandex.net", ".yandex.com"],
    "Baiduspider":                [".baidu.com", ".baidu.jp"],
    "Applebot":                   [".applebot.apple.com"],
    "Applebot-Extended":          [".applebot.apple.com"],
};

// Per-DNS-call budget. This only ever runs on traffic already classified as
// a bot (the ingest handler has already decided not to treat it as a real
// visit), so a slow resolver only delays that bot's own 202 response — never
// a real visitor — but it still needs a cap so a hung resolver can't eat the
// function's whole execution budget.
const DNS_TIMEOUT_MS = 1000;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("dns timeout")), ms)),
    ]);
}

// Forward-resolves `hostname` and checks `ip` is actually one of its
// addresses. A PTR lookup alone can't be trusted as proof of identity — the
// reverse DNS zone for an IP is controlled by whoever owns that IP block,
// which isn't necessarily the party the hostname claims to belong to — so a
// hostname only counts once the forward direction confirms it.
async function forwardConfirm(ip, hostname) {
    const results = await Promise.allSettled([
        dnsPromises.resolve4(hostname),
        dnsPromises.resolve6(hostname),
    ]);
    const addrs = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
    return addrs.includes(ip);
}

// Verifies a detected bot's claimed identity against the IP it actually
// connected from. Never throws — same "never let analytics break" posture
// as lookupNetwork() in api/_geoip.js; every failure mode resolves to a
// plain result object instead of a rejected promise.
//
//   verified: true  — PTR hostname forward-confirms (and, for a vendor in
//                      VERIFIED_DOMAINS, resolves within their published
//                      domain)
//             false — PTR lookup completed but found nothing that forward-
//                      confirms, or (for a VERIFIED_DOMAINS vendor) only
//                      resolved to an unrelated domain — the UA is lying
//                      about who this is
//             null  — inconclusive: no IP to check, or the DNS lookup
//                      itself failed/timed out — never treated as an
//                      impersonation finding, since that's our resolver's
//                      problem, not a statement about the bot
export async function verifyBotDNS(ip, botName) {
    if (!ip) return { verified: null, hostname: null };

    let hostnames;
    try {
        hostnames = await withTimeout(dnsPromises.reverse(ip), DNS_TIMEOUT_MS);
    } catch (err) {
        if (err?.code === "ENOTFOUND" || err?.code === "ENODATA") {
            // No PTR record at all — every vendor in VERIFIED_DOMAINS always
            // has one for their crawl fleet, so treat "none exists" as a
            // failed check rather than "unknown".
            return { verified: false, hostname: null };
        }
        console.error("[_rdns] reverse lookup failed:", err?.message || err);
        return { verified: null, hostname: null };
    }

    if (!hostnames || !hostnames.length) return { verified: false, hostname: null };

    const expectedSuffixes = VERIFIED_DOMAINS[botName] || null;
    for (const hostname of hostnames.slice(0, 3)) {
        const confirmed = await withTimeout(forwardConfirm(ip, hostname), DNS_TIMEOUT_MS).catch(() => false);
        if (!confirmed) continue;
        if (!expectedSuffixes || expectedSuffixes.some(s => hostname.toLowerCase().endsWith(s))) {
            return { verified: true, hostname: hostname.slice(0, 255) };
        }
    }
    // At least one PTR hostname existed, but none both forward-confirmed and
    // (where a specific vendor domain is known) matched it.
    return { verified: false, hostname: hostnames[0].slice(0, 255) };
}
