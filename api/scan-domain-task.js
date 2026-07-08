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

export default async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { domain: rawDomain, companyName = "" } = req.body || {};
    if (!rawDomain) return res.status(400).json({ error: "domain is required" });

    const domain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    const db = getPool();

    // Skip if a scan is already running for this domain
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

    // Re-use the organisation_id from the most recent prior scan so results
    // remain visible to the correct org in the dashboard.
    const { rows: orgRows } = await db.query(
        `SELECT organisation_id
           FROM pre_consent_scans
          WHERE domain = $1 AND organisation_id IS NOT NULL
          ORDER BY scanned_at DESC
          LIMIT 1`,
        [domain]
    );
    const organisationId = orgRows[0]?.organisation_id ?? null;

    // Insert an in_progress sentinel to prevent concurrent duplicate scans
    const startTs = new Date().toISOString().slice(0, 19).replace("T", " ");
    let rowId = null;
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

    return res.status(200).json({
        domain,
        status,
        transfers: transfers.length,
        cookies:   cookies.length,
        durationMs,
        ...(error ? { error } : {}),
    });
}
