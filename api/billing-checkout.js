/**
 * POST /api/billing-checkout
 *   Starts a Stripe Checkout session in elements mode for the organisation —
 *   the platform renders the checkout window itself with Stripe Elements
 *   (src/Components/SubscriptionPlans/CheckoutForm.js).
 *   Headers: Authorization, Organisation
 *   Body:    { planId: "personal" | "starter" | "growth" | "agency-pro", returnPath?: "/settings" }
 *   200 { clientSecret, publishableKey }
 *   409 when the organisation already has an active subscription — plan
 *       changes go through the customer portal instead.
 *
 * GET /api/billing-checkout?session_id=cs_...
 *   Called when Stripe returns the customer to the platform. Stores the
 *   subscription right away instead of waiting for the webhook, and answers
 *   with the organisation's subscription (same shape as /api/billing-subscription).
 */

import { getPool } from "./_db.js";
import {
    setCors, requestOrganisation, stripe, stripeMode, publishableKey, priceIdForPlan, PLANS,
    ensureBillingTables, syncSubscription, organisationSubscription, ALLOWED_ORIGINS,
} from "./_stripe.js";

const APP_URL = "https://www.intastellarconsents.com";

export default async function handler(req, res) {
    setCors(req, res, "GET, POST");
    if (req.method === "OPTIONS") return res.status(204).end();
    res.setHeader("Cache-Control", "no-store");

    const auth = requestOrganisation(req);
    if (auth.error === 401) return res.status(401).json({ error: "Unauthorized" });
    if (auth.error) return res.status(400).json({ error: "Missing Organisation header" });
    const { organisationId, email } = auth;

    const db = getPool();
    try {
        await ensureBillingTables(db);
        if (req.method === "POST") return await createSession(req, res, db, organisationId, email);
        if (req.method === "GET")  return await confirmSession(req, res, db, organisationId);
        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("[billing-checkout]", err.message);
        return res.status(502).json({ error: "Payment provider error" });
    }
}

async function createSession(req, res, db, organisationId, email) {
    const { planId, returnPath } = req.body || {};
    if (!PLANS.includes(planId)) return res.status(400).json({ error: "Unknown plan" });
    const priceId = priceIdForPlan(planId);
    if (!priceId) {
        console.error(`[billing-checkout] no ${stripeMode()} price configured for ${planId}`);
        return res.status(500).json({ error: "Plan is not available" });
    }

    const current = await organisationSubscription(db, organisationId);
    if (current.subscription !== "none") {
        return res.status(409).json({ error: "This organisation already has a subscription", subscription: current });
    }

    const livemode = stripeMode() === "live";
    const { rows } = await db.query(
        `SELECT stripe_customer_id FROM billing_customers WHERE organisation_id = $1 AND livemode = $2`,
        [organisationId, livemode]
    );
    let customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
        const customer = await stripe("POST", "/customers", {
            email:    email || undefined,
            metadata: { organisation_id: organisationId },
        });
        customerId = customer.id;
        await db.query(
            `INSERT INTO billing_customers (organisation_id, livemode, stripe_customer_id) VALUES ($1, $2, $3)
             ON CONFLICT (organisation_id, livemode) DO NOTHING`,
            [organisationId, livemode, customerId]
        );
        // A parallel request may have stored its own customer first; use that one.
        const { rows: stored } = await db.query(
            `SELECT stripe_customer_id FROM billing_customers WHERE organisation_id = $1 AND livemode = $2`,
            [organisationId, livemode]
        );
        customerId = stored[0].stripe_customer_id;
    }

    const origin = ALLOWED_ORIGINS.includes(req.headers.origin) ? req.headers.origin : APP_URL;
    const path   = typeof returnPath === "string" && /^\/(?!\/)[^\s?#]*$/.test(returnPath) ? returnPath : "/dashboard";

    const session = await stripe("POST", "/checkout/sessions", {
        mode:                "subscription",
        ui_mode:             "elements",
        customer:            customerId,
        line_items:          [{ price: priceId, quantity: 1 }],
        client_reference_id: organisationId,
        return_url:          `${origin}${path}?session_id={CHECKOUT_SESSION_ID}`,
        subscription_data:   { metadata: { organisation_id: organisationId } },
        billing_address_collection: "required",
        tax_id_collection:   { enabled: true },
        customer_update:     { address: "auto", name: "auto" },
    });

    return res.status(200).json({ clientSecret: session.client_secret, publishableKey: publishableKey() });
}

async function confirmSession(req, res, db, organisationId) {
    const sessionId = String(req.query.session_id || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return res.status(400).json({ error: "Invalid session_id" });

    const session = await stripe("GET", `/checkout/sessions/${sessionId}`);
    if (String(session.client_reference_id) !== String(organisationId)) {
        return res.status(403).json({ error: "Session belongs to another organisation" });
    }
    if (session.status === "complete" && session.subscription) {
        await syncSubscription(db, session.subscription, { organisationId });
    }
    return res.status(200).json(await organisationSubscription(db, organisationId));
}
