/**
 * POST /api/pre-consent-scan
 *
 * Triggers a pre-consent scan for a domain. Called directly by the frontend.
 * Validates the Intastellar Bearer JWT (iss/nbf/exp checks, same as PHP).
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 *
 * Body: { domain, workspaceId? }
 *
 * Env vars (set in Vercel project settings):
 *   POSTGRES_URL  — Neon connection string (EU Frankfurt)
 */

import pkg from "pg";
const { Pool } = pkg;
import { scanDomain } from "./_scan-core.js";

// ── DB pool (reused across warm invocations) ──────────────────────────────────
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

// ── JWT validation (mirrors PHP — checks claims only, no signature) ────────────
function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
        return payload;
    } catch {
        return null;
    }
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || "0", 10);
    if (!organisationId) {
        return res.status(400).json({ error: "Missing Organisation header" });
    }

    const { domain, workspaceId } = req.body || {};
    if (!domain || typeof domain !== "string") {
        return res.status(400).json({ error: "domain is required" });
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    const { transfers, cookies, durationMs, error } = await scanDomain(cleanDomain);

    const status    = error ? "failed" : "completed";
    const scannedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
        await getPool().query(
            `INSERT INTO pre_consent_scans
                (domain, organisation_id, workspace_id, scanned_at, scan_duration_ms, status, transfers, cookies, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [cleanDomain, organisationId, workspaceId || null, scannedAt, durationMs, status, JSON.stringify(transfers), JSON.stringify(cookies), error || null]
        );
    } catch (dbErr) {
        console.error("[pre-consent-scan] DB write failed:", dbErr.message);
    }

    res.json({
        domain:                cleanDomain,
        scanned_at:            scannedAt,
        scan_duration_ms:      durationMs,
        status,
        pre_consent_transfers: transfers,
        pre_consent_cookies:   cookies,
        ...(error ? { error } : {}),
    });
}
