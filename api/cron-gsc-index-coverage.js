/**
 * GET/POST /api/cron-gsc-index-coverage
 *
 * Vercel cron — runs daily (schedule in vercel.json).
 *
 * For every Search Console connection:
 *   1. Discovers the site's full URL list from its submitted sitemaps
 *      (sitemaps.list + fetching each sitemap's XML for <loc> entries,
 *      recursing into sitemap-index files) and registers any URL not
 *      already tracked in gsc_index_status. Cheap — not quota-limited the
 *      way URL Inspection is — so this runs every day to pick up newly
 *      added pages quickly.
 *   2. Inspects a batch of GSC_INDEX_BATCH_SIZE (default 50) URLs per site
 *      via GSC's URL Inspection API — never-checked URLs first, then the
 *      stalest-checked, so a full site is covered as a rolling refresh over
 *      several days rather than all at once. This respects GSC's hard
 *      2,000 inspections/day/property quota (see inspectGscUrl's doc
 *      comment in api/_ad-platform-fetch.js) — a live "inspect everything
 *      on page load" design isn't possible for any site beyond a handful
 *      of pages, which is why this is a cron, not part of api/ad-daily-data.js.
 *
 * Required env vars: CRON_SECRET, POSTGRES_URL, GOOGLE_CLIENT_ID/SECRET
 * Optional: GSC_INDEX_BATCH_SIZE (default 50, capped at 500)
 */

import { tryRefreshToken, inspectGscUrl } from "./_ad-platform-fetch.js";
import { getPool } from "./_db.js";

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account") return null;
        if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        return payload;
    } catch { return null; }
}

const BATCH_SIZE = Math.min(parseInt(process.env.GSC_INDEX_BATCH_SIZE || "50", 10) || 50, 500);

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS gsc_index_status (
            id               BIGSERIAL    PRIMARY KEY,
            organisation_id  INTEGER      NOT NULL,
            domain           VARCHAR(255) NOT NULL,
            url              TEXT         NOT NULL,
            verdict          VARCHAR(16),
            coverage_state   TEXT,
            indexing_state   TEXT,
            robots_txt_state TEXT,
            last_crawl_time  TIMESTAMPTZ,
            google_canonical TEXT,
            user_canonical   TEXT,
            checked_at       TIMESTAMPTZ,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain, url)
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_gsc_idx_org_domain ON gsc_index_status (organisation_id, domain)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_gsc_idx_checked ON gsc_index_status (checked_at)`);
}

function extractLocs(xmlText) {
    const matches = xmlText.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || [];
    return matches.map(m => m.replace(/<\/?loc>/gi, "").trim()).filter(Boolean);
}

// Fetches a sitemap (or sitemap index) and returns the flat list of page
// URLs it ultimately contains — recursing into sitemap-index files (a
// sitemap whose own entries are other sitemaps, common once a site has more
// URLs than fit in one 50,000-entry file). Depth capped at 2 to bound
// worst-case fetch count rather than assuming indexes never nest.
async function fetchSitemapUrls(sitemapUrl, depth = 0) {
    if (depth > 2) return [];
    try {
        const resp = await fetch(sitemapUrl);
        if (!resp.ok) return [];
        const text = await resp.text();
        const locs = extractLocs(text);
        if (!locs.length) return [];
        // A sitemap index's entries are other sitemap files, not pages —
        // detected from the root element rather than guessing off the URL
        // (plenty of real sitemaps aren't served with a .xml extension).
        if (/<sitemapindex[\s>]/i.test(text)) {
            const nested = await Promise.all(locs.map(u => fetchSitemapUrls(u, depth + 1)));
            return nested.flat();
        }
        return locs;
    } catch {
        return [];
    }
}

async function discoverSiteUrls(accessToken, siteUrl) {
    try {
        const resp = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) return [];
        const data = await resp.json().catch(() => null);
        const sitemapUrls = (data?.sitemap || []).map(s => s.path).filter(Boolean);
        const perSitemap = await Promise.all(sitemapUrls.map(u => fetchSitemapUrls(u)));
        return [...new Set(perSitemap.flat())];
    } catch {
        return [];
    }
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Same two-auth-mode pattern as cron-ad-sync.js: Vercel cron sends
    // Authorization: Bearer <CRON_SECRET>; a dashboard-triggered manual run
    // sends a JWT + Organisation header, optionally scoped to one domain.
    const secret = process.env.CRON_SECRET;
    const isCronCall = secret && req.headers.authorization === `Bearer ${secret}`;
    const jwt = !isCronCall ? validateJwt(req.headers.authorization) : null;
    if (!isCronCall && !jwt) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();
    await ensureTable(db);

    const manualOrgId  = jwt ? parseInt(req.headers.organisation || "", 10) : null;
    const manualDomain = jwt ? (req.query.domain || "").trim().toLowerCase() : null;
    const whereExtra = manualOrgId
        ? `AND organisation_id = ${manualOrgId} ${manualDomain ? `AND LOWER(domain) = '${manualDomain.replace(/'/g, "''")}'` : ""}`
        : "";

    const { rows: connections } = await db.query(`
        SELECT organisation_id, domain, platform, account_id, access_token, refresh_token, token_expires_at
        FROM ad_platform_connections
        WHERE platform = 'google_search_console' AND account_id IS NOT NULL AND access_token IS NOT NULL
        ${whereExtra}
        ORDER BY organisation_id, domain
    `);

    const results = [];
    for (const rawConn of connections) {
        const conn = { ...rawConn };
        const tag = `[gsc-index-coverage] ${conn.domain}`;

        try {
            const refreshed = await tryRefreshToken(db, conn);
            conn.access_token = refreshed.access_token;
        } catch (e) {
            console.warn(`${tag} token refresh failed:`, e.message);
        }

        let discovered = [];
        try {
            discovered = await discoverSiteUrls(conn.access_token, conn.account_id);
        } catch (e) {
            console.warn(`${tag} sitemap discovery failed:`, e.message);
        }
        if (discovered.length) {
            try {
                await db.query(
                    `INSERT INTO gsc_index_status (organisation_id, domain, url)
                     SELECT $1, $2, u FROM UNNEST($3::text[]) AS u
                     ON CONFLICT (organisation_id, domain, url) DO NOTHING`,
                    [conn.organisation_id, conn.domain, discovered]
                );
            } catch (e) {
                console.warn(`${tag} URL registration failed:`, e.message);
            }
        }

        // Never-checked URLs first (checked_at IS NULL sorts first in
        // ASC order), then the stalest-checked — a rolling full-site
        // refresh rather than trying to cover everything in one run.
        const { rows: batch } = await db.query(
            `SELECT url FROM gsc_index_status
             WHERE organisation_id = $1 AND domain = $2
             ORDER BY checked_at ASC NULLS FIRST
             LIMIT $3`,
            [conn.organisation_id, conn.domain, BATCH_SIZE]
        ).catch(() => ({ rows: [] }));

        let inspected = 0;
        for (const { url } of batch) {
            const result = await inspectGscUrl(conn.access_token, conn.account_id, url);
            await db.query(
                `UPDATE gsc_index_status SET
                    verdict = $3, coverage_state = $4, indexing_state = $5, robots_txt_state = $6,
                    last_crawl_time = $7, google_canonical = $8, user_canonical = $9, checked_at = NOW()
                 WHERE organisation_id = $1 AND domain = $2 AND url = $10`,
                [
                    conn.organisation_id, conn.domain,
                    result?.verdict || null, result?.coverageState || null, result?.indexingState || null,
                    result?.robotsTxtState || null, result?.lastCrawlTime || null,
                    result?.googleCanonical || null, result?.userCanonical || null,
                    url,
                ]
            ).catch(() => {});
            inspected++;
        }

        results.push({ tag, discovered: discovered.length, inspected });
    }

    return res.status(200).json({ ok: true, sites: results.length, results });
}
