/**
 * GET /api/cookie-banner-scan?domain=example.com
 *
 * Public endpoint for cookie banners on sites with no existing scan data.
 * Runs a live Puppeteer scan the first time a banner loads on a new domain,
 * then serves cached results for subsequent calls within SCAN_MAX_AGE_DAYS.
 *
 * Security: the browser always sends an `Origin` header on cross-origin fetch,
 * and only the scanned domain itself can legitimately set that header — so we
 * verify the request comes FROM the domain being scanned. This prevents any
 * third-party site from triggering an expensive scan of an arbitrary domain.
 *
 * Flow:
 *   1. Recent completed scan (< 7 days) → return cached categories (same format
 *      as /api/cookie-banner). Header: Cache-Control public, s-maxage=3600.
 *   2. In-progress scan for this domain → return 202 (retry in a moment).
 *   3. No scan / stale → mark in_progress, run Puppeteer scan, save result,
 *      return categories.
 *
 * CORS: wildcard — designed to be called from any website.
 */

import pkg from "pg";
const { Pool } = pkg;
import { scanDomain, BANNER_CATEGORY, categoryFromCookieName } from "./_scan-core.js";

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

const SCAN_MAX_AGE_DAYS = 7;
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

    // Parse and normalise domain
    let domain = ((req.query.domain || "")).trim().toLowerCase()
        .replace(/^https?:\/\//, "").split("/")[0];
    if (!domain) {
        return res.status(400).json({ error: "domain query parameter is required" });
    }

    // Verify the request originates from the domain being scanned.
    // Browsers always send Origin on cross-origin fetch — this stops any third-party
    // site from triggering a scan of someone else's domain.
    const originHeader = (req.headers.origin || req.headers.referer || "").trim();
    if (originHeader) {
        const originRoot = originHeader
            .replace(/^https?:\/\//, "").split("/")[0]
            .split(".").slice(-2).join(".");
        const domainRoot = domain.split(".").slice(-2).join(".");
        if (originRoot !== domainRoot) {
            return res.status(403).json({
                error: "Request origin does not match the requested domain.",
            });
        }
    }
    // Requests without an Origin header (e.g. server-side, curl) are allowed
    // through; the recency guard prevents runaway scanning.

    const db = getPool();

    try {
        // 1. Return cached scan if recent enough
        const { rows: cached } = await db.query(
            `SELECT domain, scanned_at, transfers, cookies
               FROM pre_consent_scans
              WHERE domain = $1
                AND status = 'completed'
                AND scanned_at > NOW() - INTERVAL '${SCAN_MAX_AGE_DAYS} days'
              ORDER BY scanned_at DESC
              LIMIT 1`,
            [domain]
        );

        if (cached.length) {
            res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
            return res.status(200).json(buildResponse(cached[0], domain));
        }

        // 2. Bail if a scan is already running (prevents duplicate Puppeteer instances)
        const { rows: inProg } = await db.query(
            `SELECT 1 FROM pre_consent_scans
              WHERE domain = $1
                AND status = 'in_progress'
                AND scanned_at > NOW() - INTERVAL '10 minutes'
              LIMIT 1`,
            [domain]
        );
        if (inProg.length) {
            return res.status(202).json({
                status: "in_progress",
                message: "A scan is already running for this domain. Retry in a moment.",
            });
        }

        // 3. Insert an in_progress sentinel before launching Puppeteer so
        //    concurrent requests don't each start their own browser instance.
        const startTs = new Date().toISOString().slice(0, 19).replace("T", " ");
        let rowId = null;
        try {
            const { rows: ins } = await db.query(
                `INSERT INTO pre_consent_scans
                    (domain, organisation_id, scanned_at, status, transfers, cookies)
                 VALUES ($1, NULL, $2, 'in_progress', '[]', '[]')
                 RETURNING id`,
                [domain, startTs]
            );
            rowId = ins[0]?.id ?? null;
        } catch (dbErr) {
            // If the table has a NOT NULL constraint on organisation_id or no id column,
            // we still proceed — the scan result will be returned even without caching.
            console.error("[cookie-banner-scan] in_progress insert failed:", dbErr.message);
        }

        // 4. Run the scan
        const { transfers, cookies, durationMs, error } = await scanDomain(domain);
        const status    = error ? "failed" : "completed";
        const scannedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

        // 5. Persist the result (update the sentinel row, or insert fresh if no id)
        try {
            if (rowId !== null) {
                await db.query(
                    `UPDATE pre_consent_scans
                        SET status = $1, scanned_at = $2, scan_duration_ms = $3,
                            transfers = $4, cookies = $5, error_message = $6
                      WHERE id = $7`,
                    [status, scannedAt, durationMs, JSON.stringify(transfers), JSON.stringify(cookies), error || null, rowId]
                );
            } else {
                await db.query(
                    `INSERT INTO pre_consent_scans
                        (domain, organisation_id, scanned_at, scan_duration_ms, status, transfers, cookies, error_message)
                     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
                    [domain, scannedAt, durationMs, status, JSON.stringify(transfers), JSON.stringify(cookies), error || null]
                );
            }
        } catch (dbErr) {
            console.error("[cookie-banner-scan] result persist failed:", dbErr.message);
        }

        if (error && !transfers.length) {
            return res.status(500).json({ error: "Scan failed: " + error });
        }

        return res.status(200).json(
            buildResponse({ domain, scanned_at: scannedAt, transfers, cookies }, domain)
        );
    } catch (err) {
        console.error("[cookie-banner-scan] unexpected error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}

function buildResponse(row, domain) {
    const domainRoot = domain.split(".").slice(-2).join(".");

    const vendors = (row.transfers || []).map(t => ({
        service:        t.service,
        host:           t.host,
        category:       t.category,
        bannerCategory: t.bannerCategory || BANNER_CATEGORY[t.category] || "functional",
        dataRegion:     t.dataRegion,
        dataCountry:    t.dataCountry,
    }));

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

    const categories = Object.fromEntries(
        BANNER_CATEGORIES.map(cat => [
            cat,
            {
                cookies: cookies.filter(c => c.bannerCategory === cat),
                vendors: vendors.filter(v => v.bannerCategory === cat),
            },
        ])
    );

    return { domain: row.domain, scanned_at: row.scanned_at, categories };
}
