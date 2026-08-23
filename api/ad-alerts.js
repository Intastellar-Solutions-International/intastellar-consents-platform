/**
 * /api/ad-alerts
 *
 * Unified endpoint for analytics blind-spot alert rules, notifications,
 * browser push subscriptions, and alert delivery (email + push).
 *
 * GET  ?domain=X&resource=rules          → list alert rules
 * GET  ?domain=X&resource=notifications  → unread count + notification list
 * POST body.action = 'save-rule'         → upsert an alert rule
 * POST body.action = 'check'            → check snapshot data, fire alerts
 * POST body.action = 'mark-read'        → mark notification(s) read
 * POST body.action = 'subscribe-push'   → store push subscription
 * POST body.action = 'unsubscribe-push' → remove push subscription
 * DELETE ?resource=rule&id=Y            → delete a rule
 *
 * Environment variables:
 *   RESEND_API_KEY   — Resend API key for email delivery
 *   RESEND_FROM      — sender address (default: alerts@intastellarconsents.com)
 *   VAPID_PUBLIC_KEY  — base64url VAPID public key for Web Push
 *   VAPID_PRIVATE_KEY — base64url VAPID private key for Web Push
 *   VAPID_CONTACT     — mailto: contact for VAPID (default: mailto:alerts@intastellarconsents.com)
 */

import pkg from "pg";
const { Pool } = pkg;
import { checkAndFireAlerts } from "./_alert-check.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
        });
    }
    return pool;
}

// ── Schema setup ─────────────────────────────────────────────────────────────

let schemaReady = false;

async function ensureSchema(db) {
    if (schemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS ad_alert_rules (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            organisation_id INTEGER NOT NULL,
            domain          TEXT NOT NULL,
            rule_type       TEXT NOT NULL,   -- visibility_low | dark_traffic_high | cost_high | banner_reach_low
            threshold       NUMERIC(10,2),
            threshold_unit  TEXT,            -- percent | currency_amount
            currency        TEXT,
            enabled         BOOLEAN NOT NULL DEFAULT TRUE,
            notify_email    BOOLEAN NOT NULL DEFAULT FALSE,
            notify_push     BOOLEAN NOT NULL DEFAULT FALSE,
            email_address   TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain, rule_type)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS ad_notifications (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            organisation_id INTEGER NOT NULL,
            domain          TEXT NOT NULL,
            rule_type       TEXT NOT NULL,
            severity        TEXT NOT NULL,   -- critical | warning | info
            title           TEXT NOT NULL,
            body            TEXT,
            snapshot_id     TEXT,
            platform        TEXT,
            read_at         TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS ad_notifications_org_domain_idx
            ON ad_notifications(organisation_id, domain, created_at DESC)
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS ad_push_subscriptions (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            organisation_id INTEGER NOT NULL,
            domain          TEXT NOT NULL,
            endpoint        TEXT NOT NULL,
            p256dh          TEXT NOT NULL,
            auth            TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, endpoint)
        )
    `);

    schemaReady = true;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return null;
        return payload;
    } catch {
        return null;
    }
}

function cleanDomain(raw) {
    if (!raw) return null;
    return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
}

// ── Alert rule defaults ───────────────────────────────────────────────────────

const DEFAULT_RULES = [
    { rule_type: "visibility_low",      threshold: 65,  threshold_unit: "percent",  label: "Visibility below" },
    { rule_type: "dark_traffic_high",   threshold: 40,  threshold_unit: "percent",  label: "Untagged traffic above" },
    { rule_type: "banner_reach_low",    threshold: 40,  threshold_unit: "percent",  label: "Banner reach below" },
    { rule_type: "cost_high",           threshold: null, threshold_unit: "currency_amount", label: "Cost per visible above" },
];

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const orgId = parseInt(req.headers["organisation"] || req.headers["organization"] || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Missing Organisation header" });

    const db = getPool();
    try {
        await ensureSchema(db);

        // ── GET ───────────────────────────────────────────────────────────────
        if (req.method === "GET") {
            const domain = cleanDomain(req.query.domain);
            const resource = req.query.resource;

            if (resource === "rules") {
                // Rules are genuinely per-domain (ad_alert_rules is keyed on
                // organisation_id+domain+rule_type) — a domain is required here.
                if (!domain) return res.status(400).json({ error: "domain is required" });
                const { rows } = await db.query(
                    `SELECT * FROM ad_alert_rules
                      WHERE organisation_id = $1 AND domain = $2
                      ORDER BY created_at`,
                    [orgId, domain]
                );
                // Merge with defaults so the UI always shows all rule types
                const indexed = Object.fromEntries(rows.map(r => [r.rule_type, r]));
                const merged = DEFAULT_RULES.map(d => indexed[d.rule_type] || {
                    rule_type: d.rule_type,
                    threshold: d.threshold,
                    threshold_unit: d.threshold_unit,
                    enabled: false,
                    notify_email: false,
                    notify_push: false,
                    email_address: null,
                    currency: null,
                    id: null,
                });
                return res.json({ rules: merged, vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null });
            }

            if (resource === "notifications") {
                // Domain is optional here — the header's NotificationCenter bell
                // intentionally fetches org-wide (no domain selected), while the
                // Reconciliation panel fetches scoped to one domain. Only filter
                // by domain when one was actually provided.
                const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
                const params = domain ? [orgId, domain, limit] : [orgId, limit];
                const { rows } = await db.query(
                    `SELECT * FROM ad_notifications
                      WHERE organisation_id = $1 ${domain ? "AND domain = $2" : ""}
                      ORDER BY created_at DESC
                      LIMIT $${domain ? 3 : 2}`,
                    params
                );
                const unread = rows.filter(r => !r.read_at).length;
                return res.json({ notifications: rows, unread });
            }

            return res.status(400).json({ error: "resource must be rules or notifications" });
        }

        // ── POST ──────────────────────────────────────────────────────────────
        if (req.method === "POST") {
            const body = req.body || {};
            const domain = cleanDomain(body.domain);
            if (!domain) return res.status(400).json({ error: "domain is required" });

            // Save or update an alert rule
            if (body.action === "save-rule") {
                const { rule_type, threshold, threshold_unit, currency, enabled, notify_email, notify_push, email_address } = body;
                if (!rule_type) return res.status(400).json({ error: "rule_type is required" });

                const { rows: [rule] } = await db.query(
                    `INSERT INTO ad_alert_rules
                        (organisation_id, domain, rule_type, threshold, threshold_unit, currency,
                         enabled, notify_email, notify_push, email_address, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
                     ON CONFLICT (organisation_id, domain, rule_type)
                     DO UPDATE SET
                         threshold      = EXCLUDED.threshold,
                         threshold_unit = EXCLUDED.threshold_unit,
                         currency       = EXCLUDED.currency,
                         enabled        = EXCLUDED.enabled,
                         notify_email   = EXCLUDED.notify_email,
                         notify_push    = EXCLUDED.notify_push,
                         email_address  = EXCLUDED.email_address,
                         updated_at     = NOW()
                     RETURNING *`,
                    [orgId, domain, rule_type,
                     threshold != null ? Number(threshold) : null,
                     threshold_unit || "percent",
                     currency || null,
                     enabled !== false,
                     !!notify_email,
                     !!notify_push,
                     email_address || null]
                );
                return res.json({ ok: true, rule });
            }

            // Trigger alert check against a snapshot
            if (body.action === "check") {
                const snapshot = body.snapshot;
                if (!snapshot) return res.status(400).json({ error: "snapshot is required" });
                const fired = await checkAndFireAlerts(db, { orgId, domain, snapshot });
                return res.json({ ok: true, fired });
            }

            // Mark notifications as read
            if (body.action === "mark-read") {
                const notifId = body.id;
                if (notifId === "all") {
                    await db.query(
                        `UPDATE ad_notifications SET read_at = NOW()
                          WHERE organisation_id = $1 AND domain = $2 AND read_at IS NULL`,
                        [orgId, domain]
                    );
                } else if (notifId) {
                    await db.query(
                        `UPDATE ad_notifications SET read_at = NOW()
                          WHERE id = $1 AND organisation_id = $2`,
                        [notifId, orgId]
                    );
                }
                return res.json({ ok: true });
            }

            // Store browser push subscription
            if (body.action === "subscribe-push") {
                const { endpoint, keys } = body.subscription || {};
                if (!endpoint || !keys?.p256dh || !keys?.auth) {
                    return res.status(400).json({ error: "Invalid push subscription" });
                }
                await db.query(
                    `INSERT INTO ad_push_subscriptions (organisation_id, domain, endpoint, p256dh, auth)
                     VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT (organisation_id, endpoint)
                     DO UPDATE SET domain=$2, p256dh=$4, auth=$5`,
                    [orgId, domain, endpoint, keys.p256dh, keys.auth]
                );
                return res.json({ ok: true });
            }

            // Remove push subscription
            if (body.action === "unsubscribe-push") {
                const { endpoint } = body.subscription || {};
                if (endpoint) {
                    await db.query(
                        `DELETE FROM ad_push_subscriptions
                          WHERE organisation_id = $1 AND endpoint = $2`,
                        [orgId, endpoint]
                    );
                }
                return res.json({ ok: true });
            }

            return res.status(400).json({ error: "Unknown action" });
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (req.method === "DELETE") {
            const resource = req.query.resource;
            const id = req.query.id;
            if (resource === "rule" && id) {
                await db.query(
                    `DELETE FROM ad_alert_rules WHERE id = $1 AND organisation_id = $2`,
                    [id, orgId]
                );
                return res.json({ ok: true });
            }
            if (resource === "notification" && id) {
                await db.query(
                    `DELETE FROM ad_notifications WHERE id = $1 AND organisation_id = $2`,
                    [id, orgId]
                );
                return res.json({ ok: true });
            }
            return res.status(400).json({ error: "resource and id required" });
        }

        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("[ad-alerts] Error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
