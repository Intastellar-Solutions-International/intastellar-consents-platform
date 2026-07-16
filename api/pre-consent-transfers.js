/**
 * GET /api/pre-consent-transfers?domain=example.com
 *
 * Returns the most recent pre-consent scan result for a domain.
 * Called directly by the frontend.
 * Validates the Intastellar Bearer JWT (iss/nbf/exp checks, same as PHP).
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 *
 * Query params:
 *   domain  string  required
 *
 * Env vars (set in Vercel project settings):
 *   POSTGRES_URL  — Neon connection string (EU Frankfurt)
 */

import pkg from "pg";
const { Pool } = pkg;

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
    { prefix: "_vcrr_",           bannerCategory: "necessary"  },
    { prefix: "__cf",             bannerCategory: "security"   },
    { exact:  "cf_clearance",     bannerCategory: "security"   },
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

function categoryFromCookieName(name) {
    for (const p of COOKIE_NAME_PATTERNS) {
        if (p.exact  && name === p.exact)          return p.bannerCategory;
        if (p.prefix && name.startsWith(p.prefix)) return p.bannerCategory;
    }
    return null;
}

function enrichWithBannerCategory(transfers, cookies, domain) {
    const domainRoot = domain.split(".").slice(-2).join(".");
    const enrichedTransfers = transfers.map(t => ({
        ...t,
        bannerCategory: t.bannerCategory || BANNER_CATEGORY[t.category] || "functional",
    }));
    const enrichedCookies = cookies.map(c => {
        if (c.bannerCategory) return c;
        const cookieRoot    = (c.domain || "").replace(/^\./, "").split(".").slice(-2).join(".");
        const isFirstParty  = cookieRoot === domainRoot;
        const matchedVendor = enrichedTransfers.find(t => t.host.split(".").slice(-2).join(".") === cookieRoot);
        const nameCategory  = categoryFromCookieName(c.name);
        return {
            ...c,
            bannerCategory: nameCategory
                ?? (matchedVendor ? matchedVendor.bannerCategory : null)
                ?? (isFirstParty ? "necessary" : "functional"),
        };
    });
    return { enrichedTransfers, enrichedCookies };
}

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

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
        return payload;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || "0", 10);
    if (!organisationId) {
        return res.status(400).json({ error: "Missing Organisation header" });
    }

    let domain = ((req.query.domain || "")).trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "").split("/")[0];
    if (!domain) {
        return res.status(400).json({ error: "Missing domain query parameter" });
    }

    try {
        const { rows } = await getPool().query(
            `SELECT domain, scanned_at, scan_duration_ms, status, transfers, cookies, error_message
               FROM pre_consent_scans
              WHERE domain = $1 AND organisation_id = $2
              ORDER BY scanned_at DESC
              LIMIT 1`,
            [domain, organisationId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "No scan found for this domain." });
        }

        const row = rows[0];
        const { enrichedTransfers, enrichedCookies } = enrichWithBannerCategory(
            row.transfers || [],
            row.cookies   || [],
            row.domain,
        );
        res.json({
            domain:                row.domain,
            scanned_at:            row.scanned_at,
            scan_duration_ms:      row.scan_duration_ms,
            status:                row.status,
            pre_consent_transfers: enrichedTransfers,
            pre_consent_cookies:   enrichedCookies,
            ...(row.error_message ? { error: row.error_message } : {}),
        });
    } catch (err) {
        console.error("[pre-consent-transfers] DB error:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
}
