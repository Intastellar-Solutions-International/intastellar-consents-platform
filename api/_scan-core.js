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
    { domains: ["vwo.com", "dev.visualwebsiteoptimizer.com", "wingify.com"], service: "VWO",          category: "analytics"    },
    { domains: ["app.posthog.com", "posthog.com", "eu.posthog.com"], service: "PostHog",           category: "analytics"    },
    { domains: ["datadoghq.com", "browser-intake-datadoghq.com"],   service: "Datadog",             category: "analytics"    },
    { domains: ["mc.yandex.ru", "mc.yandex.com", "yandex.ru"],      service: "Yandex Metrica",      category: "analytics"    },
    { domains: ["luckyorange.com", "luckyorange.net"],               service: "Lucky Orange",        category: "analytics"    },
    { domains: ["inspectlet.com"],                                   service: "Inspectlet",          category: "analytics"    },
    { domains: ["bugsnag.com"],                                      service: "Bugsnag",             category: "analytics"    },
    { domains: ["rollbar.com"],                                      service: "Rollbar",             category: "analytics"    },
    { domains: ["stats.wp.com", "pixel.wp.com"],                    service: "Jetpack / WP.com Stats", category: "analytics" },
    { domains: ["cdn.pagesense.io", "pagesense.io"],                 service: "Zoho PageSense",      category: "analytics"    },

    // Advertising
    { domains: ["connect.facebook.net", "graph.facebook.com", "www.facebook.com", "facebook.com", "fbcdn.net"], service: "Facebook / Meta Pixel", category: "advertising"    },
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
    { domains: ["omnisnippet1.com", "omnisend.com"],              service: "Omnisend",             category: "advertising"    },
    { domains: ["activecampaign.com", "trackcmp.net"],            service: "ActiveCampaign",       category: "advertising"    },
    { domains: ["sendinblue.com", "brevo.com", "sibautomation.com"], service: "Brevo (Sendinblue)", category: "advertising"   },
    { domains: ["mailerlite.com", "assets.mailerlite.com"],       service: "MailerLite",           category: "advertising"    },
    { domains: ["drip.com", "getdrip.com"],                       service: "Drip",                 category: "advertising"    },
    { domains: ["convertkit.com", "convertkit-mail.com"],         service: "ConvertKit",           category: "advertising"    },
    { domains: ["getresponse.com"],                               service: "GetResponse",          category: "advertising"    },
    { domains: ["mc.sendgrid.net", "sendgrid.net"],               service: "SendGrid (Twilio)",    category: "advertising"    },
    { domains: ["demdex.net", "adobedc.net"],                     service: "Adobe Audience Manager", category: "advertising"  },
    { domains: ["assets.adobedtm.com", "adobedtm.com"],          service: "Adobe Experience Platform", category: "advertising"},
    { domains: ["go.pardot.com", "salesforce.com", "sfdcopens.com"], service: "Salesforce",        category: "advertising"    },
    { domains: ["cdninstagram.com", "instagram.com"],             service: "Instagram (Meta)",     category: "advertising"    },
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
    { domains: ["static.ads-twitter.com", "t.co", "abs.twimg.com", "twimg.com"], service: "Twitter / X CDN", category: "social" },
    { domains: ["g.reviews.google.com", "business.google.com"],   service: "Google Reviews",       category: "social"         },

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
    { domains: ["cdn.weglot.com", "weglot.com"],                  service: "Weglot SAS",            category: "functional"     },
    { domains: ["gravatar.com"],                                   service: "Gravatar (Automattic)", category: "functional"     },
    { domains: ["philips-hue.com", "meethue.com"],                service: "Philips Hue (Signify)", category: "functional"     },
    { domains: ["w.org", "wordpress.org", "wordpress.com"],       service: "WordPress (Automattic)", category: "functional"    },
    { domains: ["server.arcgisonline.com", "arcgisonline.com", "arcgis.com"], service: "ArcGIS Online (Esri)", category: "functional" },
    { domains: ["cdn.shopify.com", "shopify.com", "shopifycdn.com", "myshopify.com"], service: "Shopify",  category: "functional" },
    { domains: ["help.helpscout.net", "beacon-v2.helpscout.net", "helpscout.net", "helpscout.com"], service: "Help Scout", category: "functional" },
    { domains: ["config.gorgias.io", "gorgias.io", "gorgias.com"], service: "Gorgias",             category: "functional"     },
    { domains: ["widget.surveymonkey.com", "surveymonkey.com"],   service: "SurveyMonkey",         category: "functional"     },
    { domains: ["delighted.com"],                                  service: "Delighted",            category: "functional"     },
    { domains: ["app.sumo.com", "sumo.com", "sumome.com"],        service: "Sumo",                 category: "functional"     },
    { domains: ["privy.com"],                                      service: "Privy",                category: "functional"     },
    { domains: ["wisepops.com"],                                   service: "Wisepops",             category: "functional"     },
    { domains: ["gstatic.com"],                                    service: "Google Static Assets", category: "functional"     },

    // CDN / fonts / infrastructure
    { domains: ["fonts.googleapis.com", "fonts.gstatic.com"],    service: "Google Fonts",          category: "cdn"            },
    { domains: ["ajax.googleapis.com"],                           service: "Google CDN",            category: "cdn"            },
    { domains: ["cdn.jsdelivr.net"],                              service: "jsDelivr CDN",          category: "cdn"            },
    { domains: ["cdnjs.cloudflare.com", "cloudflare.com"],       service: "Cloudflare CDN",        category: "cdn"            },
    { domains: ["cloudfront.net"],                                service: "AWS CloudFront",        category: "cdn"            },
    { domains: ["fastly.net", "fastly.com"],                      service: "Fastly CDN",            category: "cdn"            },
    { domains: ["akamaihd.net", "akamaized.net", "edgekey.net"], service: "Akamai CDN",            category: "cdn"            },
    { domains: ["unpkg.com"],                                     service: "unpkg CDN",             category: "cdn"            },
    { domains: ["bootstrapcdn.com", "stackpath.bootstrapcdn.com"], service: "Bootstrap CDN",       category: "cdn"            },
    { domains: ["code.jquery.com"],                               service: "jQuery CDN",            category: "cdn"            },
    { domains: ["google.com", "google.de"],                       service: "Google Inc.",           category: "analytics"      },

    // Third-party CMP platforms
    { domains: ["cdn.cookielaw.org", "optanon.blob.core.windows.net", "onetrust.com", "cookielaw.org"], service: "OneTrust", category: "cmp" },
    { domains: ["consent.cookiebot.com", "cookiebot.com"],        service: "Cookiebot",             category: "cmp"           },
    { domains: ["app.usercentrics.eu", "privacy-proxy.usercentrics.eu", "usercentrics.eu"], service: "Usercentrics", category: "cmp" },
    { domains: ["policy.app.cookieinformation.com", "cookieinformation.com"], service: "Cookie Information", category: "cmp" },
    { domains: ["cdn.consentmanager.net", "consentmanager.net"],  service: "Consentmanager",        category: "cmp"           },
    { domains: ["hs-banner.com"],                                 service: "HubSpot Cookie Banner", category: "cmp"           },
    { domains: ["cs.iubenda.com", "cdn.iubenda.com", "iubenda.com"], service: "iubenda",          category: "cmp"            },
    { domains: ["axeptio.eu"],                                    service: "Axeptio",              category: "cmp"            },
    { domains: ["cookiefirst.com"],                               service: "CookieFirst",          category: "cmp"            },
    { domains: ["app.termly.io", "termly.io"],                   service: "Termly",               category: "cmp"            },
    { domains: ["sdk.privacy-center.org", "didomi.io"],          service: "Didomi",               category: "cmp"            },
    { domains: ["cmp.quantcast.com", "quantcast.mgr.consensu.org", "quantcast.com"], service: "Quantcast Choice", category: "cmp" },
    { domains: ["cookiehub.com"],                                 service: "CookieHub",            category: "cmp"            },
    // Own CMP infrastructure — not a third-party transfer
    { domains: ["consents.cdn.intastellarsolutions.com", "intastellarsolutions.com", "consentsmanagement.com", "www.consentsmanagement.com", "intastellar-consents.com", "www.intastellar-consents.com", "intastellarconsents.com", "www.intastellarconsents.com"], service: "Intastellar Consents", category: "cmp" },
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
    "PostHog": "US", "Datadog": "US", "Yandex Metrica": "RU",
    "Lucky Orange": "US", "Inspectlet": "US", "Bugsnag": "GB", "Rollbar": "US",
    "Jetpack / WP.com Stats": "US", "Zoho PageSense": "US",
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
    "Reddit Ads": "US", "Mailchimp": "US", "Klaviyo": "US", "Omnisend": "US",
    "G2": "US", "Yahoo Advertising": "US", "Adobe Marketo": "US",
    "ActiveCampaign": "US", "Brevo (Sendinblue)": "FR", "MailerLite": "US",
    "Drip": "US", "ConvertKit": "US", "GetResponse": "PL",
    "SendGrid (Twilio)": "US", "Adobe Audience Manager": "US",
    "Adobe Experience Platform": "US", "Salesforce": "US",
    "Instagram (Meta)": "US",
    // Social
    "Twitter / X Widgets": "US", "LinkedIn Widgets": "US",
    "Google Sign-In": "US", "Disqus": "US", "AddThis": "US", "ShareThis": "US",
    "Trustpilot": "DK", "Twitter / X CDN": "US", "Google Reviews": "US",
    // Fingerprinting
    "FingerprintJS": "US", "SEON": "HU",
    // Functional
    "Intercom": "US", "Zendesk": "US", "Drift": "US", "Tawk.to": "US", "Crisp": "FR",
    "LiveChat": "PL", "Freshchat": "US", "Tidio": "US",
    "Typeform": "ES", "Calendly": "US",
    "YouTube": "US", "Vimeo": "US",
    "Stripe": "US", "PayPal": "US", "Google reCAPTCHA": "US",
    "Gravatar (Automattic)": "US", "WordPress (Automattic)": "US",
    "Weglot SAS": "FR", "ArcGIS Online (Esri)": "US",
    "Philips Hue (Signify)": "NL",
    "Shopify": "CA", "Help Scout": "US", "Gorgias": "US",
    "SurveyMonkey": "US", "Delighted": "US", "Sumo": "US",
    "Privy": "US", "Wisepops": "FR", "Google Static Assets": "US",
    // CDN / fonts
    "Google Fonts": "US", "Google CDN": "US", "jsDelivr CDN": "BE", "Cloudflare CDN": "US",
    "AWS CloudFront": "US", "Fastly CDN": "US", "Akamai CDN": "US",
    "unpkg CDN": "US", "Bootstrap CDN": "US", "jQuery CDN": "US",
    // CMP
    "OneTrust": "US", "Cookiebot": "DK", "Usercentrics": "DE",
    "Cookie Information": "DK", "Consentmanager": "DE", "HubSpot Cookie Banner": "US",
    "iubenda": "IT", "Axeptio": "FR", "CookieFirst": "NL",
    "Termly": "US", "Didomi": "FR", "Quantcast Choice": "US", "CookieHub": "IS",
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
    "Mailchimp":              "non-eu", "Klaviyo":                "non-eu", "Omnisend": "non-eu",
    "G2":                     "non-eu", "Yahoo Advertising":      "non-eu",
    "Adobe Marketo":          "non-eu",
    "ActiveCampaign": "non-eu", "Brevo (Sendinblue)": "eu",  "MailerLite":  "non-eu",
    "Drip":           "non-eu", "ConvertKit":         "non-eu", "GetResponse": "eu",
    "SendGrid (Twilio)": "non-eu", "Adobe Audience Manager": "non-eu",
    "Adobe Experience Platform": "non-eu", "Salesforce": "non-eu",
    "Instagram (Meta)": "non-eu",
    // Social
    "Twitter / X Widgets": "non-eu", "LinkedIn Widgets": "non-eu",
    "Google Sign-In":      "non-eu", "Disqus":           "non-eu",
    "AddThis":             "non-eu", "ShareThis":        "non-eu",
    "Trustpilot":          "eu",     "Twitter / X CDN":  "non-eu",
    "Google Reviews":      "non-eu",
    // Analytics (new)
    "PostHog": "non-eu", "Datadog": "non-eu", "Yandex Metrica": "non-eu",
    "Lucky Orange": "non-eu", "Inspectlet": "non-eu", "Bugsnag": "non-eu",
    "Rollbar": "non-eu", "Jetpack / WP.com Stats": "non-eu", "Zoho PageSense": "non-eu",
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
    "Gravatar (Automattic)":  "non-eu", "WordPress (Automattic)":  "non-eu",
    "Weglot SAS":             "eu",     "ArcGIS Online (Esri)":    "non-eu",
    "Philips Hue (Signify)":  "eu",
    "Shopify":         "non-eu", "Help Scout":     "non-eu", "Gorgias":    "non-eu",
    "SurveyMonkey":    "non-eu", "Delighted":      "non-eu", "Sumo":       "non-eu",
    "Privy":           "non-eu", "Wisepops":       "eu",     "Google Static Assets": "non-eu",
    // CDN / fonts
    "Google Fonts": "non-eu", "Google CDN": "non-eu",
    "jsDelivr CDN": "eu",     "Cloudflare CDN": "non-eu",
    "AWS CloudFront": "non-eu", "Fastly CDN": "non-eu", "Akamai CDN": "non-eu",
    "unpkg CDN": "non-eu", "Bootstrap CDN": "non-eu", "jQuery CDN": "non-eu",
    // CMP
    "OneTrust":             "non-eu", "Cookiebot":         "eu",
    "Usercentrics":         "eu",     "Cookie Information": "eu",
    "Consentmanager":       "eu",     "HubSpot Cookie Banner": "non-eu",
    "iubenda": "eu", "Axeptio": "eu", "CookieFirst": "eu",
    "Termly": "non-eu", "Didomi": "eu", "Quantcast Choice": "non-eu", "CookieHub": "eu",
    "Intastellar Consents": "eu",
};

// ── Per-vendor enrichment metadata ────────────────────────────────────────────
// transferMechanism values:
//   "EEA"                        — vendor is in the EEA, no transfer
//   "Adequacy Decision"          — vendor's country has EU adequacy decision
//   "EU-US Data Privacy Framework" — US vendor certified under the EU-US DPF
//   "Standard Contractual Clauses" — fallback transfer mechanism
export const VENDOR_META = {
    // Analytics
    "Google Analytics":   { description: "Web analytics service tracking traffic and user behaviour", privacyUrl: "https://policies.google.com/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Google Tag Manager": { description: "Tag management system for deploying marketing and analytics scripts", privacyUrl: "https://policies.google.com/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Hotjar":             { description: "Heatmaps, session recordings and user feedback tools", privacyUrl: "https://www.hotjar.com/legal/policies/privacy/", legalBasis: "consent", transferMechanism: "EEA" },
    "Amplitude":          { description: "Product analytics platform for tracking user journeys", privacyUrl: "https://amplitude.com/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Mixpanel":           { description: "Event-based product analytics platform", privacyUrl: "https://mixpanel.com/legal/privacy-policy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Segment":            { description: "Customer data platform that collects and routes analytics events", privacyUrl: "https://www.twilio.com/en-us/legal/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "FullStory":          { description: "Digital experience analytics with session replay", privacyUrl: "https://www.fullstory.com/legal/privacy-policy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Microsoft Clarity":  { description: "Free heatmap and session recording tool by Microsoft", privacyUrl: "https://privacy.microsoft.com/privacystatement", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Mouseflow":          { description: "Session replay, heatmaps and funnel analytics", privacyUrl: "https://mouseflow.com/privacy/", legalBasis: "consent", transferMechanism: "EEA" },
    "Heap":               { description: "Automatic event capture analytics platform", privacyUrl: "https://heap.io/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "LogRocket":          { description: "Session replay and frontend monitoring platform", privacyUrl: "https://logrocket.com/privacy/", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Smartlook":          { description: "Session recordings and event tracking analytics", privacyUrl: "https://www.smartlook.com/privacy-policy/", legalBasis: "consent", transferMechanism: "EEA" },
    "Crazy Egg":          { description: "Heatmap and A/B testing tool", privacyUrl: "https://www.crazyegg.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Matomo":             { description: "Open-source privacy-friendly web analytics platform", privacyUrl: "https://matomo.org/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    "Plausible":          { description: "Lightweight privacy-first web analytics", privacyUrl: "https://plausible.io/privacy", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    "Sentry":             { description: "Application error tracking and performance monitoring", privacyUrl: "https://sentry.io/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Cloudflare Web Analytics": { description: "Privacy-first web analytics from Cloudflare", privacyUrl: "https://www.cloudflare.com/privacypolicy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "New Relic":          { description: "Observability platform for application performance monitoring", privacyUrl: "https://newrelic.com/termsandconditions/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Wistia":             { description: "Video hosting and analytics platform for businesses", privacyUrl: "https://wistia.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Optimizely":         { description: "A/B testing and experimentation platform", privacyUrl: "https://www.optimizely.com/privacy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "AB Tasty":           { description: "A/B testing, personalisation and feature management", privacyUrl: "https://www.abtasty.com/privacy-policy/", legalBasis: "consent", transferMechanism: "EEA" },
    "Kameleoon":          { description: "AI-powered A/B testing and personalisation platform", privacyUrl: "https://www.kameleoon.com/en/privacy-policy", legalBasis: "consent", transferMechanism: "EEA" },
    "VWO":                { description: "Visual website optimiser — A/B testing and conversion optimisation", privacyUrl: "https://vwo.com/privacy-policy/", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "PostHog":            { description: "Open-source product analytics, session replay and feature flags", privacyUrl: "https://posthog.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Datadog":            { description: "Cloud monitoring and analytics platform", privacyUrl: "https://www.datadoghq.com/legal/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Yandex Metrica":     { description: "Web analytics service by Yandex with session replay", privacyUrl: "https://yandex.com/legal/privacy/", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Lucky Orange":       { description: "Conversion optimisation with heatmaps and session recordings", privacyUrl: "https://www.luckyorange.com/privacy.php", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Bugsnag":            { description: "Application error monitoring and crash reporting", privacyUrl: "https://smartbear.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Rollbar":            { description: "Real-time error tracking and debugging platform", privacyUrl: "https://rollbar.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Jetpack / WP.com Stats": { description: "WordPress.com site statistics and performance tools", privacyUrl: "https://automattic.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Ahrefs Pte. Ltd.":   { description: "SEO analytics platform", privacyUrl: "https://ahrefs.com/privacy", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Inspectlet":         { description: "Session recording and heatmap analytics", privacyUrl: "https://www.inspectlet.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "StatCounter":        { description: "Web analytics and visitor tracking service", privacyUrl: "https://statcounter.com/privacy/", legalBasis: "consent", transferMechanism: "EEA" },
    "Zoho PageSense":     { description: "Conversion optimisation and personalisation platform by Zoho", privacyUrl: "https://www.zoho.com/privacy.html", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    // Advertising
    "Facebook / Meta Pixel": { description: "Conversion tracking and audience targeting pixel for Meta platforms", privacyUrl: "https://www.facebook.com/privacy/policy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Instagram (Meta)":   { description: "Social media content and advertising platform by Meta", privacyUrl: "https://www.facebook.com/privacy/policy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Google Ads":         { description: "Conversion tracking and remarketing for Google advertising", privacyUrl: "https://policies.google.com/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "LinkedIn Insight Tag": { description: "Conversion tracking and audience insights for LinkedIn ads", privacyUrl: "https://www.linkedin.com/legal/privacy-policy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Twitter / X Pixel":  { description: "Conversion tracking pixel for Twitter/X advertising", privacyUrl: "https://twitter.com/en/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Snapchat Pixel":     { description: "Conversion tracking pixel for Snapchat advertising", privacyUrl: "https://snap.com/en-US/privacy/privacy-policy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Microsoft Advertising": { description: "Conversion tracking and remarketing for Microsoft/Bing ads", privacyUrl: "https://privacy.microsoft.com/privacystatement", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "TikTok Pixel":       { description: "Conversion tracking pixel for TikTok advertising", privacyUrl: "https://www.tiktok.com/legal/privacy-policy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Criteo":             { description: "Retargeting and performance advertising platform", privacyUrl: "https://www.criteo.com/privacy/", legalBasis: "consent", transferMechanism: "EEA" },
    "Pinterest":          { description: "Visual discovery and advertising platform", privacyUrl: "https://policy.pinterest.com/privacy-policy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "HubSpot":            { description: "CRM, marketing automation and analytics platform", privacyUrl: "https://legal.hubspot.com/privacy-policy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Mailchimp":          { description: "Email marketing and marketing automation platform", privacyUrl: "https://www.intuit.com/privacy/statement/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Klaviyo":            { description: "Email and SMS marketing automation platform for e-commerce", privacyUrl: "https://www.klaviyo.com/legal/privacy-notice", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Omnisend":           { description: "Email and SMS marketing automation for e-commerce", privacyUrl: "https://www.omnisend.com/privacy-policy/", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "ActiveCampaign":     { description: "Email marketing and CRM automation platform", privacyUrl: "https://www.activecampaign.com/privacy-policy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Brevo (Sendinblue)": { description: "Email, SMS and CRM marketing platform", privacyUrl: "https://www.brevo.com/legal/privacypolicy/", legalBasis: "consent", transferMechanism: "EEA" },
    "MailerLite":         { description: "Email marketing platform with automation and landing pages", privacyUrl: "https://www.mailerlite.com/legal/privacy-policy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Drip":               { description: "E-commerce CRM and email marketing automation", privacyUrl: "https://www.drip.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "ConvertKit":         { description: "Email marketing platform for creators and bloggers", privacyUrl: "https://convertkit.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "GetResponse":        { description: "Email marketing and online campaign management platform", privacyUrl: "https://www.getresponse.com/legal/privacy", legalBasis: "consent", transferMechanism: "EEA" },
    "SendGrid (Twilio)":  { description: "Transactional and marketing email delivery service", privacyUrl: "https://www.twilio.com/en-us/legal/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Adobe Audience Manager": { description: "Data management platform for audience segmentation and targeting", privacyUrl: "https://www.adobe.com/privacy.html", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Adobe Experience Platform": { description: "Adobe tag management and analytics deployment system", privacyUrl: "https://www.adobe.com/privacy.html", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Adobe Marketo":      { description: "B2B marketing automation and lead management platform", privacyUrl: "https://www.adobe.com/privacy.html", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Salesforce":         { description: "CRM and marketing cloud platform", privacyUrl: "https://www.salesforce.com/privacy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Salesforce Pardot":  { description: "B2B marketing automation platform by Salesforce", privacyUrl: "https://www.salesforce.com/privacy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Outbrain":           { description: "Native advertising and content discovery network", privacyUrl: "https://www.outbrain.com/privacy/", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Taboola":            { description: "Content recommendation and native advertising network", privacyUrl: "https://www.taboola.com/privacy-policy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Criteo":             { description: "Retargeting and performance display advertising platform", privacyUrl: "https://www.criteo.com/privacy/", legalBasis: "consent", transferMechanism: "EEA" },
    "The Trade Desk":     { description: "Demand-side programmatic advertising platform", privacyUrl: "https://www.thetradedesk.com/us/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Adform":             { description: "European ad tech platform for programmatic advertising", privacyUrl: "https://site.adform.com/privacy-center/overview/", legalBasis: "consent", transferMechanism: "EEA" },
    "Xandr / AppNexus":   { description: "Programmatic advertising marketplace by Microsoft", privacyUrl: "https://www.xandr.com/privacy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Amazon Advertising": { description: "Advertising solutions and DSP by Amazon", privacyUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Yahoo Advertising":  { description: "Display and search advertising platform by Yahoo", privacyUrl: "https://legal.yahoo.com/us/en/yahoo/privacy/index.html", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "FingerprintJS":      { description: "Browser fingerprinting for fraud detection and visitor identification", privacyUrl: "https://fingerprint.com/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "SEON":               { description: "Fraud prevention using device fingerprinting and behavioural analysis", privacyUrl: "https://seon.io/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    // Social
    "Twitter / X Widgets": { description: "Embedded tweets and social sharing widgets", privacyUrl: "https://twitter.com/en/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "LinkedIn Widgets":   { description: "Embedded LinkedIn sharing and follow buttons", privacyUrl: "https://www.linkedin.com/legal/privacy-policy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Google Sign-In":     { description: "OAuth-based sign-in using Google accounts", privacyUrl: "https://policies.google.com/privacy", legalBasis: "contract", transferMechanism: "EU-US Data Privacy Framework" },
    "Trustpilot":         { description: "Customer review and rating platform", privacyUrl: "https://legal.trustpilot.com/end-user-privacy-terms", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    "Disqus":             { description: "Third-party comment hosting and community platform", privacyUrl: "https://disqus.com/privacy-policy/", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    // Functional
    "Intercom":           { description: "Customer messaging and support chat platform", privacyUrl: "https://www.intercom.com/legal/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Zendesk":            { description: "Customer service and support ticketing platform", privacyUrl: "https://www.zendesk.com/company/agreements-and-terms/privacy-notice/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Drift":              { description: "Conversational marketing and live chat platform", privacyUrl: "https://www.drift.com/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Tawk.to":            { description: "Free live chat widget for websites", privacyUrl: "https://www.tawk.to/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Crisp":              { description: "Customer messaging platform with live chat and chatbot", privacyUrl: "https://crisp.chat/en/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    "LiveChat":           { description: "Live chat customer support software", privacyUrl: "https://www.livechat.com/legal/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    "Freshchat":          { description: "Messaging and customer support software by Freshworks", privacyUrl: "https://www.freshworks.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Tidio":              { description: "Live chat and chatbot platform for customer service", privacyUrl: "https://www.tidio.com/privacy-policy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Typeform":           { description: "Interactive form and survey builder", privacyUrl: "https://www.typeform.com/help/a/typeforms-privacy-policy-360029273192/", legalBasis: "contract", transferMechanism: "EEA" },
    "Calendly":           { description: "Appointment scheduling and booking platform", privacyUrl: "https://calendly.com/privacy", legalBasis: "contract", transferMechanism: "EU-US Data Privacy Framework" },
    "YouTube":            { description: "Video hosting and streaming platform by Google", privacyUrl: "https://policies.google.com/privacy", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Vimeo":              { description: "Professional video hosting and sharing platform", privacyUrl: "https://vimeo.com/privacy", legalBasis: "consent", transferMechanism: "Standard Contractual Clauses" },
    "Stripe":             { description: "Online payment processing and infrastructure platform", privacyUrl: "https://stripe.com/privacy", legalBasis: "contract", transferMechanism: "EU-US Data Privacy Framework" },
    "PayPal":             { description: "Online payment platform and digital wallet service", privacyUrl: "https://www.paypal.com/webapps/mpp/ua/privacy-full", legalBasis: "contract", transferMechanism: "EU-US Data Privacy Framework" },
    "Google reCAPTCHA":   { description: "Bot detection and spam prevention service by Google", privacyUrl: "https://policies.google.com/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Weglot SAS":         { description: "Automated website translation and multilingual SEO service", privacyUrl: "https://weglot.com/privacy/", legalBasis: "contract", transferMechanism: "EEA" },
    "Gravatar (Automattic)": { description: "Globally recognised avatar service linked to email addresses", privacyUrl: "https://automattic.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "WordPress (Automattic)": { description: "Content management system assets and APIs by Automattic", privacyUrl: "https://automattic.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Shopify":            { description: "E-commerce platform hosting storefront and checkout scripts", privacyUrl: "https://www.shopify.com/legal/privacy", legalBasis: "contract", transferMechanism: "Adequacy Decision" },
    "Help Scout":         { description: "Customer support and help desk platform", privacyUrl: "https://www.helpscout.com/company/legal/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Gorgias":            { description: "E-commerce helpdesk and customer support platform", privacyUrl: "https://www.gorgias.com/privacy-policy", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "SurveyMonkey":       { description: "Online survey and questionnaire platform", privacyUrl: "https://www.surveymonkey.com/mp/legal/privacy/", legalBasis: "consent", transferMechanism: "EU-US Data Privacy Framework" },
    "Philips Hue (Signify)": { description: "Smart lighting control and integration scripts by Signify", privacyUrl: "https://www.signify.com/en-us/privacy/privacy-notice", legalBasis: "contract", transferMechanism: "EEA" },
    "ArcGIS Online (Esri)": { description: "Mapping and geospatial services for web map tiles", privacyUrl: "https://www.esri.com/en-us/privacy/overview", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Google Static Assets": { description: "Static resources and APIs served from Google infrastructure", privacyUrl: "https://policies.google.com/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    // CDN / infrastructure
    "Google Fonts":       { description: "Web font hosting and delivery service by Google", privacyUrl: "https://policies.google.com/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Google CDN":         { description: "Content delivery network for JavaScript libraries by Google", privacyUrl: "https://policies.google.com/privacy", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "jsDelivr CDN":       { description: "Open-source CDN for npm packages and GitHub releases", privacyUrl: "https://www.jsdelivr.com/privacy-policy", legalBasis: "legitimate_interest", transferMechanism: "EEA" },
    "Cloudflare CDN":     { description: "Content delivery network and DDoS protection by Cloudflare", privacyUrl: "https://www.cloudflare.com/privacypolicy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "AWS CloudFront":     { description: "Content delivery network by Amazon Web Services", privacyUrl: "https://aws.amazon.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    "Fastly CDN":         { description: "Edge cloud platform and content delivery network", privacyUrl: "https://www.fastly.com/privacy/", legalBasis: "legitimate_interest", transferMechanism: "Standard Contractual Clauses" },
    "Akamai CDN":         { description: "Content delivery network and cloud security platform", privacyUrl: "https://www.akamai.com/legal/compliance/privacy-trust-center", legalBasis: "legitimate_interest", transferMechanism: "EU-US Data Privacy Framework" },
    // CMP
    "OneTrust":           { description: "Consent management and privacy compliance platform", privacyUrl: "https://www.onetrust.com/privacy-notice/", legalBasis: "legal_obligation", transferMechanism: "EU-US Data Privacy Framework" },
    "Cookiebot":          { description: "Automated cookie consent management solution", privacyUrl: "https://www.cookiebot.com/en/privacy-policy/", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "Usercentrics":       { description: "Consent management platform with TCF support", privacyUrl: "https://usercentrics.com/privacy-policy/", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "Cookie Information": { description: "GDPR-compliant cookie consent solution", privacyUrl: "https://cookieinformation.com/privacy-policy/", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "iubenda":            { description: "Privacy policy generator and consent management platform", privacyUrl: "https://www.iubenda.com/privacy-policy/65675", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "Axeptio":            { description: "Cookie consent management with conversational UX", privacyUrl: "https://www.axeptio.eu/en/privacy", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "CookieFirst":        { description: "Cookie consent management and compliance platform", privacyUrl: "https://cookiefirst.com/privacy-policy/", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "Didomi":             { description: "Consent management and preference platform", privacyUrl: "https://www.didomi.io/privacy-policy", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "Termly":             { description: "Privacy policy and cookie consent management platform", privacyUrl: "https://termly.io/our-privacy-policy/", legalBasis: "legal_obligation", transferMechanism: "Standard Contractual Clauses" },
    "Quantcast Choice":   { description: "IAB TCF-certified consent management platform", privacyUrl: "https://www.quantcast.com/privacy/", legalBasis: "legal_obligation", transferMechanism: "EU-US Data Privacy Framework" },
    "CookieHub":          { description: "Cookie consent and compliance management tool", privacyUrl: "https://cookiehub.com/privacy", legalBasis: "legal_obligation", transferMechanism: "EEA" },
    "Intastellar Consents": { description: "Consent management platform by Intastellar Solutions", privacyUrl: "https://www.intastellarsolutions.com/about/legal/privacy", legalBasis: "legal_obligation", transferMechanism: "EEA" },
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

// ── Cookie descriptions ───────────────────────────────────────────────────────
export const COOKIE_META = [
    // Google Analytics
    { exact:  "_ga",                    description: "Google Analytics client ID — identifies a unique visitor across sessions. Expires after 2 years." },
    { exact:  "_gid",                   description: "Google Analytics session cookie — distinguishes users within a 24-hour session." },
    { prefix: "_ga_",                   description: "Google Analytics 4 property cookie — stores session state for a specific GA4 measurement ID." },
    { prefix: "_gat",                   description: "Google Analytics throttle cookie — limits the request rate to Google Analytics. Expires after 1 minute." },
    { prefix: "_gac_",                  description: "Google Ads campaign cookie — stores campaign click information for conversion attribution." },
    { exact:  "_gcl_au",               description: "Google Conversion Linker cookie — set by Google Tag Manager to link ad clicks to conversions." },
    { prefix: "_gcl_aw",               description: "Google Ads click ID — stores the Google Click Identifier (GCLID) for conversion tracking." },
    { prefix: "_gcl_dc",               description: "Google DoubleClick click ID — stores the DCLID for display ad conversion tracking." },
    { prefix: "_gcl_",                 description: "Google conversion linker cookie — associates ad clicks with on-site actions for attribution." },
    // Old Google Analytics (ga.js / urchin)
    { exact:  "__utma",                 description: "Google Analytics legacy cookie — tracks unique visitors and session count. Expires after 2 years." },
    { exact:  "__utmb",                 description: "Google Analytics legacy session cookie — tracks session start time. Expires after 30 minutes." },
    { exact:  "__utmc",                 description: "Google Analytics legacy session end cookie — used to determine whether to start a new session." },
    { exact:  "__utmz",                 description: "Google Analytics legacy referral cookie — stores traffic source and campaign data. Expires after 6 months." },
    // Hotjar
    { exact:  "_hjid",                  description: "Hotjar user ID cookie — assigns a unique ID to a visitor to track across sessions. Expires after 1 year." },
    { prefix: "_hjSession_",            description: "Hotjar current session data — stores session attributes including whether the user is in a recording sample." },
    { prefix: "_hjSessionUser_",        description: "Hotjar session user cookie — stores the Hotjar user ID and session start time. Expires after 1 year." },
    { exact:  "_hjAbsoluteSessionInProgress", description: "Hotjar session flag — detects the first pageview of a session. Expires after 30 minutes." },
    { exact:  "_hjFirstSeen",           description: "Hotjar first visit marker — identifies whether this is a visitor's first session. Session cookie." },
    { prefix: "_hjIncludedIn",          description: "Hotjar sampling flag — determines whether this visitor is included in a data sample. Session cookie." },
    { prefix: "_hj",                    description: "Hotjar tracking cookie — used for session recording, heatmaps and visitor behaviour analysis." },
    // Facebook / Meta
    { exact:  "_fbp",                   description: "Facebook Pixel browser ID — identifies browsers for ad delivery and conversion measurement. Expires after 3 months." },
    { exact:  "_fbc",                   description: "Facebook click ID — stores the fbclid URL parameter from a Facebook ad click. Expires after 3 months." },
    // HubSpot
    { exact:  "hubspotutk",             description: "HubSpot visitor token — tracks a visitor's identity across visits and form submissions. Expires after 13 months." },
    { exact:  "__hstc",                 description: "HubSpot tracking cookie — stores subdomain, initial referrer, first and last visit timestamps. Expires after 13 months." },
    { exact:  "__hssc",                 description: "HubSpot session cookie — tracks session number and session start time within a visit." },
    { exact:  "__hssrc",                description: "HubSpot source cookie — set when a browser opens a new tab; used to determine if the visitor is a new session." },
    // LinkedIn
    { exact:  "li_sugr",                description: "LinkedIn user identification cookie — probabilistically matches visitors to LinkedIn profiles for ad targeting." },
    { exact:  "UserMatchHistory",       description: "LinkedIn ad retargeting cookie — enables retargeting of visitors who have seen a LinkedIn ad. Expires after 1 month." },
    { exact:  "lidc",                   description: "LinkedIn data centre routing cookie — selects a data centre for subsequent requests. Expires after 24 hours." },
    { exact:  "bcookie",                description: "LinkedIn browser ID cookie — identifies a browser instance for LinkedIn features. Expires after 1 year." },
    { exact:  "bscookie",               description: "LinkedIn secure browser ID — same purpose as bcookie but set with Secure flag. Expires after 1 year." },
    { exact:  "li_gc",                  description: "LinkedIn consent cookie — stores the visitor's consent choice for LinkedIn cookies." },
    // Microsoft Clarity
    { exact:  "_clck",                  description: "Microsoft Clarity user ID — persists the Clarity user ID and preferences. Expires after 1 year." },
    { exact:  "_clsk",                  description: "Microsoft Clarity session key — connects multiple page views within a single session. Expires after 24 hours." },
    // TikTok
    { exact:  "_ttp",                   description: "TikTok Pixel tracking ID — stores a visitor's browser ID for ad performance measurement. Expires after 13 months." },
    // Twitter / X
    { exact:  "muc_ads",                description: "Twitter/X ad measurement cookie — measures ad performance for logged-out users. Expires after 2 years." },
    { exact:  "personalization_id",     description: "Twitter/X personalisation cookie — links activity on the website to the Twitter/X platform for ad targeting. Expires after 2 years." },
    // Pinterest
    { prefix: "_pin_",                  description: "Pinterest tracking cookie — identifies visitors from Pinterest for ad conversion measurement." },
    { prefix: "_pinterest_",            description: "Pinterest session cookie — tracks Pinterest-referred sessions for analytics." },
    // VWO
    { exact:  "_vwo_consent",           description: "VWO consent record — stores the visitor's consent decision for VWO tracking. Expires after 1 year." },
    { exact:  "_vwo_uuid",              description: "VWO visitor ID — assigns a unique ID to each visitor for experiment assignment. Expires after 1 year." },
    { exact:  "_vwo_uuid_v2",           description: "VWO visitor ID v2 — updated unique visitor identifier for A/B test assignment. Expires after 1 year." },
    { prefix: "_vwo_",                  description: "VWO tracking cookie — used for A/B testing, personalisation and conversion optimisation." },
    { prefix: "_vis_opt_",              description: "VWO optimisation cookie — stores experiment variant assignment and visitor targeting data." },
    // Stripe
    { exact:  "__stripe_mid",           description: "Stripe fraud prevention cookie — identifies the browser for fraud detection purposes. Expires after 1 year." },
    { exact:  "__stripe_sid",           description: "Stripe session cookie — short-lived session identifier used during payment flows. Expires after 30 minutes." },
    { prefix: "__stripe_",              description: "Stripe cookie — used for payment security and fraud prevention during checkout." },
    // Cloudflare
    { exact:  "__cf_bm",                description: "Cloudflare bot management cookie — distinguishes human visitors from automated bots. Expires after 30 minutes." },
    { exact:  "cf_clearance",           description: "Cloudflare challenge clearance cookie — proves a visitor has passed a Cloudflare security challenge. Expires after 1 day." },
    { prefix: "__cf",                   description: "Cloudflare security cookie — used for DDoS protection and bot detection." },
    // Klaviyo
    { exact:  "__kla_id",               description: "Klaviyo visitor ID — tracks website visitors for email marketing attribution. Expires after 2 years." },
    // Amplitude
    { prefix: "amplitude_",             description: "Amplitude analytics cookie — stores device ID and session data for product analytics." },
    // Wistia
    { prefix: "_wijs",                  description: "Wistia video analytics cookie — tracks video engagement and viewer behaviour." },
    // Trustpilot
    { prefix: "tp.",                    description: "Trustpilot cookie — used for review widget functionality and fraud prevention." },
    // Reddit
    { exact:  "reddaid",                description: "Reddit Ads cookie — identifies a visitor for Reddit advertising attribution." },
    // Microsoft Advertising
    { exact:  "MUID",                   description: "Microsoft unique identifier — tracks users across Microsoft sites for advertising. Expires after 1 year." },
    // Intercom
    { prefix: "intercom-",              description: "Intercom messenger cookie — stores visitor identity and session state for the chat widget." },
    // Pinterest
    { exact:  "_pin_unauth",            description: "Pinterest anonymous tracking cookie — identifies anonymous visitors for ad measurement." },
    // Common server-side session cookies
    { exact:  "PHPSESSID",             description: "PHP session cookie — maintains a server-side session for the current user. Session cookie." },
    { exact:  "JSESSIONID",            description: "Java session cookie — maintains a server-side session for Java/Spring applications. Session cookie." },
    { exact:  "ASP.NET_SessionId",     description: "ASP.NET session cookie — maintains a server-side session for .NET applications. Session cookie." },
    { exact:  "XSRF-TOKEN",            description: "CSRF protection token — prevents cross-site request forgery attacks. Session cookie." },
    { exact:  "csrf_token",            description: "CSRF protection token — prevents cross-site request forgery attacks. Session cookie." },
    // WordPress
    { prefix: "wordpress_",            description: "WordPress authentication cookie — stores login credentials for authenticated users." },
    { prefix: "wp-settings-",          description: "WordPress user settings cookie — stores interface preferences for logged-in users." },
    { exact:  "wordpress_test_cookie", description: "WordPress cookie check — verifies that cookies are enabled in the visitor's browser." },
    { exact:  "comment_author",        description: "WordPress comment author cookie — remembers the name and email used in comment forms. Expires after 1 year." },
    // Consent management
    { exact:  "IntastellarConsentSolution", description: "Intastellar Consents record — stores the visitor's consent choices for this website. Expires after 3 months." },
    { prefix: "OptanonConsent",        description: "OneTrust consent record — stores the visitor's cookie category consent choices." },
    { exact:  "OptanonAlertBoxClosed", description: "OneTrust banner dismissed flag — records that the visitor has closed the consent banner." },
    { prefix: "CookieConsent",         description: "Cookiebot consent record — stores the visitor's cookie consent choices and expiry." },
    { prefix: "cookieyes",             description: "CookieYes consent record — stores the visitor's consent preferences." },
    { prefix: "cc_cookie",             description: "Cookie Consent record — stores the visitor's cookie category preferences." },
    { prefix: "cmplz_",               description: "Complianz consent cookie — stores the visitor's GDPR consent choices for this website." },
    { prefix: "euconsent",             description: "IAB TCF consent string — stores the encoded vendor consent record under the IAB Transparency & Consent Framework." },
    { prefix: "uc_",                   description: "Usercentrics consent cookie — stores the visitor's consent settings." },
];

export function describeCookie(name) {
    for (const p of COOKIE_META) {
        if (p.exact  && name === p.exact)           return p.description;
        if (p.prefix && name.startsWith(p.prefix))  return p.description;
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

// ── RDAP lookup for unknown domains ──────────────────────────────────────────
// Cache persists across warm lambda invocations to avoid redundant lookups.
const rdapCache = new Map();

async function lookupRdap(domainRoot) {
    if (rdapCache.has(domainRoot)) return rdapCache.get(domainRoot);

    try {
        const res = await fetch(`https://rdap.org/domain/${domainRoot}`, {
            signal: AbortSignal.timeout(4000),
            headers: { Accept: "application/rdap+json, application/json" },
        });
        if (!res.ok) { rdapCache.set(domainRoot, null); return null; }

        const data = await res.json();
        let orgName = null;
        let country = null;

        for (const entity of (data.entities || [])) {
            // Prefer registrant, accept technical as fallback
            if (!entity.roles?.some(r => r === "registrant" || r === "technical")) continue;
            for (const field of (entity.vcardArray?.[1] || [])) {
                if ((field[0] === "fn" || field[0] === "org") && !orgName) {
                    orgName = typeof field[3] === "string" ? field[3].trim() : null;
                }
                if (field[0] === "adr" && !country) {
                    // vCard adr value: [poBox, extended, street, locality, region, postal, country]
                    const adr = Array.isArray(field[3]) ? field[3] : [];
                    country = adr[6] || null;
                }
            }
            // Also check nested entities (some registrars nest the org)
            for (const nested of (entity.entities || [])) {
                for (const field of (nested.vcardArray?.[1] || [])) {
                    if ((field[0] === "fn" || field[0] === "org") && !orgName) {
                        orgName = typeof field[3] === "string" ? field[3].trim() : null;
                    }
                }
            }
            if (orgName) break;
        }

        // Discard privacy-redacted placeholders
        if (orgName && /redacted|privacy|protected|proxy|withheld/i.test(orgName)) {
            orgName = null;
        }

        const result = orgName ? { service: orgName, dataCountry: country || null } : null;
        rdapCache.set(domainRoot, result);
        return result;
    } catch {
        rdapCache.set(domainRoot, null);
        return null;
    }
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
                const type = req.resourceType();
                if (type === "image" || type === "media") {
                    req.continue().catch(() => {});
                    return;
                }
                const u = new URL(req.url());
                const host = u.hostname;
                const hostRoot = host.split(".").slice(-2).join(".");
                if (hostRoot !== targetRoot && !seen.has(host)) {
                    seen.set(host, {
                        host,
                        resourceType: type,
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

        // Classify all observed hosts; collect unrecognised roots for RDAP lookup
        const rawTransfers = [];
        const unknownRoots = new Set();

        for (const [host, info] of seen) {
            const match = classifyHost(host);
            rawTransfers.push({ host, info, match });
            if (!match) unknownRoots.add(host.split(".").slice(-2).join("."));
        }

        // Run RDAP lookups in parallel for all unclassified domain roots
        const rdapResults = new Map();
        await Promise.all(
            [...unknownRoots].map(async root => {
                const result = await lookupRdap(root);
                if (result) rdapResults.set(root, result);
            })
        );

        const transfers = rawTransfers.map(({ host, info, match }) => {
            const root     = host.split(".").slice(-2).join(".");
            const rdap     = !match ? rdapResults.get(root) : null;
            const category = match?.category || "third-party";
            const service  = match?.service || rdap?.service || host;
            const meta     = VENDOR_META[service] || {};
            return {
                host,
                service,
                category,
                bannerCategory:    BANNER_CATEGORY[category] || "functional",
                dataRegion:        match?.dataRegion  || "non-eu",
                dataCountry:       match?.dataCountry || rdap?.dataCountry || null,
                resourceType:      info.resourceType,
                rdapLookup:        !match && !!rdap,
                description:       meta.description       || null,
                privacyUrl:        meta.privacyUrl        || null,
                legalBasis:        meta.legalBasis        || null,
                transferMechanism: meta.transferMechanism || null,
            };
        });
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
                name:        c.name,
                domain:      c.domain,
                path:        c.path,
                httpOnly:    c.httpOnly,
                secure:      c.secure,
                sameSite:    c.sameSite || "None",
                session:     c.expires === -1,
                expires:     c.expires !== -1 ? c.expires : null,
                size:        c.size,
                bannerCategory,
                description: describeCookie(c.name) || null,
            };
        });

        return { transfers, cookies, durationMs: Date.now() - startMs, error: null };
    } catch (err) {
        await browser.close().catch(() => {});
        return { transfers: [], cookies: [], durationMs: Date.now() - startMs, error: err.message };
    }
}
