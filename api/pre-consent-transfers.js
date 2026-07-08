/**
 * GET /api/pre-consent-transfers?domain=example.com
 *
 * Returns the most recent pre-consent scan result for a domain.
 * Called by the PHP proxy (pre-consent-transfers.php) via X-Scanner-Token.
 *
 * Headers:
 *   X-Scanner-Token  — must match SCANNER_INTERNAL_TOKEN env var
 *   Organisation     — organisation_id (integer)
 *
 * Query params:
 *   domain  string  required
 *
 * Env vars (set in Vercel project settings):
 *   POSTGRES_URL            — Neon connection string (EU Frankfurt)
 *   SCANNER_INTERNAL_TOKEN  — shared secret with PHP proxy
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

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const expectedToken = process.env.SCANNER_INTERNAL_TOKEN || "";
    if (!expectedToken || req.headers["x-scanner-token"] !== expectedToken) {
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
            `SELECT domain, scanned_at, scan_duration_ms, status, transfers, error_message
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
        res.json({
            domain:                row.domain,
            scanned_at:            row.scanned_at,
            scan_duration_ms:      row.scan_duration_ms,
            status:                row.status,
            pre_consent_transfers: row.transfers || [],
            ...(row.error_message ? { error: row.error_message } : {}),
        });
    } catch (err) {
        console.error("[pre-consent-transfers] DB error:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
}
