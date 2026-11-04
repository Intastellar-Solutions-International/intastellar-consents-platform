import { getPool } from "./_db.js";
import { renderScheduledReport, sendReportEmail } from "./_scheduled-report.js";
import { organisationHasPlan } from "./_stripe.js";
/**
 * Cron: /api/cron-analytics-scheduled-reports  (runs daily at 08:00 UTC per vercel.json)
 *
 * For each enabled scheduled report config whose weekly/monthly cadence
 * matches today (UTC), builds a condensed KPI summary and emails it to the
 * config's recipients. Client (workspace) reports cover all of the client's
 * domains and are skipped while the organisation isn't on Agency Pro.
 *
 * Dedup guard: a weekly config won't re-fire within 6 days of its last send,
 * monthly within 27 days — same style as the 23-hour re-fire guard in
 * cron-analytics-alerts.js, sized for each cadence.
 */
export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

    const db = getPool();

    const { rows: configs } = await db.query(`
        SELECT asr.*
        FROM analytics_scheduled_reports asr
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
        if (cfg.workspace_id && !(await organisationHasPlan(db, cfg.organisation_id, "agency-pro").catch(() => false))) continue;
        const report = await renderScheduledReport(db, cfg).catch(() => null);
        if (!report) continue;

        const result = await sendReportEmail({ recipients: cfg.recipients, ...report });

        if (result.ok) {
            await db.query(
                `UPDATE analytics_scheduled_reports SET last_sent_at = NOW() WHERE id = $1`,
                [cfg.id]
            ).catch(() => {});
            sent++;
        }
    }

    return res.status(200).json({ checked: configs.length, sent });
}
