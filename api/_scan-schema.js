/**
 * pre_consent_scans holds two kinds of scan per domain:
 * - accept_all (NULL on older rows): accepts the banner. Feeds the cookie table
 *   and the banner's cookie list, so it runs from the US where most cookies fire.
 * - first_visit: never accepts, as a visitor's first page load. Feeds what loads
 *   before consent, so it runs from the EU, where consent rules apply.
 * Every reader that wants "the scan of this domain" must exclude first_visit.
 */
export const ACCEPT_ALL = "accept_all";
export const FIRST_VISIT = "first_visit";
export const SCAN_TYPE = `COALESCE(scan_type, '${ACCEPT_ALL}')`;
export const NOT_FIRST_VISIT = `${SCAN_TYPE} <> '${FIRST_VISIT}'`;

export const scanRegion = () => process.env.VERCEL_REGION || null;

let columnsReady = null;

/** Adds scan_type and scan_region once; a failed attempt is retried on the next call. */
export function ensureScanColumns(db) {
    columnsReady ??= (async () => {
        const { rows } = await db.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'pre_consent_scans' AND column_name IN ('scan_type', 'scan_region')`
        );
        if (rows.length === 2) return;
        await db.query(`
            ALTER TABLE pre_consent_scans
                ADD COLUMN IF NOT EXISTS scan_type TEXT,
                ADD COLUMN IF NOT EXISTS scan_region TEXT
        `);
    })().catch((err) => { columnsReady = null; throw err; });
    return columnsReady;
}

/**
 * Starts the first-visit scan as its own invocation, so it doesn't share the
 * accept-all scan's time limit. Only waits long enough for the request to leave.
 */
export function dispatchFirstVisitScan(domain) {
    const base = process.env.SCANNER_SELF_URL || process.env.BASE_URL
        || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://www.intastellarconsents.com");
    const sent = fetch(`${base}/api/scan-domain-task-eu`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
        body: JSON.stringify({ domain, scanType: FIRST_VISIT }),
    }).catch((err) => console.error(`[first-visit] dispatch failed for ${domain}:`, err.message));
    return Promise.race([sent, new Promise((resolve) => setTimeout(resolve, 2000))]);
}
