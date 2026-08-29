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
            to, subject, html,
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

    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:540px;margin:0 auto;padding:32px 20px">
  <div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:12px;overflow:hidden">
    <div style="padding:4px 20px;background:#ef444422;border-bottom:2px solid #ef4444">
      <p style="margin:8px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ef4444">
        ALERT · ${domain}
      </p>
    </div>
    <div style="padding:24px 20px">
      <h2 style="margin:0 0 10px;font-size:17px;font-weight:700;color:#e8ecf8">${label || metricLabel} threshold breached</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#a0aec0;line-height:1.6">
        ${metricLabel} for <strong>${domain}</strong> is <strong>${fmt(value)}${metric.includes("rate") || metric.includes("drop") ? "%" : ""}</strong>,
        which crossed the alert threshold of <strong>${fmt(threshold)}${metric.includes("rate") || metric.includes("drop") ? "%" : ""}</strong>
        over the past <strong>${period_days} day${period_days !== 1 ? "s" : ""}</strong>.
      </p>
    </div>
    <div style="padding:14px 20px;border-top:1px solid #2a2d3a">
      <a href="https://www.intastellarconsents.com" style="font-size:13px;color:#c09f53;text-decoration:none">Open Analytics Dashboard →</a>
    </div>
  </div>
</div></body></html>`;
}

// ── Metric computation ────────────────────────────────────────────────────────

async function computeMetric(db, siteId, metric, periodDays) {
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

function isBreached(metric, operator, value, threshold) {
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

    // Fetch all enabled configs plus their owner's org email
    const { rows: configs } = await db.query(`
        SELECT aac.*, aos.domain,
               u.email AS owner_email
        FROM analytics_alert_configs aac
        JOIN analytics_sites aos ON aos.id = aac.site_id
        LEFT JOIN users u ON u.organisation_id = aac.organisation_id
            AND u.role IN ('admin','super-admin','manager')
        WHERE aac.enabled = true
        ORDER BY aac.id
    `).catch(() => ({ rows: [] }));

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

        // Notify via email
        if (cfg.notify_email && cfg.owner_email) {
            await sendEmail({
                to: cfg.owner_email,
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
