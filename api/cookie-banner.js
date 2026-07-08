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
    { prefix: "OptanonConsent",   bannerCategory: "necessary"  },
    { prefix: "CookieConsent",    bannerCategory: "necessary"  },
    { prefix: "cookieyes",        bannerCategory: "necessary"  },
    { prefix: "cc_cookie",        bannerCategory: "necessary"  },
    { prefix: "cmplz_",           bannerCategory: "necessary"  },
    { prefix: "euconsent",        bannerCategory: "necessary"  },
    { prefix: "GDPR",             bannerCategory: "necessary"  },
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
            return res.status(404).json({
                error: "No completed scan found for this domain. Trigger a scan from the Intastellar dashboard first.",
            });
        }

        const row        = rows[0];
        const domainRoot = domain.split(".").slice(-2).join(".");

        // Enrich vendors with bannerCategory (backfills legacy rows that predate the field)
        const vendors = (row.transfers || []).map(t => ({
            service:        t.service,
            host:           t.host,
            category:       t.category,
            bannerCategory: t.bannerCategory || BANNER_CATEGORY[t.category] || "functional",
            dataRegion:     t.dataRegion,
            dataCountry:    t.dataCountry,
            resourceType:   t.resourceType,
        }));

        // Enrich cookies with bannerCategory
        const cookies = (row.cookies || []).map(c => {
            const cookieRoot    = (c.domain || "").replace(/^\./, "").split(".").slice(-2).join(".");
            const isFirstParty  = cookieRoot === domainRoot;
            const matchedVendor = vendors.find(v => v.host.split(".").slice(-2).join(".") === cookieRoot);
            const bannerCategory = c.bannerCategory
                || (matchedVendor ? matchedVendor.bannerCategory : null)
                || categoryFromCookieName(c.name)
                || (isFirstParty ? "necessary" : "functional");
            return {
                name:           c.name,
                domain:         c.domain,
                session:        c.session,
                expires:        c.expires ?? null,
                httpOnly:       c.httpOnly,
                secure:         c.secure,
                sameSite:       c.sameSite,
                bannerCategory,
            };
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
