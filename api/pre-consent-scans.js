/**
 * POST /api/pre-consent-scans
 *
 * One page of completed cookie scans across the caller's domains, newest first
 * by default. Uses the same organisation scope as /api/pre-consent-transfers,
 * so it exposes nothing that endpoint doesn't.
 *
 * Headers: Authorization (Bearer), Organisation
 * Body:    { domains: string[], page?, pageSize?, search?, sort?: "scanned_at"|"domain", direction?: "asc"|"desc" }
 */

import { reclassifyStoredTransfer } from "./_scan-core.js";
import { getPool } from "./_db.js";
import { normalizeBannerDomain } from "./_banner-domain.js";
import { summarizeConsentPhase, scanConsentStep } from "./_consent-phase.js";
import { summarizeScan } from "./_report-html.js";

const MAX_DOMAINS = 5000;
const MAX_PAGE_SIZE = 100;
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
const SORT_COLUMNS = { scanned_at: "scanned_at", domain: "domain" };

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return null;
        return payload;
    } catch {
        return null;
    }
}

/** Both forms of each domain: dashboard scans may be stored with "www.". */
export function scanDomainList(domains) {
    const clean = [...new Set((Array.isArray(domains) ? domains : []).map(normalizeBannerDomain).filter(Boolean))];
    return clean.flatMap((d) => [d, `www.${d}`]);
}

export async function listScans(db, { organisationId, domains, page = 0, pageSize = 25, search = "", sort = "scanned_at", direction = "desc" }) {
    const column = SORT_COLUMNS[sort] || SORT_COLUMNS.scanned_at;
    const order = direction === "asc" ? "ASC" : "DESC";
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(pageSize, 10) || 25));
    const offset = Math.max(0, parseInt(page, 10) || 0) * size;
    const term = `%${String(search).trim().toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    const where = `domain = ANY($1) AND (organisation_id = $2 OR organisation_id IS NULL) AND status = 'completed' AND LOWER(domain) LIKE $3`;
    const params = [domains, organisationId, term];
    const [{ rows: counted }, { rows }] = await Promise.all([
        db.query(`SELECT COUNT(*)::int AS total FROM pre_consent_scans WHERE ${where}`, params),
        db.query(
            // Only "Scan now" runs the reject pass, so it is what tells the two apart.
            `SELECT id, domain, scanned_at, transfers, cookies,
                    jsonb_typeof(to_jsonb(pre_consent_scans) -> 'reject_pass') = 'object' AS has_reject_pass
               FROM pre_consent_scans WHERE ${where}
              ORDER BY ${column} ${order}, id DESC LIMIT $4 OFFSET $5`,
            [...params, size, offset]
        ),
    ]);
    return { total: counted[0]?.total ?? 0, scans: rows.map(toListRow) };
}

function toListRow(row) {
    const transfers = (row.transfers || []).map(reclassifyStoredTransfer);
    const cookies = row.cookies || [];
    const scan = summarizeScan({
        scanned_at: row.scanned_at,
        pre_consent_transfers: transfers,
        pre_consent_cookies: cookies,
        ...summarizeConsentPhase(transfers, cookies),
    });
    return {
        id: row.id,
        domain: row.domain,
        scanned_at: row.scanned_at,
        phase_known: scan.phaseKnown,
        transfers: scan.transfers.length,
        cookies: scan.cookies.length,
        cookies_found: cookies.length,
        vendors_found: new Set(transfers.map((t) => t.service || t.host)).size,
        consent_step: scanConsentStep(transfers, cookies),
        source: row.has_reject_pass ? "dashboard" : "automatic",
        trackers: new Set([...scan.trackers, ...scan.analytics]).size,
    };
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    if (!validateJwt(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });
    const organisationId = parseInt(req.headers.organisation || "0", 10);
    if (!organisationId) return res.status(400).json({ error: "Missing Organisation header" });

    const { domains, page, pageSize, search, sort, direction } = req.body || {};
    const list = scanDomainList(domains);
    if (list.length > MAX_DOMAINS * 2) return res.status(400).json({ error: "Too many domains" });
    if (!list.length) return res.json({ total: 0, scans: [] });

    try {
        return res.json(await listScans(getPool(), { organisationId, domains: list, page, pageSize, search, sort, direction }));
    } catch (err) {
        console.error("[pre-consent-scans] DB error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
