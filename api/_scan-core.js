/**
 * Shared scan engine — imported by pre-consent-scan.js (authenticated) and
 * cookie-banner-scan.js (public). Not exposed as a Vercel route (underscore prefix).
 */

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

// ── Tracker list ──────────────────────────────────────────────────────────────
export const TRACKERS = [
    // Analytics
    { domains: ["google-analytics.com", "analytics.google.com"], service: "Google Analytics",        category: "analytics"    },
    { domains: ["googletagmanager.com"],                          service: "Google Tag Manager",      category: "analytics"    },
    { domains: ["hotjar.com"],                                    service: "Hotjar",                  category: "analytics"    },
    { domains: ["amplitude.com"],                                 service: "Amplitude",               category: "analytics"    },
    { domains: ["mixpanel.com"],                                  service: "Mixpanel",                category: "analytics"    },
    { domains: ["segment.io", "segment.com", "cdn.segment.com"], service: "Segment",                 category: "analytics"    },
    { domains: ["fullstory.com", "fullstory.io"],                 service: "FullStory",               category: "analytics"    },
    { domains: ["clarity.ms"],                                    service: "Microsoft Clarity",       category: "analytics"    },
    { domains: ["mouseflow.com"],                                 service: "Mouseflow",               category: "analytics"    },
    { domains: ["heapanalytics.com"],                             service: "Heap",                    category: "analytics"    },
    { domains: ["logrocket.com", "lr-ingest.io"],                 service: "LogRocket",               category: "analytics"    },
    { domains: ["smartlook.com"],                                 service: "Smartlook",               category: "analytics"    },
    { domains: ["crazyegg.com"],                                  service: "Crazy Egg",               category: "analytics"    },
    { domains: ["kissmetrics.com"],                               service: "Kissmetrics",             category: "analytics"    },
    { domains: ["clicky.com"],                                    service: "Clicky",                  category: "analytics"    },
    { domains: ["matomo.cloud", "matomo.org"],                    service: "Matomo",                  category: "analytics"    },
    { domains: ["plausible.io"],                                  service: "Plausible",               category: "analytics"    },
    { domains: ["statcounter.com"],                               service: "StatCounter",             category: "analytics"    },
    { domains: ["analytics.ahrefs.com"],                         service: "Ahrefs Pte. Ltd.",         category: "analytics"    },
    { domains: ["sentry.io", "browser.sentry-cdn.com"],           service: "Sentry",                  category: "analytics"    },
    { domains: ["cloudflareinsights.com"],                        service: "Cloudflare Web Analytics", category: "analytics"   },
    { domains: ["nr-data.net", "js-agent.newrelic.com"],          service: "New Relic",               category: "analytics"    },
    { domains: ["fast.wistia.com", "wistia.net", "wistia.com"],  service: "Wistia",                  category: "analytics"    },
    { domains: ["optimizely.com"],                                service: "Optimizely",              category: "analytics"    },
    { domains: ["abtasty.com"],                                   service: "AB Tasty",                category: "analytics"    },
    { domains: ["kameleoon.com", "kameleoon.eu"],                 service: "Kameleoon",               category: "analytics"    },
    { domains: ["vwo.com", "dev.visualwebsiteoptimizer.com"],     service: "VWO",                     category: "analytics"    },

    // Advertising
    { domains: ["connect.facebook.net", "graph.facebook.com"],   service: "Facebook / Meta Pixel", category: "advertising"    },
    { domains: ["googleadservices.com", "doubleclick.net", "googlesyndication.com", "google.com/pagead"], service: "Google Ads", category: "advertising" },
    { domains: ["ads.linkedin.com", "snap.licdn.com"],           service: "LinkedIn Insight Tag",  category: "advertising"    },
    { domains: ["analytics.twitter.com", "static.ads-twitter.com", "ads.twitter.com"], service: "Twitter / X Pixel", category: "advertising" },
    { domains: ["tr.snapchat.com", "sc-static.net"],             service: "Snapchat Pixel",        category: "advertising"    },
    { domains: ["bat.bing.com", "bing.net", "c.bing.com", "bingads.com", "ads.microsoft.com", "sjs.microsoft.com"], service: "Microsoft Advertising", category: "advertising" },
    { domains: ["analytics.tiktok.com", "vm.tiktok.com"],        service: "TikTok Pixel",          category: "advertising"    },
    { domains: ["criteo.com", "criteo.net"],                      service: "Criteo",                category: "advertising"    },
    { domains: ["outbrain.com"],                                  service: "Outbrain",              category: "advertising"    },
    { domains: ["taboola.com"],                                   service: "Taboola",               category: "advertising"    },
    { domains: ["amazon-adsystem.com", "assoc-amazon.com"],      service: "Amazon Advertising",    category: "advertising"    },
    { domains: ["adsrvr.org", "thetradedesk.com"],               service: "The Trade Desk",        category: "advertising"    },
    { domains: ["rubiconproject.com"],                            service: "Magnite (Rubicon)",     category: "advertising"    },
    { domains: ["pubmatic.com"],                                  service: "PubMatic",              category: "advertising"    },
    { domains: ["openx.net", "openx.com"],                       service: "OpenX",                 category: "advertising"    },
    { domains: ["hs-analytics.net", "hs-scripts.com", "hubspot.com", "hubspot.net", "hsadspixel.net", "hubspotlinks.com", "leadin.com", "hscta.net", "hsleadflows.net"], service: "HubSpot", category: "advertising" },
    { domains: ["pardot.com"],                                    service: "Salesforce Pardot",     category: "advertising"    },
    { domains: ["scorecardresearch.com"],                         service: "Comscore",              category: "advertising"    },
    { domains: ["adnxs.com", "xandr.com"],                       service: "Xandr / AppNexus",      category: "advertising"    },
    { domains: ["zemanta.com"],                                   service: "Zemanta",               category: "advertising"    },
    { domains: ["adform.net"],                                    service: "Adform",                category: "advertising"    },
    { domains: ["capterra.com", "capterra.co.uk", "capterra.fr", "capterra.de", "capterra.es", "capterra.it", "capterra.com.au", "capterra.ca"], service: "Capterra", category: "advertising" },
    { domains: ["ct.pinterest.com", "pinimg.com", "pinterest.com"], service: "Pinterest",          category: "advertising"    },
    { domains: ["alb.reddit.com", "redd.it", "redditstatic.com"], service: "Reddit Ads",           category: "advertising"    },
    { domains: ["list-manage.com", "chimpstatic.com", "mailchimp.com", "mailchimpapp.com"], service: "Mailchimp", category: "advertising" },
    { domains: ["klaviyo.com", "static.klaviyo.com"],             service: "Klaviyo",              category: "advertising"    },
    { domains: ["go.g2.com", "g2.com"],                          service: "G2",                    category: "advertising"    },
    { domains: ["log.fc.yahoo.com", "analytics.yahoo.com", "sp.analytics.yahoo.com"], service: "Yahoo Advertising", category: "advertising" },
    { domains: ["marketo.net", "mktoresp.com", "mktdns.net", "mktossl.com"], service: "Adobe Marketo", category: "advertising" },

    // Social widgets & review platforms
    { domains: ["platform.twitter.com", "syndication.twitter.com"], service: "Twitter / X Widgets", category: "social"       },
    { domains: ["platform.linkedin.com"],                         service: "LinkedIn Widgets",      category: "social"         },
    { domains: ["apis.google.com", "accounts.google.com"],       service: "Google Sign-In",        category: "social"         },
    { domains: ["disqus.com", "disquscdn.com"],                   service: "Disqus",                category: "social"         },
    { domains: ["addthis.com"],                                   service: "AddThis",               category: "social"         },
    { domains: ["sharethis.com"],                                 service: "ShareThis",             category: "social"         },
    { domains: ["widget.trustpilot.com", "invitejs.trustpilot.com", "trustpilot.com"], service: "Trustpilot", category: "social" },

    // Fingerprinting
    { domains: ["fingerprintjs.com", "fpjs.io", "fingerprint.com"], service: "FingerprintJS",      category: "fingerprinting" },
    { domains: ["seon.io"],                                       service: "SEON",                  category: "fingerprinting" },

    // Functional / chat / video / payments
    { domains: ["widget.intercom.io", "intercom.io"],            service: "Intercom",              category: "functional"     },
    { domains: ["zendesk.com", "zdassets.com"],                  service: "Zendesk",               category: "functional"     },
    { domains: ["js.driftt.com", "drift.com"],                   service: "Drift",                 category: "functional"     },
    { domains: ["tawk.to"],                                       service: "Tawk.to",               category: "functional"     },
    { domains: ["crisp.chat"],                                    service: "Crisp",                 category: "functional"     },
    { domains: ["hscollectedforms.net", "hsforms.com", "hsforms.net", "usemessages.com", "hsappstatic.net", "hsstatic.net", "hubapi.com", "hs-sites.com"], service: "HubSpot", category: "functional" },
    { domains: ["secure.livechatinc.com", "cdn.livechatinc.com", "livechat.com", "livechatinc.com"], service: "LiveChat", category: "functional" },
    { domains: ["wchat.freshchat.com", "freshchat.com", "freshworks.com"], service: "Freshchat",   category: "functional"     },
    { domains: ["widget.tidio.co", "code.tidio.co", "tidio.com"], service: "Tidio",               category: "functional"     },
    { domains: ["embed.typeform.com", "form.typeform.com", "typeform.com"], service: "Typeform",    category: "functional"     },
    { domains: ["assets.calendly.com", "calendly.com"],          service: "Calendly",              category: "functional"     },
    { domains: ["youtube.com", "youtube-nocookie.com", "ytimg.com", "youtu.be"], service: "YouTube", category: "functional"  },
    { domains: ["player.vimeo.com", "vimeo.com", "vimeocdn.com"], service: "Vimeo",               category: "functional"     },
    { domains: ["js.stripe.com", "stripe.com", "stripe.network"], service: "Stripe",              category: "functional"     },
    { domains: ["paypalobjects.com", "paypal.com"],               service: "PayPal",               category: "functional"     },
    { domains: ["recaptcha.net", "www.google.com/recaptcha"],    service: "Google reCAPTCHA",      category: "functional"     },

    // CDN / fonts
    { domains: ["fonts.googleapis.com", "fonts.gstatic.com"],    service: "Google Fonts",          category: "cdn"            },
    { domains: ["ajax.googleapis.com"],                           service: "Google CDN",            category: "cdn"            },
    { domains: ["google.com"],                                    service: "Google Inc.",            category: "analytics"      },
    { domains: ["cdn.jsdelivr.net"],                              service: "jsDelivr CDN",          category: "cdn"            },
    { domains: ["cdnjs.cloudflare.com"],                          service: "Cloudflare CDN",        category: "cdn"            },

    // Third-party CMP platforms
    { domains: ["cdn.cookielaw.org", "optanon.blob.core.windows.net", "onetrust.com", "cookielaw.org"], service: "OneTrust", category: "cmp" },
    { domains: ["consent.cookiebot.com", "cookiebot.com"],        service: "Cookiebot",             category: "cmp"           },
    { domains: ["app.usercentrics.eu", "privacy-proxy.usercentrics.eu", "usercentrics.eu"], service: "Usercentrics", category: "cmp" },
    { domains: ["policy.app.cookieinformation.com", "cookieinformation.com"], service: "Cookie Information", category: "cmp" },
    { domains: ["cdn.consentmanager.net", "consentmanager.net"],  service: "Consentmanager",        category: "cmp"           },
    { domains: ["hs-banner.com"],                                 service: "HubSpot Cookie Banner", category: "cmp"           },
    // Own CMP infrastructure — not a third-party transfer
    { domains: ["consents.cdn.intastellarsolutions.com", "intastellarsolutions.com"], service: "Intastellar Consents", category: "cmp" },
];

// ── Service metadata ──────────────────────────────────────────────────────────
export const DATA_COUNTRIES = {
    // Analytics
    "Google Analytics": "US", "Google Tag Manager": "US",
    "Hotjar": "MT", "Amplitude": "US", "Mixpanel": "US",
    "Segment": "US", "FullStory": "US", "Microsoft Clarity": "US",
    "Mouseflow": "DK", "Heap": "US", "LogRocket": "US",
    "Smartlook": "CZ", "Crazy Egg": "US", "Kissmetrics": "US",
    "Clicky": "US", "Matomo": "LU", "Plausible": "EE", "StatCounter": "IE",
    "Sentry": "US", "Cloudflare Web Analytics": "US", "New Relic": "US",
    "Wistia": "US", "Optimizely": "US", "AB Tasty": "FR",
    "Kameleoon": "FR", "VWO": "US",
    // Advertising
    "Facebook / Meta Pixel": "US", "Google Ads": "US",
    "LinkedIn Insight Tag": "US", "Twitter / X Pixel": "US",
    "Snapchat Pixel": "US", "Microsoft Advertising": "US",
    "TikTok Pixel": "US", "Criteo": "FR",
    "Outbrain": "US", "Taboola": "US", "Amazon Advertising": "US",
    "The Trade Desk": "US", "Magnite (Rubicon)": "US", "PubMatic": "US",
    "OpenX": "US", "HubSpot": "US", "Salesforce Pardot": "US",
    "Comscore": "US", "Xandr / AppNexus": "US", "Zemanta": "US",
    "Adform": "DK", "Capterra": "US", "Pinterest": "US",
    "Reddit Ads": "US", "Mailchimp": "US", "Klaviyo": "US",
    "G2": "US", "Yahoo Advertising": "US", "Adobe Marketo": "US",
    // Social
    "Twitter / X Widgets": "US", "LinkedIn Widgets": "US",
    "Google Sign-In": "US", "Disqus": "US", "AddThis": "US", "ShareThis": "US",
    "Trustpilot": "DK",
    // Fingerprinting
    "FingerprintJS": "US", "SEON": "HU",
    // Functional
    "Intercom": "US", "Zendesk": "US", "Drift": "US", "Tawk.to": "US", "Crisp": "FR",
    "LiveChat": "PL", "Freshchat": "US", "Tidio": "US",
    "Typeform": "ES", "Calendly": "US",
    "YouTube": "US", "Vimeo": "US",
    "Stripe": "US", "PayPal": "US", "Google reCAPTCHA": "US",
    // CDN / fonts
    "Google Fonts": "US", "Google CDN": "US", "jsDelivr CDN": "BE", "Cloudflare CDN": "US",
    // CMP
    "OneTrust": "US", "Cookiebot": "DK", "Usercentrics": "DE",
    "Cookie Information": "DK", "Consentmanager": "DE", "HubSpot Cookie Banner": "US",
    "Intastellar Consents": "DK",
};

export const DATA_REGIONS = {
    // Analytics
    "Google Analytics":   "non-eu", "Google Tag Manager":        "non-eu",
    "Hotjar":             "eu",     "Amplitude":                 "non-eu",
    "Mixpanel":           "non-eu", "Segment":                   "non-eu",
    "FullStory":          "non-eu", "Microsoft Clarity":         "non-eu",
    "Mouseflow":          "eu",     "Heap":                      "non-eu",
    "LogRocket":          "non-eu", "Smartlook":                 "eu",
    "Crazy Egg":          "non-eu", "Kissmetrics":               "non-eu",
    "Clicky":             "non-eu", "Matomo":                    "eu",
    "Plausible":          "eu",     "StatCounter":               "eu",
    "Sentry":             "non-eu", "Cloudflare Web Analytics":  "non-eu",
    "New Relic":          "non-eu", "Wistia":                    "non-eu",
    "Optimizely":         "non-eu", "AB Tasty":                  "eu",
    "Kameleoon":          "eu",     "VWO":                       "non-eu",
    // Advertising
    "Facebook / Meta Pixel":  "non-eu", "Google Ads":            "non-eu",
    "LinkedIn Insight Tag":   "non-eu", "Twitter / X Pixel":     "non-eu",
    "Snapchat Pixel":         "non-eu", "Microsoft Advertising":  "non-eu",
    "TikTok Pixel":           "non-eu", "Criteo":                 "eu",
    "Outbrain":               "non-eu", "Taboola":                "non-eu",
    "Amazon Advertising":     "non-eu", "The Trade Desk":         "non-eu",
    "Magnite (Rubicon)":      "non-eu", "PubMatic":               "non-eu",
    "OpenX":                  "non-eu", "HubSpot":                "non-eu",
    "Salesforce Pardot":      "non-eu", "Comscore":               "non-eu",
    "Xandr / AppNexus":       "non-eu", "Zemanta":                "non-eu",
    "Adform":                 "eu",     "Capterra":               "non-eu",
    "Pinterest":              "non-eu", "Reddit Ads":             "non-eu",
    "Mailchimp":              "non-eu", "Klaviyo":                "non-eu",
    "G2":                     "non-eu", "Yahoo Advertising":      "non-eu",
    "Adobe Marketo":          "non-eu",
    // Social
    "Twitter / X Widgets": "non-eu", "LinkedIn Widgets": "non-eu",
    "Google Sign-In":      "non-eu", "Disqus":           "non-eu",
    "AddThis":             "non-eu", "ShareThis":        "non-eu",
    "Trustpilot":          "eu",
    // Fingerprinting
    "FingerprintJS": "non-eu", "SEON": "eu",
    // Functional
    "Intercom":        "non-eu", "Zendesk":        "non-eu",
    "Drift":           "non-eu", "Tawk.to":        "non-eu",
    "Crisp":           "eu",     "LiveChat":       "eu",
    "Freshchat":       "non-eu", "Tidio":          "non-eu",
    "Typeform":        "eu",     "Calendly":       "non-eu",
    "YouTube":         "non-eu", "Vimeo":          "non-eu",
    "Stripe":          "non-eu", "PayPal":         "non-eu",
    "Google reCAPTCHA": "non-eu",
    // CDN / fonts
    "Google Fonts": "non-eu", "Google CDN": "non-eu",
    "jsDelivr CDN": "eu",     "Cloudflare CDN": "non-eu",
    // CMP
    "OneTrust":             "non-eu", "Cookiebot":         "eu",
    "Usercentrics":         "eu",     "Cookie Information": "eu",
    "Consentmanager":       "eu",     "HubSpot Cookie Banner": "non-eu",
    "Intastellar Consents": "eu",
};

export const CATEGORY_ORDER = { advertising: 0, fingerprinting: 1, analytics: 2, social: 3, functional: 4, cdn: 5, "third-party": 6 };

export const BANNER_CATEGORY = {
    advertising:    "marketing",
    fingerprinting: "marketing",
    social:         "marketing",
    analytics:      "analytics",
    functional:     "functional",
    cdn:            "functional",
    cmp:            "necessary",
    "third-party":  "functional",
};

// ── Cookie name patterns ──────────────────────────────────────────────────────
// Matches well-known first-party cookie names written by third-party scripts,
// so e.g. _ga set on the scanned domain is correctly classified as analytics.
export const COOKIE_NAME_PATTERNS = [
    // Google Analytics
    { prefix: "_ga",              bannerCategory: "analytics"  }, // _ga, _ga_XXXXX, _gid, _gat
    // Google Ads / Conversion
    { prefix: "_gcl_",            bannerCategory: "marketing"  },
    { prefix: "_gac_",            bannerCategory: "marketing"  },
    // Meta / Facebook
    { exact:  "_fbp",             bannerCategory: "marketing"  },
    { exact:  "_fbc",             bannerCategory: "marketing"  },
    // HubSpot
    { exact:  "__hstc",           bannerCategory: "marketing"  },
    { exact:  "__hssc",           bannerCategory: "marketing"  },
    { exact:  "__hssrc",          bannerCategory: "marketing"  },
    { exact:  "hubspotutk",       bannerCategory: "marketing"  },
    // LinkedIn
    { exact:  "li_sugr",          bannerCategory: "marketing"  },
    { exact:  "UserMatchHistory", bannerCategory: "marketing"  },
    { exact:  "lidc",             bannerCategory: "marketing"  },
    { exact:  "bcookie",          bannerCategory: "marketing"  },
    { exact:  "bscookie",         bannerCategory: "marketing"  },
    // Hotjar
    { prefix: "_hj",              bannerCategory: "analytics"  },
    // Microsoft Clarity
    { exact:  "_clck",            bannerCategory: "analytics"  },
    { exact:  "_clsk",            bannerCategory: "analytics"  },
    // TikTok
    { exact:  "_ttp",             bannerCategory: "marketing"  },
    // Twitter / X
    { exact:  "muc_ads",          bannerCategory: "marketing"  },
    { exact:  "personalization_id", bannerCategory: "marketing" },
    // Amplitude
    { prefix: "amplitude_",       bannerCategory: "analytics"  },
    // Intercom
    { prefix: "intercom-",        bannerCategory: "functional" },
    // Cloudflare (bot / security — functional)
    { prefix: "__cf",             bannerCategory: "functional" },
    { exact:  "cf_clearance",     bannerCategory: "functional" },
    // Pinterest
    { prefix: "_pin_",            bannerCategory: "marketing"  },
    { prefix: "_pinterest_",      bannerCategory: "marketing"  },
    // Reddit
    { exact:  "reddaid",          bannerCategory: "marketing"  },
    { exact:  "reddit_session",   bannerCategory: "marketing"  },
    // Klaviyo
    { exact:  "__kla_id",         bannerCategory: "marketing"  },
    // Stripe (payment / functional)
    { prefix: "__stripe_",        bannerCategory: "functional" },
    // Wistia video analytics
    { prefix: "_wijs",            bannerCategory: "analytics"  },
    // Trustpilot
    { prefix: "tp.",              bannerCategory: "marketing"  },
    // Consent management platforms (necessary)
    { prefix: "OptanonConsent",   bannerCategory: "necessary"  },
    { exact:  "OptanonAlertBoxClosed", bannerCategory: "necessary" },
    { prefix: "CookieConsent",    bannerCategory: "necessary"  },
    { prefix: "cookieyes",        bannerCategory: "necessary"  },
    { prefix: "cc_cookie",        bannerCategory: "necessary"  },
    { prefix: "cmplz_",           bannerCategory: "necessary"  },
    { prefix: "euconsent",        bannerCategory: "necessary"  },
    { prefix: "GDPR",             bannerCategory: "necessary"  },
    { prefix: "uc_",              bannerCategory: "necessary"  }, // Usercentrics
    { prefix: "CI_",              bannerCategory: "necessary"  }, // Cookie Information
];

export function categoryFromCookieName(name) {
    for (const p of COOKIE_NAME_PATTERNS) {
        if (p.exact  && name === p.exact)           return p.bannerCategory;
        if (p.prefix && name.startsWith(p.prefix))  return p.bannerCategory;
    }
    return null;
}

export function classifyHost(hostname) {
    for (const entry of TRACKERS) {
        for (const pattern of entry.domains) {
            if (hostname === pattern || hostname.endsWith("." + pattern)) {
                return {
                    service:     entry.service,
                    category:    entry.category,
                    dataRegion:  DATA_REGIONS[entry.service]  || "non-eu",
                    dataCountry: DATA_COUNTRIES[entry.service] || null,
                };
            }
        }
    }
    return null;
}

// ── Core scan ─────────────────────────────────────────────────────────────────
export async function scanDomain(domain) {
    const startMs = Date.now();
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
    });

    try {
        const page = await browser.newPage();
        await page.setCacheEnabled(false);

        const cdpClient = await page.target().createCDPSession();
        await cdpClient.send("Network.enable");

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver",  { get: () => undefined });
            Object.defineProperty(navigator, "plugins",    { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, "languages",  { get: () => ["en-GB", "en-US", "en"] });
            // Signal to the Intastellar Consents banner (and any banner that honours it)
            // that this is an automated cookie scan — banner should suppress itself so all
            // post-consent cookies are visible to the scanner.
            window.__ICS_SCAN__ = true;
        });

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        );
        await page.setExtraHTTPHeaders({
            "Accept-Language":           "en-GB,en-US;q=0.9,en;q=0.8",
            "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Encoding":           "gzip, deflate, br",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest":            "document",
            "Sec-Fetch-Mode":            "navigate",
            "Sec-Fetch-Site":            "none",
            "Sec-Fetch-User":            "?1",
        });

        await page.setRequestInterception(true);

        const targetRoot = domain.split(".").slice(-2).join(".");
        const seen = new Map();

        page.on("request", (req) => {
            try {
                const u = new URL(req.url());
                const host = u.hostname;
                const hostRoot = host.split(".").slice(-2).join(".");
                if (hostRoot !== targetRoot && !seen.has(host)) {
                    seen.set(host, {
                        host,
                        resourceType: req.resourceType(),
                        url: req.url().split("?")[0].slice(0, 200),
                    });
                }
            } catch {}
            req.continue().catch(() => {});
        });

        try {
            await page.goto(`https://${domain}`, { waitUntil: "networkidle2", timeout: 25000 });
        } catch (e) {
            if (!e.message.includes("timeout") && !e.message.includes("Navigation")) throw e;
        }

        const { cookies: rawCookies } = await cdpClient.send("Network.getAllCookies");
        await browser.close();

        const transfers = [];
        for (const [host, info] of seen) {
            const match    = classifyHost(host);
            const category = match?.category || "third-party";
            transfers.push({
                host,
                service:        match?.service     || host,
                category,
                bannerCategory: BANNER_CATEGORY[category] || "functional",
                dataRegion:     match?.dataRegion  || "non-eu",
                dataCountry:    match?.dataCountry || null,
                resourceType:   info.resourceType,
            });
        }
        transfers.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 6) - (CATEGORY_ORDER[b.category] ?? 6));

        const cookies = rawCookies.map(c => {
            const cookieRoot    = (c.domain || "").replace(/^\./, "").split(".").slice(-2).join(".");
            const isFirstParty  = cookieRoot === targetRoot;
            const matchedVendor = transfers.find(t => t.host.split(".").slice(-2).join(".") === cookieRoot);
            const bannerCategory = matchedVendor
                ? matchedVendor.bannerCategory
                : categoryFromCookieName(c.name)
                ?? (isFirstParty ? "necessary" : "functional");
            return {
                name:     c.name,
                domain:   c.domain,
                path:     c.path,
                httpOnly: c.httpOnly,
                secure:   c.secure,
                sameSite: c.sameSite || "None",
                session:  c.expires === -1,
                expires:  c.expires !== -1 ? c.expires : null,
                size:     c.size,
                bannerCategory,
            };
        });

        return { transfers, cookies, durationMs: Date.now() - startMs, error: null };
    } catch (err) {
        await browser.close().catch(() => {});
        return { transfers: [], cookies: [], durationMs: Date.now() - startMs, error: err.message };
    }
}
