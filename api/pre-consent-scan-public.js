/**
 * POST /api/pre-consent-scan-public
 *
 * Public scan trigger — no authentication required.
 *
 * Responds 202 immediately, then delegates the actual Puppeteer scan to
 * /api/scan-domain-task (a separate Lambda invocation). This keeps Chromium
 * out of this function entirely, so an OOM in the scanner can never prevent
 * the 202 response from being delivered to the caller.
 *
 * Rate limits (enforced via DB):
 *   - 429 if a scan is already running (status = pending / in_progress)
 *   - 200 + status "recent_scan" if a completed scan exists within 24 hours
 *   - 202 otherwise
 *
 * CORS: wildcard — safe to call from any website.
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

const DOMAIN_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const RESCAN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SCANNER_BASE = process.env.SCANNER_SELF_URL || "https://www.intastellarconsents.com";

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

    let rows;
    try {
        const result = await db.query(
            `SELECT id, organisation_id, status, scanned_at
               FROM pre_consent_scans
              WHERE domain = $1
              ORDER BY scanned_at DESC
              LIMIT 1`,
            [cleanDomain]
        );
        rows = result.rows;
    } catch (err) {
        console.error("[pre-consent-scan-public] DB select failed:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }

    if (rows.length) {
        const latest = rows[0];

        if (latest.status === "pending" || latest.status === "in_progress") {
            return res.status(429).json({
                domain:  cleanDomain,
                status:  "scan_in_progress",
                message: "A scan is already running for this domain. Try /api/cookie-banner in ~30 seconds.",
            });
        }

        const ageMs = Date.now() - new Date(latest.scanned_at).getTime();
        if (latest.status === "completed" && ageMs < RESCAN_COOLDOWN_MS) {
            return res.status(200).json({
                domain:     cleanDomain,
                status:     "recent_scan",
                message:    "A recent scan already exists.",
                scanned_at: latest.scanned_at,
            });
        }
    }

    const orgId    = rows.length ? (rows[0].organisation_id || null) : null;
    const pendingAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Insert pending row first so concurrent callers see it immediately
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

    // Respond 202 before doing any heavy work
    res.status(202).json({
        domain:  cleanDomain,
        status:  "scan_queued",
        message: `Scan started. Results will be available at /api/cookie-banner?domain=${cleanDomain} in ~30 seconds.`,
    });

    // Delegate the actual Puppeteer scan to scan-domain-task (separate Lambda).
    // This keeps Chromium out of this process so an OOM can't kill this response.
    try {
        await fetch(`${SCANNER_BASE}/api/scan-domain-task`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.CRON_SECRET || ""}`,
            },
            body: JSON.stringify({ domain: cleanDomain, pendingId }),
        });
    } catch (err) {
        console.error("[pre-consent-scan-public] scan dispatch failed:", err.message);
    }
}
