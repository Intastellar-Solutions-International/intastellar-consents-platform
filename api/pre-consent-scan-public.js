/**
 * POST /api/pre-consent-scan-public
 *
 * Public scan trigger — no authentication required.
 * Intended to be called by the cookie banner when /api/cookie-banner returns 404
 * (no scan exists yet for this domain).
 *
 * Body: { domain }
 *
 * Rate limits (enforced via DB, no external service needed):
 *   - 429 if a scan is already running (status = pending)
 *   - 200 + status "recent_scan" if a completed scan exists within the last 24 hours
 *   - 202 otherwise — scan starts immediately, result available ~30s later
 *
 * The scan runs inside the same lambda invocation after the 202 response is sent.
 * Vercel keeps the lambda alive until the handler function resolves.
 *
 * CORS: wildcard — safe to call from any website.
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

const DOMAIN_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const RESCAN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const rawDomain = ((req.body || {}).domain || "");
    if (!rawDomain || typeof rawDomain !== "string") {
        return res.status(400).json({ error: "domain is required" });
    }

    const cleanDomain = rawDomain.trim().toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0];

    if (!DOMAIN_RE.test(cleanDomain) || cleanDomain.includes("..") || !cleanDomain.includes(".")) {
        return res.status(400).json({ error: "Invalid domain" });
    }

    const db = getPool();

    // Check for an in-progress or recently completed scan
    const { rows } = await db.query(
        `SELECT id, organisation_id, status, scanned_at
           FROM pre_consent_scans
          WHERE domain = $1
          ORDER BY scanned_at DESC
          LIMIT 1`,
        [cleanDomain]
    );

    if (rows.length) {
        const latest = rows[0];

        if (latest.status === "pending") {
            return res.status(429).json({
                domain:  cleanDomain,
                status:  "scan_in_progress",
                message: "A scan is already running for this domain. Try /api/cookie-banner in ~30 seconds.",
            });
        }

        const ageMs = Date.now() - new Date(latest.scanned_at).getTime();
        if (latest.status === "completed" && ageMs < RESCAN_COOLDOWN_MS) {
            return res.status(200).json({
                domain:  cleanDomain,
                status:  "recent_scan",
                message: "A recent scan already exists.",
                scanned_at: latest.scanned_at,
            });
        }
    }

    // Inherit org_id from the last known scan for this domain (0 = unassociated public scan)
    const orgId = rows.length ? (rows[0].organisation_id || 0) : 0;

    // Insert a pending row and grab its id so we can update it after the scan
    const pendingAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    let pendingId;
    try {
        const ins = await db.query(
            `INSERT INTO pre_consent_scans
                 (domain, organisation_id, scanned_at, status, transfers, cookies)
              VALUES ($1, $2, $3, 'pending', '[]', '[]')
              RETURNING id`,
            [cleanDomain, orgId, pendingAt]
        );
        pendingId = ins.rows[0].id;
    } catch (err) {
        console.error("[pre-consent-scan-public] DB insert failed:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }

    // Respond 202 immediately — lambda continues running after res.json()
    res.status(202).json({
        domain:  cleanDomain,
        status:  "scan_queued",
        message: `Scan started. Results will be available at /api/cookie-banner?domain=${cleanDomain} in ~30 seconds.`,
    });

    // Run the scan (still inside the same lambda invocation)
    const { transfers, cookies, durationMs, error } = await scanDomain(cleanDomain);
    const finalStatus = error ? "failed" : "completed";
    const finalAt     = new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
        await db.query(
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
    } catch (err) {
        console.error("[pre-consent-scan-public] DB update failed:", err.message);
    }
}
