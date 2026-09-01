/**
 * Shared scheduled-report logic — used by analytics-scheduled-reports.js
 * (manual "send test" trigger) and cron-analytics-scheduled-reports.js
 * (automatic weekly/monthly send).
 *
 * Exported: buildReportData(db, siteId, periodDays)
 *           buildReportEmailHtml({ domain, frequency, label, data })
 *           sendReportEmail({ recipients, subject, html })
 */

function pctChange(cur, prev) {
    if (prev == null || prev === 0 || cur == null) return null;
    return ((cur - prev) / prev) * 100;
}

// ── Report data ───────────────────────────────────────────────────────────────

export async function buildReportData(db, siteId, periodDays) {
    const now = new Date();
    const toDateExclusive   = now.toISOString().slice(0, 10);
    const fromDate          = new Date(now - periodDays * 86400000).toISOString().slice(0, 10);
    const prevToExclusive   = fromDate;
    const prevFrom          = new Date(now - periodDays * 2 * 86400000).toISOString().slice(0, 10);

    const totalsQuery = (from, to) => db.query(`
        SELECT
            COUNT(*)                                                          AS total,
            COUNT(*) FILTER (WHERE consent_level = 'full')                    AS full_count,
            COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)  AS unique_sessions
        FROM analytics_events
        WHERE site_id = $1 AND received_at >= $2 AND received_at < $3`,
        [siteId, from, to]
    ).catch(() => ({ rows: [] }));

    const engagedQuery = (from, to) => db.query(`
        WITH session_stats AS (
            SELECT session_id, MAX(duration_sec) AS max_duration, COUNT(*) AS pageviews
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND session_id IS NOT NULL
            GROUP BY session_id
        )
        SELECT COUNT(*) AS engaged
        FROM session_stats s
        WHERE s.max_duration >= 10
           OR s.pageviews > 1
           OR EXISTS (
                SELECT 1 FROM analytics_clicks c
                WHERE c.site_id = $1 AND c.session_id = s.session_id
                  AND c.received_at >= $2 AND c.received_at < $3
           )`,
        [siteId, from, to]
    ).catch(() => ({ rows: [] }));

    const conversionsTotalQuery = (from, to) => db.query(`
        SELECT COUNT(*) AS total FROM analytics_custom_events
        WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
          AND name IN (SELECT name FROM analytics_event_defs WHERE site_id = $1)`,
        [siteId, from, to]
    ).catch(() => ({ rows: [] }));

    const [
        totalsRes, prevTotalsRes, engagedRes, prevEngagedRes,
        pagesRes, countriesRes, referrersRes, conversionsRes, revenueRes,
        conversionsTotalRes, prevConversionsTotalRes,
    ] = await Promise.all([
        totalsQuery(fromDate, toDateExclusive),
        totalsQuery(prevFrom, prevToExclusive),
        engagedQuery(fromDate, toDateExclusive),
        engagedQuery(prevFrom, prevToExclusive),

        db.query(`
            SELECT pathname, COUNT(*) AS views
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND pathname !~* '^/api/'
              AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            GROUP BY pathname ORDER BY views DESC LIMIT 5`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 5`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT COALESCE(referrer_host, '(direct)') AS referrer, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
            GROUP BY referrer ORDER BY events DESC LIMIT 5`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT name, COUNT(*) AS count
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND name IN (SELECT name FROM analytics_event_defs WHERE site_id = $1)
            GROUP BY name ORDER BY count DESC LIMIT 1`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT COALESCE(SUM(value_cents), 0) AS total_cents,
                   COUNT(*)                       AS transactions,
                   (ARRAY_AGG(currency) FILTER (WHERE currency IS NOT NULL))[1] AS currency
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND value_cents IS NOT NULL
              AND (name = 'purchase' OR name IN (
                    SELECT name FROM analytics_event_defs WHERE site_id = $1 AND kind = 'purchase'
              ))`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Total conversion events, computed separately from the "top named event"
        // query above (which caps at 1 row) so the summary count isn't limited by it.
        conversionsTotalQuery(fromDate, toDateExclusive),
        conversionsTotalQuery(prevFrom, prevToExclusive),
    ]);

    const t     = totalsRes.rows[0] || {};
    const prevT = prevTotalsRes.rows[0] || {};
    const total     = Number(t.total || 0);
    const prevTotal = Number(prevT.total || 0);
    const consentRate     = total > 0     ? (Number(t.full_count     || 0) / total)     * 100 : 0;
    const prevConsentRate = prevTotal > 0 ? (Number(prevT.full_count || 0) / prevTotal) * 100 : 0;

    const conversionsTotal     = Number(conversionsTotalRes.rows[0]?.total || 0);
    const prevConversionsTotal = Number(prevConversionsTotalRes.rows[0]?.total || 0);
    const revenueCents = Number(revenueRes.rows[0]?.total_cents || 0);

    return {
        periodDays,
        from: fromDate,
        to: new Date(now - 86400000).toISOString().slice(0, 10),
        totals: {
            events:        total,
            sessions:      Number(t.unique_sessions || 0),
            engagedUsers:  Number(engagedRes.rows[0]?.engaged || 0),
            consentRate,
            conversions:   conversionsTotal,
        },
        trends: {
            events:       pctChange(total, prevTotal),
            sessions:     pctChange(Number(t.unique_sessions || 0), Number(prevT.unique_sessions || 0)),
            engagedUsers: pctChange(Number(engagedRes.rows[0]?.engaged || 0), Number(prevEngagedRes.rows[0]?.engaged || 0)),
            consentRate:  consentRate - prevConsentRate, // percentage-point delta, not a ratio
            conversions:  pctChange(conversionsTotal, prevConversionsTotal),
        },
        topPages:     pagesRes.rows.map(r => ({ pathname: r.pathname, views: Number(r.views || 0) })),
        topCountries: countriesRes.rows.map(r => ({ code: r.country_code, events: Number(r.events || 0) })),
        topReferrers: referrersRes.rows.map(r => ({ referrer: r.referrer, events: Number(r.events || 0) })),
        topConversion: conversionsRes.rows[0]
            ? { name: conversionsRes.rows[0].name, count: Number(conversionsRes.rows[0].count || 0) }
            : null,
        revenue: revenueCents > 0
            ? { total: revenueCents / 100, currency: revenueRes.rows[0]?.currency || null, transactions: Number(revenueRes.rows[0]?.transactions || 0) }
            : null,
    };
}

// ── Email ─────────────────────────────────────────────────────────────────────

function fmtPct(n, decimals = 1) {
    return typeof n === "number" && Number.isFinite(n) ? n.toFixed(decimals) + "%" : "—";
}

function fmtTrend(pct) {
    if (pct == null || !Number.isFinite(pct)) return "";
    const sign  = pct > 0 ? "+" : "";
    const color = pct > 0 ? "#4ade80" : pct < 0 ? "#ef4444" : "#a0aec0";
    return `<span style="color:${color};font-size:12px;font-weight:600">${sign}${pct.toFixed(1)}%</span>`;
}

function kpiCell(label, value, trend) {
    return `<td style="padding:12px 16px;vertical-align:top">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#7c8299">${label}</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#e8ecf8">${value}</p>
        <p style="margin:4px 0 0">${fmtTrend(trend)}</p>
    </td>`;
}

function miniTable(title, rows, keyLabel, valueFmt) {
    if (!rows.length) return "";
    const body = rows.map(r => `
        <tr>
            <td style="padding:6px 0;font-size:13px;color:#c8cfe0;border-top:1px solid #262a38">${r[keyLabel]}</td>
            <td style="padding:6px 0;font-size:13px;color:#a0aec0;text-align:right;border-top:1px solid #262a38">${valueFmt(r)}</td>
        </tr>`).join("");
    return `
    <div style="margin-top:20px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#7c8299">${title}</p>
        <table style="width:100%;border-collapse:collapse">${body}</table>
    </div>`;
}

export function buildReportEmailHtml({ domain, frequency, label, data }) {
    const periodLabel = frequency === "monthly" ? "Last 30 days" : "Last 7 days";
    const title = label || `${frequency === "monthly" ? "Monthly" : "Weekly"} performance report`;

    const revenueCell = data.revenue
        ? kpiCell("Revenue", (data.revenue.currency === "USD" ? "$" : data.revenue.currency === "GBP" ? "£" : "€") + data.revenue.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        : "";

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:12px;overflow:hidden">
      <div style="padding:14px 20px;background:#161921;border-bottom:1px solid #2a2d3a">
        <img src="https://www.intastellar-consents.com/assets/icons/intastellar-logo-black.svg"
             alt="Intastellar Consents"
             height="22"
             style="display:block;filter:brightness(0) invert(1);max-width:220px" />
      </div>
      <div style="padding:4px 20px;background:#c09f5322;border-bottom:2px solid #c09f53">
        <p style="margin:8px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#c09f53">
          ${domain} · ${periodLabel}
        </p>
      </div>
      <div style="padding:20px">
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#e8ecf8;line-height:1.3">${title}</h2>
        <p style="margin:0 0 12px;font-size:12px;color:#606880">${data.from} — ${data.to}</p>

        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <tr>
            ${kpiCell("Active users", data.totals.engagedUsers.toLocaleString("en-US"), data.trends.engagedUsers)}
            ${kpiCell("Sessions", data.totals.sessions.toLocaleString("en-US"), data.trends.sessions)}
          </tr>
          <tr>
            ${kpiCell("Consent rate", fmtPct(data.totals.consentRate), data.trends.consentRate)}
            ${kpiCell("Conversions", data.totals.conversions.toLocaleString("en-US"), data.trends.conversions)}
          </tr>
          ${revenueCell ? `<tr>${revenueCell}<td></td></tr>` : ""}
        </table>

        ${data.topConversion ? `<p style="margin:16px 0 0;font-size:12px;color:#7c8299">Top conversion: <strong style="color:#c8cfe0">${data.topConversion.name}</strong> (${data.topConversion.count.toLocaleString("en-US")})</p>` : ""}

        ${miniTable("Top pages", data.topPages, "pathname", r => r.views.toLocaleString("en-US"))}
        ${miniTable("Top countries", data.topCountries, "code", r => r.events.toLocaleString("en-US"))}
        ${miniTable("Top traffic sources", data.topReferrers, "referrer", r => r.events.toLocaleString("en-US"))}
      </div>
      <div style="padding:16px 20px;border-top:1px solid #2a2d3a;background:#161921">
        <a href="https://www.intastellarconsents.com" style="font-size:13px;color:#c09f53;text-decoration:none">Open Analytics Dashboard →</a>
        <p style="margin:8px 0 0;font-size:11px;color:#4a5068">Manage scheduled reports in Analytics → Scheduled Reports.</p>
      </div>
    </div>
  </div>
</body></html>`;
}

export async function sendReportEmail({ recipients, subject, html }) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, reason: "RESEND_API_KEY not configured" };
    if (!recipients?.length) return { ok: false, reason: "no recipients" };
    const from = process.env.RESEND_FROM || "alerts@intastellar.com";
    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: recipients, subject, html }),
        });
        if (resp.ok) return { ok: true };
        const body = await resp.json().catch(() => ({}));
        console.error("[scheduled-report] Resend error:", resp.status, JSON.stringify(body));
        return { ok: false, reason: body?.message || body?.name || `Resend ${resp.status}` };
    } catch (err) {
        console.error("[scheduled-report] email error:", err.message);
        return { ok: false, reason: err.message };
    }
}
