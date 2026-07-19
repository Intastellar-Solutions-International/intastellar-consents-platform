/**
 * POST /api/pre-consent-scan-public
 *
 * Public scan trigger — no authentication required.
 *
 * Responds 202 immediately, then delegates the actual Puppeteer scan to
 * a regional scan-domain-task function. This keeps Chromium out of this
 * function entirely, so an OOM in the scanner can never prevent the 202
 * response from being delivered to the caller.
 *
 * Body params:
 *   domain    string  required  e.g. "example.com"
 *   location  string  optional  "us" (default) | "eu" | "ap"
 *                               Selects the region the Chromium scanner runs from:
 *                               us = US East (Virginia), eu = EU (Frankfurt), ap = Asia Pacific (Singapore)
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
    tableReady = true;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const RESCAN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SCANNER_BASE = process.env.SCANNER_SELF_URL || "https://www.intastellarconsents.com";

const SCAN_TASK_PATH = {
    us: "/api/scan-domain-task",
    eu: "/api/scan-domain-task-eu",
    ap: "/api/scan-domain-task-ap",
};

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

    const { domain: rawDomain, location: rawLocation } = req.body || {};

    if (!rawDomain || typeof rawDomain !== "string") {
        return res.status(400).json({ error: "domain is required" });
    }

    const cleanDomain = rawDomain.trim().toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0];

    if (!DOMAIN_RE.test(cleanDomain) || cleanDomain.includes("..") || !cleanDomain.includes(".")) {
        return res.status(400).json({ error: "Invalid domain" });
    }

    const location = (typeof rawLocation === "string" && SCAN_TASK_PATH[rawLocation.toLowerCase()])
        ? rawLocation.toLowerCase()
        : "us";

    const db = getPool();

    let rows;
    try {
        await ensureTable(db);
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
                domain:   cleanDomain,
                location,
                status:   "scan_in_progress",
                message:  "A scan is already running for this domain. Try /api/cookie-banner in ~30 seconds.",
            });
        }

        const ageMs = Date.now() - new Date(latest.scanned_at).getTime();
        if (latest.status === "completed" && ageMs < RESCAN_COOLDOWN_MS) {
            return res.status(200).json({
                domain:     cleanDomain,
                location,
                status:     "recent_scan",
                message:    "A recent scan already exists.",
                scanned_at: latest.scanned_at,
            });
        }
    }

    // Respond 202 immediately — scan-domain-task creates its own in_progress row
    res.status(202).json({
        domain:   cleanDomain,
        location,
        status:   "scan_queued",
        message:  `Scan started from ${location.toUpperCase()}. Results will be available at /api/cookie-banner?domain=${cleanDomain} in ~30 seconds.`,
    });

    // Delegate to the regional scan-domain-task (separate Lambda — keeps Chromium out of this process)
    try {
        await fetch(`${SCANNER_BASE}${SCAN_TASK_PATH[location]}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.CRON_SECRET || ""}`,
            },
            body: JSON.stringify({ domain: cleanDomain }),
        });
    } catch (err) {
        console.error("[pre-consent-scan-public] scan dispatch failed:", err.message);
    }
}
