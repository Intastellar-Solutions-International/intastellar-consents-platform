import { getPool } from "./_db.js";
import { buildReportData, buildReportEmailHtml, sendReportEmail } from "./_scheduled-report.js";
/**
 * Cron: /api/cron-analytics-scheduled-reports  (runs daily at 08:00 UTC per vercel.json)
 *
 * For each enabled scheduled report config whose weekly/monthly cadence
 * matches today (UTC), builds a condensed KPI summary and emails it to the
 * config's recipients. Dedup guard: a weekly config won't re-fire within 6
 * days of its last send, monthly within 27 days — same style as the
 * 23-hour re-fire guard in cron-analytics-alerts.js, sized for each cadence.
 */
export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

    const db = getPool();

    const { rows: configs } = await db.query(`
        SELECT asr.*, aos.domain
        FROM analytics_scheduled_reports asr
        JOIN analytics_sites aos ON aos.id = asr.site_id
        WHERE asr.enabled = true
          AND (
            (asr.frequency = 'weekly'
                AND asr.day_of_week = EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC')::int
                AND (asr.last_sent_at IS NULL OR asr.last_sent_at < NOW() - INTERVAL '6 days'))
            OR
            (asr.frequency = 'monthly'
                AND asr.day_of_month = EXTRACT(DAY FROM NOW() AT TIME ZONE 'UTC')::int
                AND (asr.last_sent_at IS NULL OR asr.last_sent_at < NOW() - INTERVAL '27 days'))
          )
        ORDER BY asr.id
    `).catch(() => ({ rows: [] }));

    let sent = 0;

    for (const cfg of configs) {
        const periodDays = cfg.frequency === "monthly" ? 30 : 7;
        const data = await buildReportData(db, cfg.site_id, periodDays).catch(() => null);
        if (!data) continue;

        const html = buildReportEmailHtml({ domain: cfg.domain, frequency: cfg.frequency, label: cfg.label, data });
        const ok = await sendReportEmail({
            recipients: cfg.recipients,
            subject: `${cfg.label || "Performance report"} — ${cfg.domain}`,
            html,
        });

        if (ok) {
            await db.query(
                `UPDATE analytics_scheduled_reports SET last_sent_at = NOW() WHERE id = $1`,
                [cfg.id]
            ).catch(() => {});
            sent++;
        }
    }

    return res.status(200).json({ checked: configs.length, sent });
}
