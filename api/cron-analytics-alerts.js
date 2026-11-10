import { emailLayout, emailEsc, emailP, INTASTELLAR_LOGO_ATTACHMENT } from "./_email-layout.js";
import { getPool } from "./_db.js";
/**
 * Cron: /api/cron-analytics-alerts  (runs daily at 07:00 UTC per vercel.json)
 *
 * For each enabled alert config, computes the metric for the configured
 * look-back period and fires a notification if the threshold is breached.
 * Skips configs that already fired within the last 23 hours to avoid
 * hammering users with repeated alerts.
 *
 * Notification channels:
 *   - Email: via Resend (RESEND_API_KEY env var)
 *   - Push:  via Web Push (VAPID keys env vars) — same infra as ad-alerts
 *
 * The consent platform's DB lives on a different server and is not queried
 * here; all metrics are computed from analytics_events (same DB as analytics).
 */
// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to) return;
    await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: process.env.RESEND_FROM || "alerts@intastellarconsents.com",
            to, subject, html, attachments: [INTASTELLAR_LOGO_ATTACHMENT],
        }),
    }).catch(e => console.error("[cron-analytics-alerts] email error:", e.message));
}

function buildEmailHtml({ domain, metric, label, value, threshold, period_days }) {
    const fmt = (n, decimals = 1) => typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: decimals }) : "—";
    const metricLabel = {
        traffic_drop:       "Traffic drop",
        consent_rate_below: "Consent rate",
        zero_conversions:   "Conversions",
        conversion_drop:    "Conversion drop",
        engaged_drop:       "Engaged user drop",
    }[metric] || metric;

    const suffix = metric.includes("rate") || metric.includes("drop") ? "%" : "";
    const strong = (text) => `<strong style="color:#1c1c1c">${emailEsc(text)}</strong>`;
    return emailLayout({
        badge: { text: `Alert · ${emailEsc(domain)}`, tone: "critical" },
        heading: `${label || metricLabel} threshold breached`,
        body: emailP(`${emailEsc(metricLabel)} for ${strong(domain)} is ${strong(`${fmt(value)}${suffix}`)}, which crossed the alert threshold of ${strong(`${fmt(threshold)}${suffix}`)} over the past ${strong(`${period_days} day${period_days !== 1 ? "s" : ""}`)}.`),
        cta: { label: "Open Analytics Dashboard", href: "https://www.intastellarconsents.com" },
        note: "Manage alerts in the Analytics dashboard.",
    });
}

// ── Metric computation ────────────────────────────────────────────────────────

export async function computeMetric(db, siteId, metric, periodDays) {
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now - periodDays * 86400000).toISOString().slice(0, 10);
    const prevStart   = new Date(now - periodDays * 2 * 86400000).toISOString().slice(0, 10);

    switch (metric) {
        case "traffic_drop": {
            const [cur, prev] = await Promise.all([
                db.query(`SELECT COUNT(DISTINCT session_id) AS n FROM analytics_events WHERE site_id=$1 AND consent_level='full' AND received_at>=$2 AND received_at<$3`, [siteId, periodStart, periodEnd]),
                db.query(`SELECT COUNT(DISTINCT session_id) AS n FROM analytics_events WHERE site_id=$1 AND consent_level='full' AND received_at>=$2 AND received_at<$3`, [siteId, prevStart, periodStart]),
            ]);
            const curN  = Number(cur.rows[0]?.n || 0);
            const prevN = Number(prev.rows[0]?.n || 0);
            if (prevN === 0) return null;
            return ((prevN - curN) / prevN) * 100; // positive = drop %
        }
        case "consent_rate_below": {
            const { rows } = await db.query(
                `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE consent_level='full') AS full_count
                 FROM analytics_events WHERE site_id=$1 AND received_at>=$2 AND received_at<$3`,
                [siteId, periodStart, periodEnd]
            );
            const total = Number(rows[0]?.total || 0);
            if (total === 0) return null;
            return (Number(rows[0]?.full_count || 0) / total) * 100;
        }
        case "zero_conversions": {
            const { rows } = await db.query(
                `SELECT COUNT(*) AS n FROM analytics_custom_events WHERE site_id=$1 AND received_at>=$2 AND received_at<$3`,
                [siteId, periodStart, periodEnd]
            );
            return Number(rows[0]?.n || 0);
        }
        case "conversion_drop": {
            const [cur, prev] = await Promise.all([
                db.query(`SELECT COUNT(*) AS n FROM analytics_custom_events WHERE site_id=$1 AND received_at>=$2 AND received_at<$3`, [siteId, periodStart, periodEnd]),
                db.query(`SELECT COUNT(*) AS n FROM analytics_custom_events WHERE site_id=$1 AND received_at>=$2 AND received_at<$3`, [siteId, prevStart, periodStart]),
            ]);
            const curN  = Number(cur.rows[0]?.n || 0);
            const prevN = Number(prev.rows[0]?.n || 0);
            if (prevN === 0) return null;
            return ((prevN - curN) / prevN) * 100;
        }
        case "engaged_drop": {
            const engagedQuery = `
                WITH ss AS (
                    SELECT session_id, MAX(duration_sec) AS d, COUNT(*) AS pv
                    FROM analytics_events
                    WHERE site_id=$1 AND consent_level='full' AND session_id IS NOT NULL
                      AND received_at>=$2 AND received_at<$3
                    GROUP BY session_id
                )
                SELECT COUNT(*) AS n FROM ss WHERE d>=10 OR pv>1`;
            const [cur, prev] = await Promise.all([
                db.query(engagedQuery, [siteId, periodStart, periodEnd]),
                db.query(engagedQuery, [siteId, prevStart, periodStart]),
            ]);
            const curN  = Number(cur.rows[0]?.n || 0);
            const prevN = Number(prev.rows[0]?.n || 0);
            if (prevN === 0) return null;
            return ((prevN - curN) / prevN) * 100;
        }
        default:
            return null;
    }
}

export function isBreached(metric, operator, value, threshold) {
    if (value === null || value === undefined) return false;
    // For "zero_conversions" with operator "lt": fire when count < threshold (e.g. < 1)
    // For "traffic_drop" with operator "gt": fire when drop% > threshold (e.g. > 30)
    // For "consent_rate_below" with operator "lt": fire when rate < threshold (e.g. < 50)
    return operator === "lt" ? value < threshold : value > threshold;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

    const db = getPool();

    // Fetch all enabled configs. Previously joined a `users` table that
    // doesn't exist in this database at all (user/org identity for this
    // platform lives in a separate system — see docs/analytics-audit-plan.md
    // item 8) — that join errored on every single run, and the error was
    // silently swallowed by the .catch() below, so `configs` was always []
    // and no alert had ever been evaluated, let alone fired, in the 7+ weeks
    // since this cron was added. Recipients are now stored directly on the
    // config (see api/analytics-alert-configs.js, same convention as
    // analytics_scheduled_reports.recipients) instead of resolved via a join
    // that was never going to work. The catch here now logs instead of
    // silently swallowing, so a future schema drift is visible within a day.
    const { rows: configs } = await db.query(`
        SELECT aac.*, aos.domain
        FROM analytics_alert_configs aac
        JOIN analytics_sites aos ON aos.id = aac.site_id
        WHERE aac.enabled = true
        ORDER BY aac.id
    `).catch(e => {
        console.error("[cron-analytics-alerts] config fetch failed — no alerts will be evaluated this run:", e.message);
        return { rows: [] };
    });

    let fired = 0;

    for (const cfg of configs) {
        // Skip if fired within last 23 hours to avoid duplicate alerts per cron run
        const { rows: recent } = await db.query(
            `SELECT 1 FROM analytics_alert_history
             WHERE config_id = $1 AND triggered_at > NOW() - INTERVAL '23 hours' LIMIT 1`,
            [cfg.id]
        ).catch(() => ({ rows: [] }));
        if (recent.length) continue;

        const value = await computeMetric(db, cfg.site_id, cfg.metric, cfg.period_days).catch(() => null);
        if (!isBreached(cfg.metric, cfg.operator, value, Number(cfg.threshold))) continue;

        const message = `${cfg.metric} value=${value?.toFixed(2)} threshold=${cfg.threshold}`;

        // Record in history
        await db.query(
            `INSERT INTO analytics_alert_history (config_id, metric_value, message) VALUES ($1,$2,$3)`,
            [cfg.id, value, message]
        ).catch(() => {});

        // Notify via email — recipients is a JSON array of addresses stored
        // directly on the config (see note above the config-fetch query).
        const recipients = Array.isArray(cfg.recipients) ? cfg.recipients : [];
        if (cfg.notify_email && recipients.length) {
            await sendEmail({
                to: recipients,
                subject: `[Alert] ${cfg.label || cfg.metric} — ${cfg.domain}`,
                html: buildEmailHtml({
                    domain: cfg.domain,
                    metric: cfg.metric,
                    label: cfg.label,
                    value,
                    threshold: Number(cfg.threshold),
                    period_days: cfg.period_days,
                }),
            });
        }

        fired++;
    }

    return res.status(200).json({ checked: configs.length, fired });
}
