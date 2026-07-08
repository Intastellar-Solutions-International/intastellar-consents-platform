/**
 * GET /api/cron-scan-domains
 *
 * Vercel cron handler — schedule configured in vercel.json (default: daily 03:00 UTC).
 *
 * 1. Fetches all customer domains from the CMP API (DOMAINS_API_URL).
 * 2. Queries the DB to skip domains scanned within SCAN_FRESHNESS_DAYS (default 7).
 * 3. Fans out one POST to /api/scan-domain-task per stale domain.
 *    Each task runs as an independent serverless invocation with its own 60 s timeout,
 *    so all scans execute in parallel regardless of domain count.
 * 4. Returns a JSON summary (visible in Vercel cron logs).
 *
 * Required env vars (Vercel project settings):
 *   CRON_SECRET        — Set in Vercel; automatically sent in Authorization header
 *   DOMAINS_API_KEY    — Service JWT for the CMP getDomains API (see below)
 *   POSTGRES_URL       — Already set
 *
 * The DOMAINS_API_KEY must be a service JWT with:
 *   { "iss": "Intastellar Cron", "sub": "cron_scan_domains", "exp": 9999999999 }
 * The getDomains API validates iss + sub and treats exp 9999999999 as non-expiring.
 *
 * Optional env vars:
 *   DOMAINS_API_URL    — Override the CMP domains endpoint (default set below)
 *   SCAN_FRESHNESS_DAYS — Days before a domain is considered stale (default: 7)
 *   SCAN_CONCURRENCY   — Max parallel scan tasks per cron run (default: 10)
 *   BASE_URL           — Override base URL for internal task calls
 *                        (defaults to https://$VERCEL_PROJECT_PRODUCTION_URL)
 */

import pkg from "pg";
const { Pool } = pkg;

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 5,
        });
    }
    return pool;
}

const FRESHNESS_DAYS = parseInt(process.env.SCAN_FRESHNESS_DAYS || "7", 10);
const CONCURRENCY    = parseInt(process.env.SCAN_CONCURRENCY    || "10", 10);

export default async function handler(req, res) {
    // Vercel sends "Authorization: Bearer <CRON_SECRET>" for scheduled invocations.
    // Manual test calls must include the same header.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.warn("[cron-scan-domains] CRON_SECRET is not set — endpoint is unprotected");
    } else if (req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // ── 1. Fetch all domains from the CMP API ────────────────────────────────
    const apiUrl = process.env.DOMAINS_API_URL
        || "https://apis.intastellarsolutions.com/analytics/gdpr/getDomains";

    let rawList;
    try {
        const headers = { "Content-Type": "application/json" };
        if (process.env.DOMAINS_API_KEY) headers["Authorization"] = `Bearer ${process.env.DOMAINS_API_KEY}`;

        const apiRes = await fetch(apiUrl, { headers });
        if (!apiRes.ok) throw new Error(`CMP API responded ${apiRes.status} ${apiRes.statusText}`);
        rawList = await apiRes.json();
    } catch (err) {
        console.error("[cron-scan-domains] CMP API error:", err.message);
        return res.status(502).json({ error: "Failed to fetch domains: " + err.message });
    }

    // Normalise to [{ domain, companyName }]
    const source = Array.isArray(rawList) ? rawList : (rawList?.domains ?? rawList?.data ?? []);
    const allEntries = source
        .map(item => ({
            domain: ((typeof item === "string" ? item : item?.domain) || "")
                .trim().toLowerCase()
                .replace(/^https?:\/\//, "").split("/")[0],
            companyName: item?.companyName || "",
        }))
        .filter(e => e.domain);

    if (!allEntries.length) {
        return res.status(200).json({ dispatched: 0, message: "No domains returned by CMP API" });
    }

    // ── 2. Filter out recently-scanned domains ────────────────────────────────
    const db = getPool();
    const { rows: fresh } = await db.query(
        `SELECT DISTINCT domain
           FROM pre_consent_scans
          WHERE domain = ANY($1)
            AND status  = 'completed'
            AND scanned_at > NOW() - INTERVAL '${FRESHNESS_DAYS} days'`,
        [allEntries.map(e => e.domain)]
    );
    const freshSet  = new Set(fresh.map(r => r.domain));
    const toScan    = allEntries.filter(e => !freshSet.has(e.domain));

    if (!toScan.length) {
        return res.status(200).json({
            total:     allEntries.length,
            skipped:   freshSet.size,
            dispatched: 0,
            message:   `All ${allEntries.length} domains were scanned within the last ${FRESHNESS_DAYS} days`,
        });
    }

    // ── 3. Fan out — one task invocation per stale domain ────────────────────
    const baseUrl = process.env.BASE_URL
        || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`;

    async function dispatchOne({ domain, companyName }) {
        const r = await fetch(`${baseUrl}/api/scan-domain-task`, {
            method:  "POST",
            headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${secret || ""}`,
            },
            body: JSON.stringify({ domain, companyName }),
        });
        return { domain, companyName, workerStatus: r.status, ok: r.ok };
    }

    // Process in CONCURRENCY-sized batches so we don't overwhelm the platform
    const allResults = [];
    for (let i = 0; i < toScan.length; i += CONCURRENCY) {
        const batch = toScan.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(batch.map(dispatchOne));
        allResults.push(...batchResults);
    }

    const summary = allResults.map((r, i) => ({
        domain:       toScan[i].domain,
        companyName:  toScan[i].companyName,
        dispatched:   r.status === "fulfilled" && r.value.ok,
        workerStatus: r.status === "fulfilled" ? r.value.workerStatus : null,
        error:        r.status === "rejected"  ? r.reason?.message    : null,
    }));

    const dispatched = summary.filter(s => s.dispatched).length;
    const failed     = summary.filter(s => !s.dispatched).length;

    console.log(`[cron-scan-domains] total=${allEntries.length} skipped=${freshSet.size} dispatched=${dispatched} failed=${failed}`);

    return res.status(200).json({
        total:      allEntries.length,
        skipped:    freshSet.size,
        dispatched,
        failed,
        freshnessDays: FRESHNESS_DAYS,
        domains:    summary,
    });
}
