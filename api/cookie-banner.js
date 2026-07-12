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
import { scanDomain } from "./_scan-core.js";

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
    { prefix: "_ga",              bannerCategory: "analytics"  },
    { prefix: "_gcl_",            bannerCategory: "marketing"  },
    { prefix: "_gac_",            bannerCategory: "marketing"  },
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
        const { rows } = await getPool().query(
            `SELECT domain, scanned_at, transfers, cookies
               FROM pre_consent_scans
              WHERE domain = $1 AND status = 'completed'
              ORDER BY scanned_at DESC
              LIMIT 1`,
            [domain]
        );

        if (!rows.length) {
            // No completed scan — check whether one is already running
            const { rows: pending } = await getPool().query(
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

            // No scan at all — trigger one automatically
            const pendingAt = new Date().toISOString().slice(0, 19).replace("T", " ");
            let pendingId;
            try {
                const ins = await getPool().query(
                    `INSERT INTO pre_consent_scans
                         (domain, organisation_id, scanned_at, status, transfers, cookies)
                      VALUES ($1, 0, $2, 'pending', '[]', '[]')
                      RETURNING id`,
                    [domain, pendingAt]
                );
                pendingId = ins.rows[0].id;
            } catch (insErr) {
                console.error("[cookie-banner] auto-scan insert failed:", insErr.message);
            }

            // Respond 202 immediately; lambda keeps running until the handler resolves
            res.status(202).json({
                domain,
                status:  "scan_queued",
                message: "No scan data found. A scan has started automatically — re-call this endpoint in ~30 seconds.",
            });

            if (pendingId) {
                const { transfers, cookies, durationMs, error } = await scanDomain(domain);
                const finalStatus = error ? "failed" : "completed";
                const finalAt     = new Date().toISOString().slice(0, 19).replace("T", " ");
                try {
                    await getPool().query(
                        `UPDATE pre_consent_scans
                            SET status           = $1,
                                transfers        = $2,
                                cookies          = $3,
                                scan_duration_ms = $4,
                                scanned_at       = $5,
                                error_message    = $6
                          WHERE id = $7`,
                        [finalStatus, JSON.stringify(transfers), JSON.stringify(cookies), durationMs, finalAt, error || null, pendingId]
                    );
                } catch (updErr) {
                    console.error("[cookie-banner] auto-scan update failed:", updErr.message);
                }
            }
            return;
        }

        const row        = rows[0];
        const domainRoot = domain.split(".").slice(-2).join(".");

        // Group transfers by service name — multiple hosts (e.g. track.hubspot.com +
        // app.hubspot.com) are merged into a single vendor entry with a hosts array.
        const vendorMap = new Map();
        for (const t of (row.transfers || [])) {
            const bannerCategory = t.bannerCategory || BANNER_CATEGORY[t.category] || "functional";
            if (!vendorMap.has(t.service)) {
                vendorMap.set(t.service, {
                    service:        t.service,
                    category:       t.category,
                    bannerCategory,
                    dataRegion:     t.dataRegion,
                    dataCountry:    t.dataCountry,
                    hosts:          [],
                    cookies:        [],
                });
            }
            const vendor = vendorMap.get(t.service);
            if (!vendor.hosts.includes(t.host)) vendor.hosts.push(t.host);
        }
        const vendors = [...vendorMap.values()];

        // Build lookup maps for cookie association
        const vendorByService = new Map(vendors.map(v => [v.service, v]));
        const vendorByRoot    = new Map();
        for (const v of vendors) {
            for (const host of v.hosts) {
                vendorByRoot.set(host.split(".").slice(-2).join("."), v);
            }
        }

        // Enrich cookies with bannerCategory, then associate each cookie with its vendor
        const cookies = (row.cookies || []).map(c => {
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
            };

            // Associate cookie with its vendor:
            // 1. domain root match (third-party cookies set on the vendor's own domain)
            // 2. name pattern match (first-party-set cookies like _ga, _hj*, _gcl_*)
            const owningVendor = domainVendor
                || vendorByService.get(vendorServiceForCookie(c.name));
            if (owningVendor) owningVendor.cookies.push(enriched);

            return enriched;
        });

        // Group by banner category
        const categories = Object.fromEntries(
            BANNER_CATEGORIES.map(cat => [
                cat,
                {
                    cookies: cookies.filter(c => c.bannerCategory === cat),
                    vendors: vendors.filter(v => v.bannerCategory === cat),
                },
            ])
        );

        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        return res.json({
            domain:     row.domain,
            scanned_at: row.scanned_at,
            categories,
        });
    } catch (err) {
        console.error("[cookie-banner] DB error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
