/**
 * Run the ad-platform fetchers locally against a real connection, without
 * deploying. Uses the same code paths as api/ad-data-fetch.js (summary) and
 * api/cron-ad-sync.js (daily).
 *
 *   node --env-file=.env.local --env-file=.env.vercel scripts/ad-fetch-local.mjs \
 *        <platform> <domain> [fromDate] [toDate] [--daily] [--accounts]
 *
 *   --daily     use fetchPlatformDataDaily instead of fetchPlatformData
 *   --accounts  only list the accounts the stored token can see (Microsoft Ads)
 *
 * Without dates it uses the platform's maximum look-back window, like the
 * Settings import. Needs Node 20.6+ (--env-file) and the platform's OAuth /
 * developer-token env vars (`vercel env pull .env.vercel`).
 *
 * Note: this talks to the production database. A token refresh writes the new
 * tokens back to the connection row, exactly as the deployed API would.
 */
import { getPool } from "../api/_db.js";
import {
    tryRefreshToken,
    fetchPlatformData,
    fetchPlatformDataDaily,
    fetchMicrosoftAdsAccounts,
    PLATFORM_MAX_DAYS,
} from "../api/_ad-platform-fetch.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const [platform, domain, fromArg, toArg] = args.filter(a => !a.startsWith("--"));

if (!platform || !domain) {
    console.error("Usage: scripts/ad-fetch-local.mjs <platform> <domain> [fromDate] [toDate] [--daily] [--accounts]");
    process.exit(1);
}

let fromDate = fromArg;
let toDate = toArg;
if (!fromDate || !toDate) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDays = PLATFORM_MAX_DAYS[platform] || 90;
    fromDate = new Date(today.getTime() - maxDays * 86_400_000).toISOString().slice(0, 10);
    toDate   = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
}

const db = getPool();
try {
    const { rows } = await db.query(
        `SELECT * FROM ad_platform_connections WHERE domain=$1 AND platform=$2`,
        [domain, platform]
    );
    if (rows.length === 0) throw new Error(`No ${platform} connection for ${domain}`);
    if (rows.length > 1) console.warn(`${rows.length} connections found (one per organisation) — using the first.`);

    const conn = await tryRefreshToken(db, rows[0]);
    console.log(`connection: org=${conn.organisation_id} account_id=${conn.account_id} login_customer_id=${conn.login_customer_id} currency=${conn.account_currency}`);

    const started = Date.now();
    let result;
    if (flags.has("--accounts")) {
        if (platform !== "microsoft_ads") throw new Error("--accounts is only wired up for microsoft_ads");
        result = await fetchMicrosoftAdsAccounts(conn.access_token);
    } else {
        console.log(`range: ${fromDate} → ${toDate}${flags.has("--daily") ? " (daily)" : ""}`);
        result = flags.has("--daily")
            ? await fetchPlatformDataDaily(conn, fromDate, toDate, db)
            : await fetchPlatformData(conn, fromDate, toDate, db);
    }
    console.dir(result, { depth: 4 });
    console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (err) {
    console.error("FAILED:", err.message);
    process.exitCode = 1;
} finally {
    await db.end?.();
}
