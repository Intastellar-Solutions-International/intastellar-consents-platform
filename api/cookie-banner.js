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
import { scanDomain, describeCookie, categoryFromCookieName, vendorFromCookieName, VENDOR_META } from "./_scan-core.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
        });
    }
    return pool;
}

let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS pre_consent_scans (
            id                SERIAL          PRIMARY KEY,
            domain            VARCHAR(255)    NOT NULL,
            organisation_id   INTEGER         DEFAULT NULL,
            workspace_id      INTEGER         DEFAULT NULL,
            scanned_at        TIMESTAMP       NOT NULL DEFAULT NOW(),
            scan_duration_ms  INTEGER         DEFAULT NULL,
            status            VARCHAR(20)     NOT NULL DEFAULT 'completed'
                                  CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
            transfers         JSONB           DEFAULT NULL,
            cookies           JSONB           DEFAULT NULL,
            error_message     TEXT            DEFAULT NULL,
            created_at        TIMESTAMP       NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(
        `CREATE INDEX IF NOT EXISTS idx_pcs_domain_status ON pre_consent_scans (domain, status)`
    );
    // Drop NOT NULL on organisation_id if the table was created with the old schema
    await db.query(
        `ALTER TABLE pre_consent_scans ALTER COLUMN organisation_id DROP NOT NULL`
    );
    // Migrate check constraint to include 'in_progress' (old DBs only had pending/completed/failed)
    await db.query(`
        ALTER TABLE pre_consent_scans DROP CONSTRAINT IF EXISTS pre_consent_scans_status_check;
        ALTER TABLE pre_consent_scans ADD CONSTRAINT pre_consent_scans_status_check
            CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'));
    `).catch(() => {});
    tableReady = true;
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

// Shared data-processing: turns raw transfers + cookies arrays into the
// grouped categories object the banner consumes.
// overrides: Record<cookieName, { bannerCategory?, vendor?, description? }>
function buildCategories(domain, transfers, rawCookies, overrides = {}, definitions = []) {
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

        // Check promoted cookie_definitions for this cookie name (exact then prefix)
        const defMatch = definitions.find(d =>
            d.is_prefix ? c.name.startsWith(d.name) : c.name === d.name
        );

        // User override wins for unknown cookies; well-known pattern matches always take priority
        const bannerCategory = nameCategory
            || (ov.bannerCategory || null)
            || defMatch?.category
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
            description:    ov.description || c.description || describeCookie(c.name) || defMatch?.description || null,
            provider:       ov.vendor || cookieService || defMatch?.vendor || null,
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

        enriched.privacyUrl = owningVendor?.privacyUrl
            || VENDOR_META[enriched.provider]?.privacyUrl
            || null;

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

async function loadDefinitions(db) {
    try {
        const { rows } = await db.query(
            `SELECT name, is_prefix, vendor, category, description FROM cookie_definitions`
        );
        return rows;
    } catch (_) {
        return [];
    }
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

async function runBackgroundScan(domain, db) {
    // Skip if a scan is already running for this domain
    const { rows: active } = await db.query(
        `SELECT id FROM pre_consent_scans
          WHERE domain = $1 AND status IN ('pending', 'in_progress')
          LIMIT 1`,
        [domain]
    );
    if (active.length) return;

    // Insert an in_progress sentinel to block duplicate concurrent scans
    let scanId = null;
    try {
        const { rows } = await db.query(
            `INSERT INTO pre_consent_scans
                 (domain, organisation_id, scanned_at, status, transfers, cookies)
              VALUES ($1, NULL, NOW(), 'in_progress', '[]', '[]') RETURNING id`,
            [domain]
        );
        scanId = rows[0].id;
    } catch (err) {
        console.error("[cookie-banner] bg-scan insert failed:", err.message);
        return;
    }

    const { transfers, cookies: rawCookies, durationMs, error } = await scanDomain(domain);
    const finalStatus = error ? "failed" : "completed";
    const finalAt     = new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
        await db.query(
            `UPDATE pre_consent_scans
                SET status = $2, scanned_at = $3, scan_duration_ms = $4,
                    transfers = $5, cookies = $6, error_message = $7
              WHERE id = $1`,
            [scanId, finalStatus, finalAt, durationMs,
             JSON.stringify(transfers), JSON.stringify(rawCookies), error || null]
        );
    } catch (err) {
        console.error("[cookie-banner] bg-scan update failed:", err.message);
    }
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cache-Control, Authorization, X-Requested-With, Accept, Origin");
    res.setHeader("Access-Control-Max-Age", "300");

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

        // Auto-create the table if this is a fresh database deployment
        await ensureTable(db);

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
            const [overrides, definitions] = await Promise.all([
                loadOverrides(db, row.domain),
                loadDefinitions(db),
            ]);
            res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
            res.json({
                domain:     row.domain,
                scanned_at: row.scanned_at,
                categories: buildCategories(row.domain, row.transfers, row.cookies, overrides, definitions),
            });
            // Refresh the scan in the background so the next request always gets current data.
            // Vercel keeps the function alive until this handler's Promise resolves.
            await runBackgroundScan(domain, db).catch(err =>
                console.error("[cookie-banner] bg-scan error:", err.message)
            );
            return;
        }

        // A scan is already running — tell the banner to retry shortly
        const { rows: pending } = await db.query(
            `SELECT id FROM pre_consent_scans
              WHERE domain = $1 AND status IN ('pending', 'in_progress')
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

        const [overrides, definitions] = await Promise.all([
            loadOverrides(db, domain),
            loadDefinitions(db),
        ]);
        res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
        return res.json({
            domain,
            scanned_at: finalAt,
            categories: buildCategories(domain, transfers, rawCookies, overrides, definitions),
        });

    } catch (err) {
        console.error("[cookie-banner] error:", err.message);
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({ error: "Internal server error" });
    }
}
