/**
 * GET /api/cron-cleanup-events  (invoked by Vercel Cron, daily at 05:30 UTC)
 *
 * Enforces each site's `event_retention_days` (default 14 months, the same
 * as GA4's longer setting) on the visitor-level tables written by api/a.js:
 * pageviews, custom events, bot visits, ad conversion pushes and A/B test
 * assignments. Recordings and heatmap clicks have their own shorter windows
 * in api/cron-cleanup-recordings.js.
 *
 * Rows whose site no longer exists fall back to the default window. Deletes
 * run in batches under a time budget so the first run against an existing
 * backlog can't hit maxDuration; whatever's left is picked up the next day.
 */
import { getPool } from "./_db.js";

export const DEFAULT_EVENT_RETENTION_DAYS = 425;

const BATCH = 20000;
const TIME_BUDGET_MS = 45_000;

// Each entry selects ids of expired rows; `site` is the join to
// analytics_sites that yields the per-site retention window.
const TARGETS = [
    { table: "analytics_events",            ts: "x.received_at", site: "s.id = x.site_id" },
    { table: "analytics_custom_events",     ts: "x.received_at", site: "s.id = x.site_id" },
    { table: "analytics_bot_visits",        ts: "x.received_at", site: "s.id = x.site_id" },
    { table: "analytics_conversion_pushes", ts: "x.created_at",  site: "s.id = x.site_id" },
    {
        table: "ab_test_assignments", ts: "x.assigned_at",
        join:  "JOIN ab_tests t ON t.id = x.test_id",
        site:  "s.organisation_id = t.organisation_id AND LOWER(s.domain) = LOWER(t.domain)",
    },
];

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();
    const started = Date.now();

    await db.query(`
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS event_retention_days SMALLINT NOT NULL DEFAULT ${DEFAULT_EVENT_RETENTION_DAYS}
    `).catch(() => {});

    const deleted = {};
    let complete = true;
    for (const t of TARGETS) {
        deleted[t.table] = 0;
        for (;;) {
            if (Date.now() - started > TIME_BUDGET_MS) { complete = false; break; }
            const { rowCount, failed } = await db.query(
                `DELETE FROM ${t.table} WHERE id IN (
                    SELECT x.id FROM ${t.table} x
                    ${t.join || ""}
                    LEFT JOIN analytics_sites s ON ${t.site}
                    WHERE ${t.ts} < NOW() - make_interval(days => COALESCE(s.event_retention_days, $1))
                    LIMIT ${BATCH}
                )`,
                [DEFAULT_EVENT_RETENTION_DAYS]
            ).catch(err => {
                // Table not created yet on this deployment, or a transient error —
                // skip it this run rather than failing the others.
                console.error(`[cron-cleanup-events] ${t.table}:`, err.message);
                return { rowCount: 0, failed: true };
            });
            deleted[t.table] += rowCount || 0;
            if (failed || rowCount < BATCH) break;
        }
    }

    return res.status(200).json({ ok: true, complete, deleted });
}
