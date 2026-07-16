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
import { scanDomain, describeCookie, categoryFromCookieName, vendorFromCookieName } from "./_scan-core.js";

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

const BANNER_CATEGORIES = ["necessary", "security", "analytics", "marketing", "functional"];

// Maps cookie name patterns to the vendor service they belong to.
// Used to associate first-party-set cookies (e.g. _ga on .example.com) back
// to the correct third-party vendor.

    return null;
}

// Shared data-processing: turns raw transfers + cookies arrays into the
// grouped categories object the banner consumes.
// overrides: Record<cookieName, { bannerCategory?, vendor?, description? }>
function buildCategories(domain, transfers, rawCookies, overrides = {}) {
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
        const ov            = overrides[c.name] || {};
        const cookieRoot    = (c.domain || "").replace(/^\./, "").split(".").slice(-2).join(".");
        const isFirstParty  = cookieRoot === domainRoot;
        const domainVendor  = vendorByRoot.get(cookieRoot);
        const nameCategory  = categoryFromCookieName(c.name);
        // User override wins for unknown cookies; well-known pattern matches always take priority
        const bannerCategory = nameCategory
            || (ov.bannerCategory || null)
            || (domainVendor ? domainVendor.bannerCategory : null)
            || c.bannerCategory
            || (isFirstParty ? "necessary" : "functional");

        const cookieService = vendorFromCookieName(c.name);
        const enriched = {
            name:           c.name,
            domain:         c.domain,
            session:        c.session,
            expires:        c.expires ?? null,
            httpOnly:       c.httpOnly,
            secure:         c.secure,
            sameSite:       c.sameSite,
            bannerCategory,
            description:    ov.description || c.description || describeCookie(c.name) || null,
            provider:       ov.vendor || cookieService || null,
        };

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

async function loadOverrides(db, domain) {
    try {
        const { rows } = await db.query(
            `SELECT cookie_name, banner_category, vendor, description
               FROM cookie_overrides WHERE domain = $1`,
            [domain]
        );
        const map = {};
        for (const r of rows) {
            map[r.cookie_name] = {
                bannerCategory: r.banner_category || "",
                vendor:         r.vendor          || "",
                description:    r.description     || "",
            };
        }
        return map;
    } catch (_) {
        // table may not exist yet
        return {};
    }
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    // Include Cache-Control so fetch({ cache: 'no-cache' }) doesn't trigger a preflight failure in Safari
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cache-Control");
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
            const overrides = await loadOverrides(db, row.domain);
            res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
            return res.json({
                domain:     row.domain,
                scanned_at: row.scanned_at,
                categories: buildCategories(row.domain, row.transfers, row.cookies, overrides),
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
            res.setHeader("Cache-Control", "no-store");
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
            res.setHeader("Cache-Control", "no-store");
            return res.status(503).json({
                domain,
                status:  "scan_failed",
                message: "Scan could not complete. Re-call this endpoint to retry.",
                error,
            });
        }

        const overrides = await loadOverrides(db, domain);
        res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
        return res.json({
            domain,
            scanned_at: finalAt,
            categories: buildCategories(domain, transfers, rawCookies, overrides),
        });

    } catch (err) {
        console.error("[cookie-banner] error:", err.message);
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({ error: "Internal server error" });
    }
}
