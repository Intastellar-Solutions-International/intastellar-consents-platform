import { getPool } from "./_db.js";
import { renderScheduledReport, sendReportEmail } from "./_scheduled-report.js";
import { organisationHasPlan } from "./_stripe.js";
/**
 * GET/POST/PUT/DELETE /api/analytics-scheduled-reports
 *
 * CRUD for scheduled (weekly/monthly) performance report emails. Each
 * config emails a condensed KPI summary to any list of recipient addresses
 * on the configured cadence — see cron-analytics-scheduled-reports.js for
 * the actual send logic.
 *
 * POST with ?id=<id>&test=1 sends an immediate one-off email to the
 * config's current recipients without touching last_sent_at or requiring
 * the schedule to match — used by the "Send test now" button.
 * GET with ?id=<id>&preview=1 returns that email as { html, subject }.
 *
 * Scope: ?domain=<domain> for one site's reports, or ?workspace=<id> for an
 * Agency Pro client report covering a whole client workspace. Workspaces live
 * on the Intastellar API, which the cron can't query, so client reports store
 * the workspace's name and domains (body: workspace_name, domains) and the
 * Scheduled Reports page re-sends them whenever the workspace has changed.
 *
 * Requires Authorization: Bearer <token>   Organisation: <org_id>
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://analytics.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account") return null;
        if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        return payload;
    } catch { return null; }
}

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_scheduled_reports (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            frequency       VARCHAR(10)  NOT NULL,  -- weekly|monthly
            day_of_week     SMALLINT,               -- 0(Sun)-6(Sat), required if weekly
            day_of_month    SMALLINT,               -- 1-28, required if monthly
            recipients      JSONB        NOT NULL DEFAULT '[]',
            label           VARCHAR(120),
            enabled         BOOLEAN      NOT NULL DEFAULT true,
            last_sent_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_asr2_site ON analytics_scheduled_reports (site_id);
    `).catch(() => {});
    await db.query(`
        ALTER TABLE analytics_scheduled_reports ALTER COLUMN site_id DROP NOT NULL;
        ALTER TABLE analytics_scheduled_reports ADD COLUMN IF NOT EXISTS workspace_id   VARCHAR(64);
        ALTER TABLE analytics_scheduled_reports ADD COLUMN IF NOT EXISTS workspace_name VARCHAR(120);
        ALTER TABLE analytics_scheduled_reports ADD COLUMN IF NOT EXISTS domains        JSONB;
        CREATE INDEX IF NOT EXISTS idx_asr2_workspace ON analytics_scheduled_reports (organisation_id, workspace_id);
    `).catch(() => {});
}

const VALID_FREQUENCIES = new Set(["weekly", "monthly"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A client's domains as sent by the page (strings or { domain } objects).
// Stored as given, lowercased; resolveReportSites only ever reports on the
// ones that are this organisation's active analytics sites.
function normalizeDomains(raw) {
    if (!Array.isArray(raw)) return null;
    const cleaned = [...new Set(raw.map(d => String(d?.domain ?? d ?? "").trim().toLowerCase()).filter(Boolean))];
    if (!cleaned.length || cleaned.length > 50 || !cleaned.every(d => d.length <= 255)) return null;
    return cleaned;
}

function normalizeRecipients(raw) {
    if (!Array.isArray(raw)) return null;
    const cleaned = [...new Set(raw.map(r => String(r || "").trim().toLowerCase()).filter(Boolean))];
    if (!cleaned.length || cleaned.length > 10) return null;
    if (!cleaned.every(r => EMAIL_RE.test(r))) return null;
    return cleaned;
}

export default async function handler(req, res) {
    try {
        return await _handler(req, res);
    } catch (err) {
        console.error("[analytics-scheduled-reports] unhandled error:", err?.message, err?.stack);
        return res.status(500).json({ error: "Internal server error", message: err?.message });
    }
}

async function _handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTables(db);

    const domain = (req.query.domain || "").trim().toLowerCase();
    const workspaceId = String(req.query.workspace || "").trim().slice(0, 64) || null;

    const clientReportsAllowed = () => organisationHasPlan(db, orgId, "agency-pro").catch(() => false);
    const PLAN_REQUIRED = { error: "Client reports require the Agency Pro plan", code: "plan_required" };

    let siteId = null;
    if (domain) {
        const { rows } = await db.query(
            `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));
        if (!rows.length && !workspaceId) return res.status(200).json({ noSiteKey: true });
        siteId = rows[0]?.id || null;
    }

    // ── PREVIEW ───────────────────────────────────────────────────────────────
    if (req.method === "GET" && req.query.preview === "1") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        const { rows } = await db.query(
            `SELECT * FROM analytics_scheduled_reports WHERE id = $1 AND organisation_id = $2 LIMIT 1`,
            [id, orgId]
        ).catch(() => ({ rows: [] }));
        if (!rows.length) return res.status(404).json({ error: "Not found" });
        if (rows[0].workspace_id && !(await clientReportsAllowed())) return res.status(402).json(PLAN_REQUIRED);
        const report = await renderScheduledReport(db, rows[0]);
        if (!report) return res.status(422).json({ error: "None of this report's domains have analytics data yet." });
        return res.status(200).json(report);
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (req.method === "GET" && workspaceId) {
        const { rows } = await db.query(
            `SELECT * FROM analytics_scheduled_reports
             WHERE workspace_id = $1 AND organisation_id = $2
             ORDER BY created_at DESC`,
            [workspaceId, orgId]
        ).catch(() => ({ rows: [] }));
        return res.status(200).json({ reports: rows });
    }
    if (req.method === "GET") {
        if (!siteId) return res.status(400).json({ error: "domain required" });
        const { rows } = await db.query(
            `SELECT * FROM analytics_scheduled_reports
             WHERE site_id = $1 AND organisation_id = $2
             ORDER BY created_at DESC`,
            [siteId, orgId]
        ).catch(() => ({ rows: [] }));
        return res.status(200).json({ reports: rows });
    }

    // ── TEST SEND ─────────────────────────────────────────────────────────────
    if (req.method === "POST" && req.query.test === "1") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        const { rows } = await db.query(
            `SELECT * FROM analytics_scheduled_reports WHERE id = $1 AND organisation_id = $2 LIMIT 1`,
            [id, orgId]
        ).catch(() => ({ rows: [] }));
        if (!rows.length) return res.status(404).json({ error: "Not found" });
        const cfg = rows[0];
        if (cfg.workspace_id && !(await clientReportsAllowed())) return res.status(402).json(PLAN_REQUIRED);

        const report = await renderScheduledReport(db, cfg);
        if (!report) return res.status(422).json({ error: "None of this report's domains have analytics data yet." });
        const result = await sendReportEmail({
            recipients: cfg.recipients,
            subject: `[Test] ${report.subject}`,
            html: report.html,
        });
        if (!result.ok) return res.status(502).json({ error: "Failed to send test email", reason: result.reason });
        return res.status(200).json({ sent: true });
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
        if (!siteId && !workspaceId) return res.status(400).json({ error: "domain or workspace required" });
        const { frequency, day_of_week, day_of_month, recipients, label, enabled, workspace_name, domains } = req.body || {};
        let clientDomains = null;
        if (workspaceId) {
            if (!(await clientReportsAllowed())) return res.status(402).json(PLAN_REQUIRED);
            clientDomains = normalizeDomains(domains);
            if (!clientDomains) return res.status(400).json({ error: "domains must list 1-50 of the client's domains" });
        }
        if (!VALID_FREQUENCIES.has(frequency)) return res.status(400).json({ error: "Invalid frequency" });

        const dow = frequency === "weekly" ? parseInt(day_of_week, 10) : null;
        const dom = frequency === "monthly" ? parseInt(day_of_month, 10) : null;
        if (frequency === "weekly" && !(dow >= 0 && dow <= 6))
            return res.status(400).json({ error: "day_of_week must be 0-6" });
        if (frequency === "monthly" && !(dom >= 1 && dom <= 28))
            return res.status(400).json({ error: "day_of_month must be 1-28" });

        const cleanRecipients = normalizeRecipients(recipients);
        if (!cleanRecipients) return res.status(400).json({ error: "recipients must be 1-10 valid email addresses" });

        const { rows } = await db.query(
            `INSERT INTO analytics_scheduled_reports
             (site_id, organisation_id, frequency, day_of_week, day_of_month, recipients, label, enabled,
              workspace_id, workspace_name, domains)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [workspaceId ? null : siteId, orgId, frequency, dow, dom,
             JSON.stringify(cleanRecipients),
             (label || "").slice(0, 120) || null,
             enabled !== false,
             workspaceId,
             workspaceId ? String(workspace_name || "").slice(0, 120) || null : null,
             clientDomains ? JSON.stringify(clientDomains) : null]
        );
        return res.status(201).json(rows[0]);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (req.method === "PUT") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        const { frequency, day_of_week, day_of_month, recipients, label, enabled, workspace_name, domains } = req.body || {};

        let clientDomains = null;
        if (domains != null || workspace_name != null) {
            if (!(await clientReportsAllowed())) return res.status(402).json(PLAN_REQUIRED);
            if (domains != null) {
                clientDomains = normalizeDomains(domains);
                if (!clientDomains) return res.status(400).json({ error: "domains must list 1-50 of the client's domains" });
            }
        }

        if (frequency && !VALID_FREQUENCIES.has(frequency)) return res.status(400).json({ error: "Invalid frequency" });

        let dow = null, dom = null;
        if (frequency === "weekly") {
            dow = parseInt(day_of_week, 10);
            if (!(dow >= 0 && dow <= 6)) return res.status(400).json({ error: "day_of_week must be 0-6" });
        } else if (frequency === "monthly") {
            dom = parseInt(day_of_month, 10);
            if (!(dom >= 1 && dom <= 28)) return res.status(400).json({ error: "day_of_month must be 1-28" });
        }

        let cleanRecipients = null;
        if (recipients != null) {
            cleanRecipients = normalizeRecipients(recipients);
            if (!cleanRecipients) return res.status(400).json({ error: "recipients must be 1-10 valid email addresses" });
        }

        const { rows } = await db.query(
            `UPDATE analytics_scheduled_reports
             SET frequency    = COALESCE($3, frequency),
                 day_of_week  = CASE WHEN $3 = 'weekly'  THEN $4 WHEN $3 IS NOT NULL THEN NULL ELSE day_of_week  END,
                 day_of_month = CASE WHEN $3 = 'monthly' THEN $5 WHEN $3 IS NOT NULL THEN NULL ELSE day_of_month END,
                 recipients   = COALESCE($6, recipients),
                 label        = COALESCE($7, label),
                 enabled      = COALESCE($8, enabled),
                 domains        = CASE WHEN workspace_id IS NOT NULL THEN COALESCE($9::jsonb, domains) ELSE domains END,
                 workspace_name = CASE WHEN workspace_id IS NOT NULL THEN COALESCE($10, workspace_name) ELSE workspace_name END,
                 updated_at   = NOW()
             WHERE id = $1 AND organisation_id = $2
             RETURNING *`,
            [id, orgId, frequency || null, dow, dom,
             cleanRecipients ? JSON.stringify(cleanRecipients) : null,
             label != null ? (label || "").slice(0, 120) : null,
             enabled != null ? enabled : null,
             clientDomains ? JSON.stringify(clientDomains) : null,
             workspace_name != null ? String(workspace_name).slice(0, 120) || null : null]
        );
        if (!rows.length) return res.status(404).json({ error: "Not found" });
        return res.status(200).json(rows[0]);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        await db.query(
            `DELETE FROM analytics_scheduled_reports WHERE id = $1 AND organisation_id = $2`,
            [id, orgId]
        ).catch(() => {});
        return res.status(204).end();
    }

    return res.status(405).end();
}
