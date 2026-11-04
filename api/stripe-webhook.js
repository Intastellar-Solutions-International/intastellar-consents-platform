/**
 * POST /api/stripe-webhook
 *
 * Receives Stripe webhook events:
 *   - keeps billing_subscriptions in sync (see _stripe.js), and
 *   - mirrors paid subscription invoices into Dinero as booked invoices,
 *     creating the contact if they don't exist.
 *
 * Required env vars:
 *   STRIPE_WEBHOOK_SECRET   — signing secret from Stripe Dashboard → Webhooks
 *   STRIPE_WEBHOOK_SECRET_TEST — optional, for a test-mode webhook
 *   STRIPE_SECRET_KEY_LIVE / _TEST — subscription sync re-reads from Stripe
 *   DINERO_CLIENT_ID        — from Dinero Developer → API Applications
 *   DINERO_CLIENT_SECRET
 *   DINERO_ORGANIZATION_ID  — numeric org ID visible in Dinero URL
 *   DINERO_ACCOUNT_NUMBER   — chart of accounts number for subscription revenue (default: 1000)
 *
 * Stripe events handled: checkout.session.completed,
 * customer.subscription.{created,updated,deleted,paused,resumed},
 * invoice.payment_succeeded. All other event types are acknowledged and ignored.
 */

import { verifyStripeSignature, syncSubscription } from "./_stripe.js";
import { getPool } from "./_db.js";

// Disable Vercel's body parser so we can verify the raw Stripe signature.
export const config = { api: { bodyParser: false } };

const DINERO_AUTH_URL = "https://authz.dinero.dk/dineroapi/oauth/token";
const DINERO_API_BASE = "https://api.dinero.dk/v1";

// ── Raw body ──────────────────────────────────────────────────────────────────

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on("end",  () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

// ── Dinero helpers ─────────────────────────────────────────────────────────────

async function getDineroToken() {
    const resp = await fetch(DINERO_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type:    "client_credentials",
            client_id:     process.env.DINERO_CLIENT_ID,
            client_secret: process.env.DINERO_CLIENT_SECRET,
            scope:         "openid dinero",
        }),
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Dinero auth failed ${resp.status}: ${body}`);
    }
    const { access_token } = await resp.json();
    return access_token;
}

async function findOrCreateContact(token, orgId, { email, name, countryCode }) {
    const base    = `${DINERO_API_BASE}/${orgId}`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Search for existing contact by email.
    const searchResp = await fetch(
        `${base}/contacts?fields=ContactGuid,Name,Email&queryFilter=${encodeURIComponent(`Email eq '${email}'`)}`,
        { headers }
    );
    if (searchResp.ok) {
        const { Collection } = await searchResp.json();
        if (Collection?.length > 0) return Collection[0].ContactGuid;
    }

    // Create a new contact.
    const createResp = await fetch(`${base}/contacts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            Name:                          name || email,
            Email:                         email,
            CountryKey:                    countryCode || "DK",
            PaymentConditionType:          "Netto",
            PaymentConditionNumberOfDays:  8,
            ContactType:                   "customer",
        }),
    });
    if (!createResp.ok) {
        const body = await createResp.text().catch(() => "");
        throw new Error(`Dinero create contact failed ${createResp.status}: ${body}`);
    }
    const { ContactGuid } = await createResp.json();
    return ContactGuid;
}

async function createAndBookInvoice(token, orgId, {
    contactGuid, externalRef, date, amount, currency, description, accountNumber,
}) {
    const base    = `${DINERO_API_BASE}/${orgId}`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Create draft invoice.
    const createResp = await fetch(`${base}/invoices`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            Currency:          currency.toUpperCase(),
            Language:          "English",
            ExternalReference: externalRef,
            Date:              date,
            ContactGuid:       contactGuid,
            ProductLines: [{
                BaseAmountValue: amount,
                Quantity:        1,
                AccountNumber:   accountNumber,
                Description:     description,
                Unit:            "parts",
            }],
        }),
    });
    if (!createResp.ok) {
        const body = await createResp.text().catch(() => "");
        throw new Error(`Dinero create invoice failed ${createResp.status}: ${body}`);
    }
    const { Guid, TimeStamp } = await createResp.json();

    // Book (finalise) the invoice so it enters the accounting ledger.
    const bookResp = await fetch(`${base}/invoices/${Guid}/book`, {
        method: "POST",
        headers,
        body: JSON.stringify({ TimeStamp }),
    });
    if (!bookResp.ok) {
        const body = await bookResp.text().catch(() => "");
        throw new Error(`Dinero book invoice failed ${bookResp.status}: ${body}`);
    }

    return Guid;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export function subscriptionIdFromEvent(event) {
    const obj = event?.data?.object;
    switch (event?.type) {
        case "checkout.session.completed":
            return obj?.mode === "subscription" ? obj.subscription || null : null;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.paused":
        case "customer.subscription.resumed":
            return obj?.id || null;
        default:
            return null;
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const sigHeader    = req.headers["stripe-signature"];
    // Live and test mode webhooks are signed with different secrets.
    const webhookSecrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_TEST].filter(Boolean);
    if (!sigHeader || !webhookSecrets.length) {
        return res.status(400).json({ error: "Missing stripe-signature or webhook secret" });
    }

    let rawBody;
    try {
        rawBody = await readRawBody(req);
    } catch {
        return res.status(400).json({ error: "Could not read request body" });
    }

    if (!webhookSecrets.some(secret => verifyStripeSignature(rawBody.toString(), sigHeader, secret))) {
        return res.status(400).json({ error: "Invalid Stripe signature" });
    }

    let event;
    try {
        event = JSON.parse(rawBody.toString());
    } catch {
        return res.status(400).json({ error: "Invalid JSON" });
    }

    // Subscription changes update billing_subscriptions. Errors return 500 so
    // Stripe retries — a missed update would leave a customer locked out or
    // keep a cancelled plan unlocked.
    const subscriptionId = subscriptionIdFromEvent(event);
    if (subscriptionId) {
        try {
            const hint = event.type === "checkout.session.completed" ? event.data.object.client_reference_id : undefined;
            await syncSubscription(getPool(), subscriptionId, { organisationId: hint, livemode: !!event.livemode });
            return res.status(200).json({ received: true, subscription: subscriptionId });
        } catch (err) {
            console.error(`[stripe-webhook] ${event.type} sync failed for ${subscriptionId}:`, err.message);
            return res.status(500).json({ error: "Subscription sync failed" });
        }
    }

    // Only process paid invoices; acknowledge everything else.
    if (event.type !== "invoice.payment_succeeded") {
        return res.status(200).json({ received: true, skipped: true });
    }

    const inv           = event.data.object;
    const email         = inv.customer_email;
    const name          = inv.customer_name;
    const amountPaid    = inv.amount_paid / 100;
    const currency      = inv.currency;
    const stripeId      = inv.id;
    const lineItem      = inv.lines?.data?.[0];
    const description   = lineItem?.description || "Subscription payment";
    const date          = new Date(inv.created * 1000).toISOString().slice(0, 10);
    const countryCode   = inv.customer_address?.country || null;

    if (!email) {
        console.error("[stripe-webhook] invoice.payment_succeeded has no customer_email", stripeId);
        return res.status(200).json({ received: true, skipped: true, reason: "no email" });
    }

    const orgId         = process.env.DINERO_ORGANIZATION_ID;
    const accountNumber = parseInt(process.env.DINERO_ACCOUNT_NUMBER || "1000", 10);

    if (!orgId || !process.env.DINERO_CLIENT_ID || !process.env.DINERO_CLIENT_SECRET) {
        console.error("[stripe-webhook] Dinero env vars not configured");
        // Return 200 so Stripe does not keep retrying.
        return res.status(200).json({ received: true, error: "Dinero not configured" });
    }

    try {
        const token       = await getDineroToken();
        const contactGuid = await findOrCreateContact(token, orgId, { email, name, countryCode });
        const dineroGuid  = await createAndBookInvoice(token, orgId, {
            contactGuid, externalRef: stripeId, date,
            amount: amountPaid, currency, description, accountNumber,
        });
        console.log(`[stripe-webhook] Dinero invoice ${dineroGuid} created for Stripe ${stripeId} (${email} €${amountPaid})`);
        return res.status(200).json({ received: true, dineroInvoice: dineroGuid });
    } catch (err) {
        // Log the error but return 200 — Dinero failures should not cause Stripe to retry.
        console.error("[stripe-webhook] Dinero error:", err.message);
        return res.status(200).json({ received: true, error: err.message });
    }
}
