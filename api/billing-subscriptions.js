/**
 * GET /api/billing-subscriptions
 *
 * Server-to-server endpoint for Intastellar Accounts: lists subscriptions so
 * Accounts can show them to its users. Not for browsers — Accounts decides
 * which rows each user may see.
 *
 * Auth: Authorization: Bearer <ACCOUNTS_API_KEY>
 *
 * Query params (all optional):
 *   organisation_id  one id, or several comma-separated (e.g. 12,40)
 *   email            billing email on the Stripe customer (case-insensitive)
 *   status           "active" (default: active, trialing, past_due) | "all"
 *   mode             "live" | "test" (default: the platform's Stripe mode)
 *
 * 200 { subscriptions: [{ organisation_id, plan, status, current_period_end,
 *       cancel_at_period_end, amount, currency, interval, company_name,
 *       customer_email, customer_name, stripe_subscription_id,
 *       stripe_customer_id, created_at, updated_at }] }
 *
 *   company_name   the company entered at checkout (prefilled with the
 *                  organisation's name; null when bought as an individual)
 *   customer_name  the Stripe customer's name — the company, or the person
 */

import crypto from "crypto";
import { getPool } from "./_db.js";
import { ensureBillingTables, stripeMode, ACTIVE_STATUSES } from "./_stripe.js";

export function apiKeyMatches(header, key) {
    if (!key) return false;
    const given = Buffer.from(String(header || "").replace(/^Bearer\s+/i, ""));
    const want  = Buffer.from(key);
    return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    res.setHeader("Cache-Control", "no-store");

    if (!apiKeyMatches(req.headers.authorization, process.env.ACCOUNTS_API_KEY)) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const where  = [];
    const params = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };

    const mode = req.query.mode === "live" || req.query.mode === "test" ? req.query.mode : stripeMode();
    add("livemode = ?", mode === "live");

    if (req.query.status !== "all") add("status = ANY(?)", ACTIVE_STATUSES);

    if (req.query.organisation_id) {
        const ids = String(req.query.organisation_id).split(",").map(s => parseInt(s, 10)).filter(n => n > 0);
        if (!ids.length) return res.status(400).json({ error: "Invalid organisation_id" });
        add("organisation_id = ANY(?)", ids);
    }
    if (req.query.email) add("LOWER(customer_email) = LOWER(?)", String(req.query.email));

    try {
        const db = getPool();
        await ensureBillingTables(db);
        const { rows } = await db.query(
            `SELECT * FROM billing_subscriptions WHERE ${where.join(" AND ")} ORDER BY organisation_id, created_at`,
            params
        );
        return res.status(200).json({
            subscriptions: rows.map(r => ({
                organisation_id:        r.organisation_id,
                plan:                   r.plan,
                status:                 r.status,
                current_period_end:     r.current_period_end,
                cancel_at_period_end:   r.cancel_at_period_end,
                amount:                 r.amount,
                currency:               r.currency,
                interval:               r.billing_interval,
                company_name:           r.company_name,
                customer_email:         r.customer_email,
                customer_name:          r.customer_name,
                stripe_subscription_id: r.stripe_subscription_id,
                stripe_customer_id:     r.stripe_customer_id,
                created_at:             r.created_at,
                updated_at:             r.updated_at,
            })),
        });
    } catch (err) {
        console.error("[billing-subscriptions]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
