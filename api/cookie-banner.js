/**
 * GET /api/cookie-banner?domain=example.com
 *
 * Public endpoint for cookie banners. No authentication required — data
 * describes publicly observable behaviour on the scanned website only.
 *
 * Returns cookies and vendors from the most recent completed scan, grouped
 * into the four standard consent categories:
 *   necessary  — first-party / CMP infrastructure
 *   analytics  — analytics platforms
 *   marketing  — advertising, fingerprinting, social pixels
 *   functional — chat widgets, CDN / font services, unclassified third-parties
 *
 * Query params:
 *   domain  string  required  e.g. "example.com" or "www.example.com"
 *
 * Caching: responses are publicly cacheable for 1 hour (CDN edge), with a
 * 24-hour stale-while-revalidate window so banners never block on cold cache.
 *
 * CORS: wildcard — this endpoint is designed to be called from any website.
 */

import pkg from "pg";
const { Pool } = pkg;
import { scanDomain, describeCookie } from "./_scan-core.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return pool;
}

const COOKIE_NAME_PATTERNS = [
    // Google Analytics (current)
    { prefix: "_ga",              bannerCategory: "analytics"  },
    { prefix: "_dc_gtm_",         bannerCategory: "analytics"  },
    // Google Analytics (legacy __utm*)
    { exact:  "__utmz",           bannerCategory: "analytics"  },
    { exact:  "__utmt",           bannerCategory: "analytics"  },
    { exact:  "__utmv",           bannerCategory: "analytics"  },
    { exact:  "__utmd",           bannerCategory: "analytics"  },
    // Google Ads / Conversion
    { prefix: "_gcl_",            bannerCategory: "marketing"  },
    { prefix: "_gac_",            bannerCategory: "marketing"  },
    // Google Advertising / DoubleClick
    { exact:  "NID",              bannerCategory: "marketing"  },
    { exact:  "IDE",              bannerCategory: "marketing"  },
    { exact:  "DSID",             bannerCategory: "marketing"  },
    { exact:  "1P_JAR",           bannerCategory: "marketing"  },
    { exact:  "__gads",           bannerCategory: "marketing"  },
    { exact:  "__gpi",            bannerCategory: "marketing"  },
    { exact:  "ANID",             bannerCategory: "marketing"  },
    { exact:  "OTZ",              bannerCategory: "analytics"  },
    { exact:  "test_cookie",      bannerCategory: "marketing"  },
    // Google consent / auth
    { exact:  "CONSENT",          bannerCategory: "necessary"  },
    { exact:  "SID",              bannerCategory: "functional" },
    { exact:  "HSID",             bannerCategory: "functional" },
    { exact:  "SSID",             bannerCategory: "functional" },
    { exact:  "APISID",           bannerCategory: "functional" },
    { exact:  "SAPISID",          bannerCategory: "functional" },
    { exact:  "__Secure-ENID",    bannerCategory: "functional" },
    { exact:  "_fbp",             bannerCategory: "marketing"  },
    { exact:  "_fbc",             bannerCategory: "marketing"  },
    { exact:  "__hstc",           bannerCategory: "marketing"  },
    { exact:  "__hssc",           bannerCategory: "marketing"  },
    { exact:  "__hssrc",          bannerCategory: "marketing"  },
    { exact:  "hubspotutk",       bannerCategory: "marketing"  },
    { exact:  "li_sugr",          bannerCategory: "marketing"  },
    { exact:  "UserMatchHistory", bannerCategory: "marketing"  },
    { exact:  "lidc",             bannerCategory: "marketing"  },
    { exact:  "bcookie",          bannerCategory: "marketing"  },
    { exact:  "bscookie",         bannerCategory: "marketing"  },
    { prefix: "_hj",              bannerCategory: "analytics"  },
    { exact:  "_clck",            bannerCategory: "analytics"  },
    { exact:  "_clsk",            bannerCategory: "analytics"  },
    { exact:  "_ttp",             bannerCategory: "marketing"  },
    { exact:  "muc_ads",          bannerCategory: "marketing"  },
    { exact:  "personalization_id", bannerCategory: "marketing" },
    { prefix: "amplitude_",       bannerCategory: "analytics"  },
    { prefix: "intercom-",        bannerCategory: "functional" },
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
    // VWO — consent cookie is necessary; other VWO cookies are analytics
    { exact:  "_vwo_consent",     bannerCategory: "necessary"  },
    { prefix: "_vwo_",            bannerCategory: "analytics"  },
    { prefix: "_vis_opt_",        bannerCategory: "analytics"  },
    // Vimeo
    { exact:  "vuid",             bannerCategory: "analytics"  },
    // Matomo / Piwik
    { prefix: "_pk_id",           bannerCategory: "analytics"  },
    { prefix: "_pk_ses",          bannerCategory: "analytics"  },
    { prefix: "_pk_ref",          bannerCategory: "analytics"  },
    { prefix: "_pk_cvar",         bannerCategory: "analytics"  },
    // Chat widgets
    { prefix: "crisp-client",     bannerCategory: "functional" },
    { prefix: "drift_",           bannerCategory: "functional" },
    { prefix: "driftt_",          bannerCategory: "functional" },
    { exact:  "__zlcmid",         bannerCategory: "functional" },
    { prefix: "freshworks",       bannerCategory: "functional" },
    // YouTube / Google Video
    { exact:  "PREF",                  bannerCategory: "functional" },
    { exact:  "YSC",                   bannerCategory: "analytics"  },
    { exact:  "VISITOR_INFO1_LIVE",    bannerCategory: "analytics"  },
    { exact:  "VISITOR_PRIVACY_METADATA", bannerCategory: "necessary" },
    { exact:  "GPS",                   bannerCategory: "analytics"  },
    { prefix: "__Secure-YEC",          bannerCategory: "analytics"  },
    { prefix: "__Secure-3PAPISID",     bannerCategory: "marketing"  },
    { prefix: "__Secure-3PSID",        bannerCategory: "marketing"  },
    { prefix: "__Secure-1PAPISID",     bannerCategory: "functional" },
    { prefix: "__Secure-1PSID",        bannerCategory: "functional" },
    // Microsoft Ads / UET
    { exact:  "MUID",             bannerCategory: "marketing"  },
    { exact:  "MSFPC",            bannerCategory: "marketing"  },
    { exact:  "MR",               bannerCategory: "marketing"  },
    { prefix: "_uetsid",          bannerCategory: "marketing"  },
    { prefix: "_uetvid",          bannerCategory: "marketing"  },
    // Adobe Analytics
    { exact:  "s_vi",             bannerCategory: "analytics"  },
    { exact:  "s_fid",            bannerCategory: "analytics"  },
    { exact:  "s_cc",             bannerCategory: "analytics"  },
    { exact:  "s_sq",             bannerCategory: "analytics"  },
    { exact:  "s_nr",             bannerCategory: "analytics"  },
    { prefix: "AMCV_",            bannerCategory: "analytics"  },
    { prefix: "AMCVS_",           bannerCategory: "analytics"  },
    // Adobe Target / Audience Manager
    { exact:  "mbox",             bannerCategory: "marketing"  },
    { prefix: "mboxSession",      bannerCategory: "marketing"  },
    { exact:  "at_check",         bannerCategory: "marketing"  },
    { exact:  "demdex",           bannerCategory: "marketing"  },
    { exact:  "dpm",              bannerCategory: "marketing"  },
    // Segment
    { prefix: "ajs_",             bannerCategory: "analytics"  },
    // Mixpanel
    { prefix: "mp_",              bannerCategory: "analytics"  },
    // FullStory
    { exact:  "fs_uid",           bannerCategory: "analytics"  },
    { prefix: "fs_",              bannerCategory: "analytics"  },
    // Heap
    { prefix: "_hp2_",            bannerCategory: "analytics"  },
    { prefix: "_hp2id",           bannerCategory: "analytics"  },
    // Yandex Metrica
    { prefix: "_ym_",             bannerCategory: "analytics"  },
    { exact:  "yabs-sid",         bannerCategory: "marketing"  },
    // Snapchat Pixel
    { exact:  "_scid",            bannerCategory: "marketing"  },
    { exact:  "_sctr",            bannerCategory: "marketing"  },
    // Twitter / X (extended)
    { exact:  "ct0",              bannerCategory: "marketing"  },
    { exact:  "twid",             bannerCategory: "marketing"  },
    { prefix: "guest_id",         bannerCategory: "marketing"  },
    // Criteo
    { exact:  "cto_bundle",       bannerCategory: "marketing"  },
    { exact:  "cto_tld_test",     bannerCategory: "marketing"  },
    // Taboola
    { exact:  "t_gid",            bannerCategory: "marketing"  },
    { prefix: "taboola_",         bannerCategory: "marketing"  },
    // Outbrain
    { exact:  "obuid",            bannerCategory: "marketing"  },
    // Quora Pixel
    { exact:  "_qca",             bannerCategory: "marketing"  },
    // Pardot / Salesforce Marketing Cloud
    { prefix: "visitor_id",       bannerCategory: "marketing"  },
    { prefix: "lpv",              bannerCategory: "marketing"  },
    { exact:  "pardot",           bannerCategory: "marketing"  },
    // Braze
    { prefix: "__braze_",         bannerCategory: "marketing"  },
    // Session recording & heatmaps
    { prefix: "mf_",              bannerCategory: "analytics"  },
    { prefix: "SL_",              bannerCategory: "analytics"  },
    { exact:  "_lo_uid",          bannerCategory: "analytics"  },
    { exact:  "_lo_v",            bannerCategory: "analytics"  },
    { prefix: "__chartbeat",      bannerCategory: "analytics"  },
    // Woopra
    { exact:  "wooTracker",       bannerCategory: "analytics"  },
    // GitHub
    { exact:  "_octo",                bannerCategory: "analytics"  },
    { exact:  "preferred_color_mode", bannerCategory: "functional" },
    { exact:  "tz",                   bannerCategory: "functional" },
    { exact:  "cpu_bucket",           bannerCategory: "analytics"  },
    { exact:  "color_mode",           bannerCategory: "functional" },
    { exact:  "dotcom_user",          bannerCategory: "functional" },
    // Generic preference cookies (appear first-party on many platforms)
    { exact:  "timezone",         bannerCategory: "functional" },
    { exact:  "language",         bannerCategory: "functional" },
    { exact:  "locale",           bannerCategory: "functional" },
    { exact:  "currency",         bannerCategory: "functional" },
    { exact:  "dark_mode",        bannerCategory: "functional" },
    { exact:  "theme",            bannerCategory: "functional" },
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
    { prefix: "_iub_cs-",         bannerCategory: "necessary"  }, // iubenda consent
    { exact:  "didomi_token",     bannerCategory: "necessary"  }, // Didomi consent
    { prefix: "didomi_",          bannerCategory: "necessary"  }, // Didomi (other)
    { exact:  "IntastellarConsentSolution", bannerCategory: "necessary" }, // Intastellar Consents — stores visitor consent, expires 3 months
];

function categoryFromCookieName(name) {
    for (const p of COOKIE_NAME_PATTERNS) {
        if (p.exact  && name === p.exact)          return p.bannerCategory;
        if (p.prefix && name.startsWith(p.prefix)) return p.bannerCategory;
    }
    return null;
}

const BANNER_CATEGORY = {
    advertising:    "marketing",
    fingerprinting: "marketing",
    social:         "marketing",
    analytics:      "analytics",
    functional:     "functional",
    cdn:            "functional",
    cmp:            "necessary",
    "third-party":  "functional",
};

const BANNER_CATEGORIES = ["necessary", "analytics", "marketing", "functional"];

// Maps cookie name patterns to the vendor service they belong to.
// Used to associate first-party-set cookies (e.g. _ga on .example.com) back
// to the correct third-party vendor.
const COOKIE_VENDOR_PATTERNS = [
    { prefix: "_ga",                service: "Google Analytics"        },
    { exact:  "_gid",               service: "Google Analytics"        },
    { exact:  "_gcl_au",            service: "Google Tag Manager"      },
    { prefix: "_gcl_",              service: "Google Ads"              },
    { prefix: "_gac_",              service: "Google Ads"              },
    { prefix: "_hj",                service: "Hotjar"                  },
    { exact:  "_fbp",               service: "Facebook / Meta Pixel"   },
    { exact:  "_fbc",               service: "Facebook / Meta Pixel"   },
    { exact:  "hubspotutk",         service: "HubSpot"                 },
    { exact:  "__hstc",             service: "HubSpot"                 },
    { exact:  "__hssc",             service: "HubSpot"                 },
    { exact:  "__hssrc",            service: "HubSpot"                 },
    { exact:  "li_sugr",            service: "LinkedIn Insight Tag"    },
    { exact:  "UserMatchHistory",   service: "LinkedIn Insight Tag"    },
    { exact:  "lidc",               service: "LinkedIn Insight Tag"    },
    { exact:  "bcookie",            service: "LinkedIn Insight Tag"    },
    { exact:  "bscookie",           service: "LinkedIn Insight Tag"    },
    { exact:  "_clck",              service: "Microsoft Clarity"       },
    { exact:  "_clsk",              service: "Microsoft Clarity"       },
    { exact:  "_ttp",               service: "TikTok Pixel"            },
    { exact:  "muc_ads",            service: "Twitter / X Pixel"       },
    { exact:  "personalization_id", service: "Twitter / X Pixel"       },
    { prefix: "_pin_",              service: "Pinterest"               },
    { prefix: "_pinterest_",        service: "Pinterest"               },
    { exact:  "_vwo_consent",       service: "VWO"                     },
    { prefix: "_vwo_",              service: "VWO"                     },
    { prefix: "_vis_opt_",          service: "VWO"                     },
    { exact:  "reddaid",            service: "Reddit Pixel"            },
    { exact:  "__kla_id",           service: "Klaviyo"                 },
    { prefix: "amplitude_",         service: "Amplitude"               },
    { prefix: "__stripe_",          service: "Stripe"                  },
    { prefix: "_wijs",              service: "Wistia"                  },
    { prefix: "tp.",                service: "Trustpilot"              },
    { exact:  "IntastellarConsentSolution", service: "Intastellar Consents" },
];

function vendorServiceForCookie(name) {
    for (const p of COOKIE_VENDOR_PATTERNS) {
        if (p.exact  && name === p.exact)           return p.service;
        if (p.prefix && name.startsWith(p.prefix))  return p.service;
    }
    return null;
}

// Shared data-processing: turns raw transfers + cookies arrays into the
// grouped categories object the banner consumes.
function buildCategories(domain, transfers, rawCookies) {
    const domainRoot = domain.split(".").slice(-2).join(".");

    const vendorMap = new Map();
    for (const t of (transfers || [])) {
        const bannerCategory = t.bannerCategory || BANNER_CATEGORY[t.category] || "functional";
        if (!vendorMap.has(t.service)) {
            vendorMap.set(t.service, {
                service:           t.service,
                category:          t.category,
                bannerCategory,
                dataRegion:        t.dataRegion,
                dataCountry:       t.dataCountry,
                description:       t.description       || null,
                privacyUrl:        t.privacyUrl        || null,
                legalBasis:        t.legalBasis        || null,
                transferMechanism: t.transferMechanism || null,
                hosts:             [],
                cookies:           [],
            });
        }
        const vendor = vendorMap.get(t.service);
        if (!vendor.hosts.includes(t.host)) vendor.hosts.push(t.host);
    }
    const vendors = [...vendorMap.values()];

    const vendorByService = new Map(vendors.map(v => [v.service, v]));
    const vendorByRoot    = new Map();
    for (const v of vendors) {
        for (const host of v.hosts) {
            vendorByRoot.set(host.split(".").slice(-2).join("."), v);
        }
    }

    const cookies = (rawCookies || []).map(c => {
        const cookieRoot    = (c.domain || "").replace(/^\./, "").split(".").slice(-2).join(".");
        const isFirstParty  = cookieRoot === domainRoot;
        const domainVendor  = vendorByRoot.get(cookieRoot);
        const bannerCategory = c.bannerCategory
            || (domainVendor ? domainVendor.bannerCategory : null)
            || categoryFromCookieName(c.name)
            || (isFirstParty ? "necessary" : "functional");

        const enriched = {
            name:           c.name,
            domain:         c.domain,
            session:        c.session,
            expires:        c.expires ?? null,
            httpOnly:       c.httpOnly,
            secure:         c.secure,
            sameSite:       c.sameSite,
            bannerCategory,
            description:    c.description || describeCookie(c.name) || null,
        };

        const cookieService = vendorServiceForCookie(c.name);
        // Exact service name match, then brand-family fallback (e.g. "Google Ads" cookie
        // on a site where only "Google Analytics" was detected — both are Google).
        const owningVendor = domainVendor
            || vendorByService.get(cookieService)
            || (cookieService
                ? [...vendorByService.values()].find(v =>
                    v.service.split(" ")[0] === cookieService.split(" ")[0])
                : null);
        if (owningVendor) owningVendor.cookies.push(enriched);

        return enriched;
    });

    const categories = Object.fromEntries(
        BANNER_CATEGORIES.map(cat => [
            cat,
            {
                cookies: cookies.filter(c => c.bannerCategory === cat),
                vendors: vendors.filter(v => v.bannerCategory === cat),
            },
        ])
    );

    return categories;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    let domain = ((req.query.domain || "")).trim().toLowerCase()
        .replace(/^https?:\/\//, "").split("/")[0];
    if (!domain) {
        return res.status(400).json({ error: "domain query parameter is required" });
    }

    try {
        const db = getPool();

        // Happy path — completed scan already exists
        const { rows } = await db.query(
            `SELECT domain, scanned_at, transfers, cookies
               FROM pre_consent_scans
              WHERE domain = $1 AND status = 'completed'
              ORDER BY scanned_at DESC
              LIMIT 1`,
            [domain]
        );

        if (rows.length) {
            const row = rows[0];
            res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
            return res.json({
                domain:     row.domain,
                scanned_at: row.scanned_at,
                categories: buildCategories(row.domain, row.transfers, row.cookies),
            });
        }

        // A scan is already running — tell the banner to retry shortly
        const { rows: pending } = await db.query(
            `SELECT id FROM pre_consent_scans
              WHERE domain = $1 AND status = 'pending'
              LIMIT 1`,
            [domain]
        );

        if (pending.length) {
            return res.status(202).json({
                domain,
                status:  "scan_in_progress",
                message: "A scan is already running. Re-call this endpoint in ~30 seconds.",
            });
        }

        // No scan at all — run one now and return the results to this visitor
        const { transfers, cookies: rawCookies, durationMs, error } = await scanDomain(domain);
        const finalStatus = error ? "failed" : "completed";
        const finalAt     = new Date().toISOString().slice(0, 19).replace("T", " ");

        try {
            await db.query(
                `INSERT INTO pre_consent_scans
                     (domain, organisation_id, scanned_at, scan_duration_ms, status, transfers, cookies, error_message)
                  VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
                [domain, finalAt, durationMs, finalStatus, JSON.stringify(transfers), JSON.stringify(rawCookies), error || null]
            );
        } catch (insErr) {
            console.error("[cookie-banner] auto-scan save failed:", insErr.message);
        }

        if (error) {
            return res.status(503).json({
                domain,
                status:  "scan_failed",
                message: "Scan could not complete. Re-call this endpoint to retry.",
                error,
            });
        }

        res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
        return res.json({
            domain,
            scanned_at: finalAt,
            categories: buildCategories(domain, transfers, rawCookies),
        });

    } catch (err) {
        console.error("[cookie-banner] error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
