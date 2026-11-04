/**
 * Stripe billing helpers shared by the billing endpoints, the Stripe webhook
 * and scripts/backfill-subscriptions.mjs.
 *
 * Subscriptions are stored in Postgres (billing_subscriptions), one row per
 * Stripe subscription. Stripe stays the source of truth: every write re-reads
 * the subscription from the Stripe API, so out-of-order webhooks can't leave
 * a stale state behind.
 *
 * Env vars:
 *   STRIPE_MODE                       "live" | "test" (default: live on Vercel
 *                                     production, test everywhere else)
 *   STRIPE_SECRET_KEY_LIVE / _TEST
 *   STRIPE_PUBLISHABLE_KEY_LIVE / _TEST
 *   STRIPE_PRICE_ID_<PLAN>_LIVE / _TEST   PLAN = PERSONAL, STARTER, GROWTH,
 *                                     AGENCY_PRO, AGENCY_PRO_6M (optional)
 *   STRIPE_PORTAL_LOGIN_URL           Stripe's customer portal login link
 */

import crypto from "crypto";

// Pinned so response shapes don't change with the account's default version.
// From 2025-03-31.basil, current_period_end lives on the subscription items.
// Must match the Stripe.js build the checkout loads (js.stripe.com/endive/),
// which is what understands ui_mode "elements" sessions.
const STRIPE_VERSION = "2026-10-28.endive";

// Plans in tier order (lowest first) — keep in sync with src/Functions/tier.js.
export const PLANS = ["personal", "starter", "growth", "agency-pro"];

const PRICE_ENV = {
    "personal":      "PERSONAL",
    "starter":       "STARTER",
    "growth":        "GROWTH",
    "agency-pro":    "AGENCY_PRO",
    "agency-pro-6m": "AGENCY_PRO_6M",
};

// Statuses that keep the plan's features unlocked. past_due stays unlocked
// while Stripe retries the payment; it becomes canceled/unpaid if that fails.
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export function stripeMode() {
    const mode = process.env.STRIPE_MODE || (process.env.VERCEL_ENV === "production" ? "live" : "test");
    return mode === "live" ? "live" : "test";
}

const suffix = () => stripeMode().toUpperCase();

export function publishableKey() {
    return process.env[`STRIPE_PUBLISHABLE_KEY_${suffix()}`] || null;
}

export function priceIdForPlan(planId) {
    const key = PRICE_ENV[planId];
    return key ? process.env[`STRIPE_PRICE_ID_${key}_${suffix()}`] || null : null;
}

// Both modes are mapped: a test-mode event must still resolve its plan.
export function planForPrice(priceId) {
    if (!priceId) return null;
    for (const [plan, key] of Object.entries(PRICE_ENV)) {
        if (process.env[`STRIPE_PRICE_ID_${key}_LIVE`] === priceId || process.env[`STRIPE_PRICE_ID_${key}_TEST`] === priceId) {
            // The 6-month Agency Pro price unlocks the same tier.
            return plan === "agency-pro-6m" ? "agency-pro" : plan;
        }
    }
    return null;
}

// ── Stripe API ────────────────────────────────────────────────────────────────

// Stripe's form encoding: nested objects as a[b]=, arrays as a[0]= / a[0][b]=.
export function encodeForm(params, prefix = "", out = new URLSearchParams()) {
    for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (Array.isArray(v)) {
            v.forEach((item, i) => {
                if (item !== null && typeof item === "object") encodeForm(item, `${key}[${i}]`, out);
                else out.append(`${key}[${i}]`, String(item));
            });
        } else if (typeof v === "object") {
            encodeForm(v, key, out);
        } else {
            out.append(key, String(v));
        }
    }
    return out;
}

// mode: "live" | "test"; defaults to stripeMode().
export async function stripe(method, path, params, mode = stripeMode()) {
    const keyName = `STRIPE_SECRET_KEY_${mode.toUpperCase()}`;
    const key = process.env[keyName];
    if (!key) throw new Error(`${keyName} is not set`);

    const body = params ? encodeForm(params).toString() : "";
    const url  = `https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`;
    const resp = await fetch(url, {
        method,
        headers: {
            Authorization:    `Bearer ${key}`,
            "Stripe-Version": STRIPE_VERSION,
            ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: method !== "GET" ? body : undefined,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(data?.error?.message || `Stripe ${method} ${path} failed (${resp.status})`);
        err.status = resp.status;
        throw err;
    }
    return data;
}

// Header format: t=<timestamp>,v1=<sig>[,v1=<sig2>]
export function verifyStripeSignature(rawBody, sigHeader, secret, nowSec = Date.now() / 1000) {
    const parts = {};
    for (const chunk of (sigHeader || "").split(",")) {
        const eq = chunk.indexOf("=");
        const key = chunk.slice(0, eq);
        const val = chunk.slice(eq + 1);
        if (key === "v1") {
            (parts.v1 = parts.v1 || []).push(val);
        } else {
            parts[key] = val;
        }
    }

    const { t, v1 = [] } = parts;
    if (!t || !v1.length) return false;

    // Reject events older than 5 minutes to prevent replay attacks.
    if (Math.abs(nowSec - parseInt(t, 10)) > 300) return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${t}.${rawBody}`)
        .digest("hex");

    return v1.some(candidate => {
        try {
            return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(candidate, "hex"));
        } catch {
            return false;
        }
    });
}

// ── Requests from the platform ────────────────────────────────────────────────

export const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

export function setCors(req, res, methods) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", `${methods}, OPTIONS`);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

// Same check as the other platform endpoints: tokens are base64 of the whole
// JWT and are decoded, not signature-verified, here. Nothing reachable with
// it can change or reveal billing details — the customer portal is Stripe's
// own email-verified login.
export function requestOrganisation(req) {
    const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return { error: 401 };
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return { error: 401 };
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return { error: 401 };
        const organisationId = toInt(req.headers.organisation);
        if (!organisationId) return { error: 400 };
        return { organisationId, email: typeof payload.PAYLOAD === "string" ? payload.PAYLOAD : null };
    } catch {
        return { error: 401 };
    }
}

// ── Storage ───────────────────────────────────────────────────────────────────

let tablesReady = false;
export async function ensureBillingTables(db) {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS billing_customers (
            organisation_id     INTEGER     NOT NULL,
            livemode            BOOLEAN     NOT NULL,
            stripe_customer_id  TEXT        NOT NULL UNIQUE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organisation_id, livemode)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS billing_subscriptions (
            stripe_subscription_id  TEXT        PRIMARY KEY,
            organisation_id         INTEGER     NOT NULL,
            stripe_customer_id      TEXT        NOT NULL,
            customer_email          TEXT,
            customer_name           TEXT,
            plan                    TEXT,
            price_id                TEXT,
            status                  TEXT        NOT NULL,
            cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
            current_period_end      TIMESTAMPTZ,
            amount                  INTEGER,
            currency                TEXT,
            billing_interval        TEXT,
            livemode                BOOLEAN     NOT NULL,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS billing_subscriptions_org_idx ON billing_subscriptions (organisation_id, livemode)`);
    // Company name entered at checkout (Stripe customer.business_name).
    await db.query(`ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS company_name TEXT`);
    tablesReady = true;
}

const toInt = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
};

// Which organisation a subscription belongs to. Checkout sessions created
// here set subscription metadata; subscriptions from the old Stripe pricing
// table only carry client_reference_id on their checkout session.
async function resolveOrganisationId(db, sub, hint, mode) {
    const fromMeta = toInt(sub.metadata?.organisation_id) || toInt(sub.customer?.metadata?.organisation_id);
    if (fromMeta) return fromMeta;
    if (toInt(hint)) return toInt(hint);

    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const { rows } = await db.query(`SELECT organisation_id FROM billing_customers WHERE stripe_customer_id = $1`, [customerId]);
    if (rows.length) return rows[0].organisation_id;

    const sessions = await stripe("GET", "/checkout/sessions", { subscription: sub.id, limit: 1 }, mode);
    return toInt(sessions.data?.[0]?.client_reference_id);
}

/**
 * Re-reads a subscription from Stripe and upserts it. Returns the stored row,
 * or null when it can't be linked to an organisation.
 * livemode: the event's mode, so a test event is read with the test key.
 */
export async function syncSubscription(db, subscriptionId, { organisationId: hint, livemode } = {}) {
    await ensureBillingTables(db);
    const mode = livemode === undefined ? stripeMode() : livemode ? "live" : "test";
    const sub = await stripe("GET", `/subscriptions/${subscriptionId}`, { expand: ["customer"] }, mode);

    const organisationId = await resolveOrganisationId(db, sub, hint, mode);
    if (!organisationId) {
        console.warn(`[stripe] subscription ${sub.id} has no organisation — not stored`);
        return null;
    }

    const item     = sub.items?.data?.[0];
    const price    = item?.price;
    const plan     = planForPrice(price?.id);
    if (!plan) console.warn(`[stripe] subscription ${sub.id}: price ${price?.id} is not mapped to a plan`);
    const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;
    const customer  = typeof sub.customer === "object" ? sub.customer : null;
    const customerId = customer?.id || sub.customer;

    await db.query(
        `INSERT INTO billing_customers (organisation_id, livemode, stripe_customer_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [organisationId, sub.livemode, customerId]
    );

    const { rows } = await db.query(
        `INSERT INTO billing_subscriptions
             (stripe_subscription_id, organisation_id, stripe_customer_id, customer_email, customer_name,
              plan, price_id, status, cancel_at_period_end, current_period_end,
              amount, currency, billing_interval, livemode, company_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), $11, $12, $13, $14, $15)
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
             organisation_id      = EXCLUDED.organisation_id,
             stripe_customer_id   = EXCLUDED.stripe_customer_id,
             customer_email       = EXCLUDED.customer_email,
             customer_name        = EXCLUDED.customer_name,
             plan                 = EXCLUDED.plan,
             price_id             = EXCLUDED.price_id,
             status               = EXCLUDED.status,
             cancel_at_period_end = EXCLUDED.cancel_at_period_end,
             current_period_end   = EXCLUDED.current_period_end,
             amount               = EXCLUDED.amount,
             currency             = EXCLUDED.currency,
             billing_interval     = EXCLUDED.billing_interval,
             livemode             = EXCLUDED.livemode,
             company_name         = EXCLUDED.company_name,
             updated_at           = NOW()
         RETURNING *`,
        [
            sub.id, organisationId, customerId, customer?.email || null, customer?.name || null,
            plan, price?.id || null, sub.status, !!sub.cancel_at_period_end, periodEnd,
            price?.unit_amount ?? null, price?.currency || null, price?.recurring?.interval || null, !!sub.livemode,
            customer?.business_name || null,
        ]
    );
    return rows[0];
}

// The organisation's current plan: the highest tier among its active
// subscriptions in the current mode.
export function pickCurrentSubscription(rows) {
    let best = null;
    for (const r of rows) {
        if (!ACTIVE_STATUSES.includes(r.status)) continue;
        const rank = PLANS.indexOf(r.plan);
        if (rank === -1) continue;
        if (!best || rank > PLANS.indexOf(best.plan)) best = r;
    }
    return best;
}

export async function organisationSubscription(db, organisationId) {
    await ensureBillingTables(db);
    const { rows } = await db.query(
        `SELECT * FROM billing_subscriptions WHERE organisation_id = $1 AND livemode = $2`,
        [organisationId, stripeMode() === "live"]
    );
    const current = pickCurrentSubscription(rows);
    return {
        subscription:         current?.plan || "none",
        status:               current?.status || null,
        current_period_end:   current?.current_period_end || null,
        cancel_at_period_end: current?.cancel_at_period_end || false,
        portal_url:           current ? process.env.STRIPE_PORTAL_LOGIN_URL || null : null,
    };
}
