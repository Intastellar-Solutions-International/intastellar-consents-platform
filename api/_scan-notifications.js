/**
 * In-app notifications derived from cookie scans. Every type is on by default;
 * an organisation can turn one off (notification_preferences).
 *
 * Each notification carries a dedupe_key, so the same finding on the same scan
 * is only ever raised once however often this runs.
 */

import { reclassifyStoredTransfer } from "./_scan-core.js";
import { summarizeConsentPhase } from "./_consent-phase.js";
import { summarizeScan } from "./_report-html.js";
import { normalizeBannerDomain } from "./_banner-domain.js";

export const NOTIFICATION_TYPES = [
    { id: "trackers_before_consent", label: "Trackers before consent", description: "A new advertising or analytics vendor loads before visitors have consented." },
    { id: "vendors_after_reject", label: "Trackers after reject", description: "Advertising or analytics still load after a visitor rejects." },
    { id: "second_consent_banner", label: "Second consent banner", description: "Another consent tool is loading alongside yours." },
    { id: "scan_out_of_date", label: "Out-of-date scan", description: "A domain has not been scanned for two weeks." },
    { id: "scan_failed", label: "Failed scan", description: "The latest scan of a domain could not finish." },
];

const STALE_DAYS = 14;
const MAX_DOMAINS = 500;
const MAX_NEW_PER_SYNC = 25;
const SYNC_INTERVAL_MINUTES = 15;
const TRACKING_CATEGORIES = ["advertising", "fingerprinting", "social", "analytics"];
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

const listOf = (names) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));
const vendorCount = (n) => `${n} advertising or analytics vendor${n === 1 ? "" : "s"}`;

function summarize(row, now) {
    const transfers = (row.transfers || []).map(reclassifyStoredTransfer);
    const cookies = row.cookies || [];
    return summarizeScan({
        scanned_at: row.scanned_at,
        pre_consent_transfers: transfers,
        pre_consent_cookies: cookies,
        reject_pass: row.reject_pass || null,
        ...summarizeConsentPhase(transfers, cookies),
    }, now);
}

const trackersOf = (scan) => [...new Set([...scan.trackers, ...scan.analytics])];

/** latest and previous are completed scan rows, failed the newest failed one. */
export function buildScanNotifications({ domain, latest, previous = null, failed = null }, now = Date.now()) {
    const out = [];
    const add = (rule_type, severity, title, body, dedupe_key, scan_id) => out.push({ domain, rule_type, severity, title, body, dedupe_key, scan_id: scan_id ?? null });

    if (failed && (!latest || new Date(failed.scanned_at) > new Date(latest.scanned_at))) {
        add("scan_failed", "warning", "A cookie scan failed", `The latest scan of ${domain} could not finish, so its results may be out of date.`, `failed:${failed.id}`);
    }
    if (!latest) return out;

    const scan = summarize(latest, now);
    if (scan.phaseKnown) {
        const known = previous ? new Set(trackersOf(summarize(previous, now))) : new Set();
        const fresh = trackersOf(scan).filter((v) => !known.has(v));
        if (fresh.length) add("trackers_before_consent", "critical", `${vendorCount(fresh.length)} loading before consent`, listOf(fresh), `trackers:${latest.id}`, latest.id);
    }
    const pass = scan.rejectPass;
    if (pass?.available) {
        const after = [...new Set((pass.transfers || []).filter((t) => TRACKING_CATEGORIES.includes(t.category)).map((t) => t.service))];
        if (after.length) add("vendors_after_reject", "critical", `${vendorCount(after.length)} still load after reject`, listOf(after), `reject:${latest.id}`, latest.id);
    }
    if (scan.otherCmps.length) {
        add("second_consent_banner", "warning", "A second consent banner is loading", listOf(scan.otherCmps), `cmp:${domain}:${[...scan.otherCmps].sort().join("|")}`, latest.id);
    }
    if (scan.ageDays >= STALE_DAYS) {
        add("scan_out_of_date", "info", "Cookie scan is out of date", `Last scanned ${scan.ageDays} days ago.`, `stale:${latest.id}`, latest.id);
    }
    return out;
}

/** Most serious first, without the types this organisation has turned off. */
export function selectNotifications(items, disabled = new Set(), limit = MAX_NEW_PER_SYNC) {
    return items
        .filter((n) => !disabled.has(n.rule_type))
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .slice(0, limit);
}

export async function ensureScanNotificationSchema(db) {
    await db.query(`ALTER TABLE ad_notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT`);
    await db.query(`ALTER TABLE ad_notifications ADD COLUMN IF NOT EXISTS scan_id TEXT`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS ad_notifications_dedupe_idx ON ad_notifications(organisation_id, dedupe_key) WHERE dedupe_key IS NOT NULL`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
            organisation_id INTEGER NOT NULL,
            type            TEXT NOT NULL,
            enabled         BOOLEAN NOT NULL,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organisation_id, type)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS notification_sync (
            organisation_id INTEGER PRIMARY KEY,
            synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

export async function getNotificationPreferences(db, orgId) {
    const { rows } = await db.query(`SELECT type, enabled FROM notification_preferences WHERE organisation_id = $1`, [orgId]);
    const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.type));
    return NOTIFICATION_TYPES.map((t) => ({ ...t, enabled: !off.has(t.id) }));
}

export async function setNotificationPreference(db, orgId, type, enabled) {
    if (!NOTIFICATION_TYPES.some((t) => t.id === type)) return false;
    await db.query(
        `INSERT INTO notification_preferences (organisation_id, type, enabled) VALUES ($1, $2, $3)
         ON CONFLICT (organisation_id, type) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
        [orgId, type, Boolean(enabled)]
    );
    return true;
}

/** Group rows from the sync query by domain into what buildScanNotifications needs. */
export function groupScans(rows) {
    const byDomain = new Map();
    for (const row of rows) {
        const domain = normalizeBannerDomain(row.domain);
        const entry = byDomain.get(domain) || { domain, completed: [], failed: null };
        if (row.status === "completed") entry.completed.push(row);
        else if (!entry.failed || new Date(row.scanned_at) > new Date(entry.failed.scanned_at)) entry.failed = row;
        byDomain.set(domain, entry);
    }
    return [...byDomain.values()].map((e) => {
        const [latest = null, previous = null] = e.completed.sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at));
        return { domain: e.domain, latest, previous, failed: e.failed };
    });
}

/** Raises anything new for these domains, at most once per SYNC_INTERVAL_MINUTES. */
export async function syncScanNotifications(db, orgId, rawDomains, now = Date.now()) {
    const clean = [...new Set((Array.isArray(rawDomains) ? rawDomains : []).map(normalizeBannerDomain).filter(Boolean))].slice(0, MAX_DOMAINS);
    if (!clean.length) return 0;
    const { rows: due } = await db.query(
        `INSERT INTO notification_sync (organisation_id) VALUES ($1)
         ON CONFLICT (organisation_id) DO UPDATE SET synced_at = NOW()
         WHERE notification_sync.synced_at < NOW() - INTERVAL '${SYNC_INTERVAL_MINUTES} minutes'
         RETURNING organisation_id`,
        [orgId]
    );
    if (!due.length) return 0;

    const { rows } = await db.query(
        `SELECT id, domain, scanned_at, status, transfers, cookies, reject_pass FROM (
            SELECT id, domain, scanned_at, status, transfers, cookies, to_jsonb(s) -> 'reject_pass' AS reject_pass,
                   ROW_NUMBER() OVER (PARTITION BY regexp_replace(domain, '^www\\.', ''), status ORDER BY scanned_at DESC) AS rn
              FROM pre_consent_scans s
             WHERE domain = ANY($1) AND (organisation_id = $2 OR organisation_id IS NULL) AND status IN ('completed', 'failed')
         ) ranked WHERE rn <= 2`,
        [clean.flatMap((d) => [d, `www.${d}`]), orgId]
    );
    const prefs = await getNotificationPreferences(db, orgId);
    const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => p.id));
    const candidates = groupScans(rows).flatMap((entry) => buildScanNotifications(entry, now));
    const selected = selectNotifications(candidates, disabled, candidates.length);
    let inserted = 0;
    for (const n of selected) {
        if (inserted >= MAX_NEW_PER_SYNC) break;
        const { rowCount } = await db.query(
            `INSERT INTO ad_notifications (organisation_id, domain, rule_type, severity, title, body, dedupe_key, scan_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (organisation_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
            [orgId, n.domain, n.rule_type, n.severity, n.title, n.body, n.dedupe_key, n.scan_id == null ? null : String(n.scan_id)]
        );
        inserted += rowCount;
    }
    return inserted;
}
