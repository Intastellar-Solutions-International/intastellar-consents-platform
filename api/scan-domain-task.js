/**
 * POST /api/scan-domain-task
 *
 * Internal worker — called exclusively by cron-scan-domains.js.
 * Runs a full Puppeteer pre-consent scan for one domain and saves the result.
 *
 * Not intended for direct public use. Secured via CRON_SECRET.
 *
 * Body: { domain: string, companyName?: string }
 *
 * Returns a scan summary once complete (called by the cron dispatcher which
 * awaits the response before moving to the next batch).
 */

import pkg from "pg";
const { Pool } = pkg;
import { scanDomain, describeCookie, vendorFromCookieName, categoryFromCookieName } from "./_scan-core.js";

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

async function recordDiscoveries(db, scannedSite, cookies) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS cookie_discoveries (
            name             TEXT        PRIMARY KEY,
            times_seen       INTEGER     NOT NULL DEFAULT 1,
            first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            example_sites    TEXT[]      NOT NULL DEFAULT '{}',
            has_description  BOOLEAN     NOT NULL DEFAULT FALSE,
            has_vendor       BOOLEAN     NOT NULL DEFAULT FALSE,
            has_category     BOOLEAN     NOT NULL DEFAULT FALSE
        )
    `);

    // Only record cookies missing a description — these are gaps in our static DB
    const unknown = cookies.filter(c =>
        c.name &&
        c.name.length <= 100 &&
        !describeCookie(c.name)
    );
    if (!unknown.length) return;

    // Ensure cookie_domains column exists (safe to call repeatedly — no-ops if already present)
    await db.query(`
        ALTER TABLE cookie_discoveries ADD COLUMN IF NOT EXISTS cookie_domains TEXT[] DEFAULT '{}'
    `).catch(() => {});

    for (const c of unknown) {
        const hasVendor    = !!vendorFromCookieName(c.name);
        const hasCategory  = !!categoryFromCookieName(c.name);
        const cookieDomain = c.domain ? c.domain.replace(/^\./, "") : null;
        await db.query(`
            INSERT INTO cookie_discoveries
                (name, example_sites, cookie_domains, has_vendor, has_category)
            VALUES ($1, ARRAY[$2::text], $3, $4, $5)
            ON CONFLICT (name) DO UPDATE SET
                times_seen      = cookie_discoveries.times_seen + 1,
                last_seen_at    = NOW(),
                has_description = FALSE,
                has_vendor      = $4 OR cookie_discoveries.has_vendor,
                has_category    = $5 OR cookie_discoveries.has_category,
                example_sites   = CASE
                    WHEN $2 = ANY(cookie_discoveries.example_sites)              THEN cookie_discoveries.example_sites
                    WHEN array_length(cookie_discoveries.example_sites, 1) >= 10 THEN cookie_discoveries.example_sites
                    ELSE array_append(cookie_discoveries.example_sites, $2::text)
                END,
                cookie_domains  = CASE
                    WHEN $6 IS NULL                                               THEN cookie_discoveries.cookie_domains
                    WHEN $6 = ANY(cookie_discoveries.cookie_domains)              THEN cookie_discoveries.cookie_domains
                    WHEN array_length(cookie_discoveries.cookie_domains, 1) >= 10 THEN cookie_discoveries.cookie_domains
                    ELSE array_append(cookie_discoveries.cookie_domains, $6::text)
                END
        `, [c.name, scannedSite, cookieDomain ? `{${cookieDomain}}` : '{}',
            hasVendor, hasCategory, cookieDomain]);
    }

    console.log(`[scan-domain-task] recorded ${unknown.length} cookie discoveries from ${scannedSite}`);
}

export default async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { domain: rawDomain, companyName = "", pendingId = null } = req.body || {};
    if (!rawDomain) return res.status(400).json({ error: "domain is required" });

    const domain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    const db = getPool();

    let rowId = null;

    if (pendingId !== null) {
        // Called from pre-consent-scan-public — reuse the pending row it already created
        try {
            await db.query(
                `UPDATE pre_consent_scans SET status = 'in_progress' WHERE id = $1`,
                [pendingId]
            );
            rowId = pendingId;
        } catch (dbErr) {
            console.error(`[scan-domain-task] pending→in_progress update failed for ${domain}:`, dbErr.message);
        }
    } else {
        // Called from cron — check for duplicate and insert our own sentinel
        const { rows: inProg } = await db.query(
            `SELECT 1 FROM pre_consent_scans
              WHERE domain    = $1
                AND status    = 'in_progress'
                AND scanned_at > NOW() - INTERVAL '10 minutes'
              LIMIT 1`,
            [domain]
        );
        if (inProg.length) {
            return res.status(200).json({ domain, status: "already_in_progress" });
        }

        // Re-use the organisation_id from the most recent prior scan
        const { rows: orgRows } = await db.query(
            `SELECT organisation_id
               FROM pre_consent_scans
              WHERE domain = $1 AND organisation_id IS NOT NULL
              ORDER BY scanned_at DESC
              LIMIT 1`,
            [domain]
        );
        const organisationId = orgRows[0]?.organisation_id ?? null;

        const startTs = new Date().toISOString().slice(0, 19).replace("T", " ");
        try {
            const { rows: ins } = await db.query(
                `INSERT INTO pre_consent_scans
                    (domain, organisation_id, scanned_at, status, transfers, cookies)
                 VALUES ($1, $2, $3, 'in_progress', '[]', '[]')
                 RETURNING id`,
                [domain, organisationId, startTs]
            );
            rowId = ins[0]?.id ?? null;
        } catch (dbErr) {
            console.error(`[scan-domain-task] in_progress insert failed for ${domain}:`, dbErr.message);
        }
    }

    // Run the scan
    console.log(`[scan-domain-task] scanning ${domain}${companyName ? ` (${companyName})` : ""}`);
    const { transfers, cookies, durationMs, error } = await scanDomain(domain);
    const status    = error ? "failed" : "completed";
    const scannedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Persist result — update the sentinel row if we have its id, else insert fresh
    try {
        if (rowId !== null) {
            await db.query(
                `UPDATE pre_consent_scans
                    SET status          = $1,
                        scanned_at      = $2,
                        scan_duration_ms = $3,
                        transfers       = $4,
                        cookies         = $5,
                        error_message   = $6
                  WHERE id = $7`,
                [status, scannedAt, durationMs,
                 JSON.stringify(transfers), JSON.stringify(cookies),
                 error || null, rowId]
            );
        } else {
            await db.query(
                `INSERT INTO pre_consent_scans
                    (domain, organisation_id, scanned_at, scan_duration_ms,
                     status, transfers, cookies, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [domain, organisationId, scannedAt, durationMs,
                 status, JSON.stringify(transfers), JSON.stringify(cookies),
                 error || null]
            );
        }
    } catch (dbErr) {
        console.error(`[scan-domain-task] persist failed for ${domain}:`, dbErr.message);
    }

    console.log(`[scan-domain-task] done ${domain} — ${status} in ${durationMs}ms, ${transfers.length} transfers, ${cookies.length} cookies`);

    // Record unknown cookies for the discovery database
    if (!error && cookies.length) {
        recordDiscoveries(db, domain, cookies).catch(err =>
            console.error(`[scan-domain-task] discovery recording failed for ${domain}:`, err.message)
        );
    }

    return res.status(200).json({
        domain,
        status,
        transfers: transfers.length,
        cookies:   cookies.length,
        durationMs,
        ...(error ? { error } : {}),
    });
}
