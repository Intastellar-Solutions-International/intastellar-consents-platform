// Stripe billing on this platform: request encoding, plan mapping, which
// subscription unlocks an organisation's tier, webhook routing and the two
// auth checks.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "./_harness.mjs";
import {
    encodeForm, planForPrice, pickCurrentSubscription, verifyStripeSignature, requestOrganisation,
} from "../api/_stripe.js";
import { subscriptionIdFromEvent } from "../api/stripe-webhook.js";
import { apiKeyMatches } from "../api/billing-subscriptions.js";

test("encodeForm writes nested objects and arrays the way Stripe expects", () => {
    const form = encodeForm({
        mode: "subscription",
        line_items: [{ price: "price_1", quantity: 1 }],
        subscription_data: { metadata: { organisation_id: 12 } },
        expand: ["customer"],
        skipped: undefined,
    });
    assert.deepEqual([...form.entries()], [
        ["mode", "subscription"],
        ["line_items[0][price]", "price_1"],
        ["line_items[0][quantity]", "1"],
        ["subscription_data[metadata][organisation_id]", "12"],
        ["expand[0]", "customer"],
    ]);
});

test("planForPrice maps live and test prices; the 6-month price unlocks Agency Pro", () => {
    const env = {
        STRIPE_PRICE_ID_PERSONAL_LIVE: "price_personal_live",
        STRIPE_PRICE_ID_GROWTH_TEST: "price_growth_test",
        STRIPE_PRICE_ID_AGENCY_PRO_6M_LIVE: "price_agency_6m",
    };
    Object.assign(process.env, env);
    try {
        assert.equal(planForPrice("price_personal_live"), "personal");
        assert.equal(planForPrice("price_growth_test"), "growth");
        assert.equal(planForPrice("price_agency_6m"), "agency-pro");
        assert.equal(planForPrice("price_unknown"), null);
        assert.equal(planForPrice(null), null);
    } finally {
        for (const k of Object.keys(env)) delete process.env[k];
    }
});

test("the current plan is the highest active tier; ended or unmapped subscriptions don't count", () => {
    const rows = [
        { plan: "growth", status: "canceled" },
        { plan: "starter", status: "active" },
        { plan: "personal", status: "past_due" },
        { plan: null, status: "active" },
    ];
    assert.equal(pickCurrentSubscription(rows).plan, "starter");
    assert.equal(pickCurrentSubscription([{ plan: "growth", status: "past_due" }]).plan, "growth");
    assert.equal(pickCurrentSubscription([{ plan: "growth", status: "unpaid" }]), null);
    assert.equal(pickCurrentSubscription([]), null);
});

test("Stripe signatures: valid accepted; wrong secret, tampered body and old events rejected", () => {
    const secret = "whsec_test";
    const body = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    const header = `t=${t},v1=${sig}`;
    assert.equal(verifyStripeSignature(body, header, secret, t), true);
    assert.equal(verifyStripeSignature(body, header, "whsec_other", t), false);
    assert.equal(verifyStripeSignature('{"id":"evt_2"}', header, secret, t), false);
    assert.equal(verifyStripeSignature(body, header, secret, t + 301), false);
    assert.equal(verifyStripeSignature(body, "", secret, t), false);
});

test("webhook routes checkout and subscription events to the sync, and nothing else", () => {
    assert.equal(subscriptionIdFromEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1" } } }), "sub_1");
    assert.equal(subscriptionIdFromEvent({ type: "checkout.session.completed", data: { object: { mode: "payment" } } }), null);
    assert.equal(subscriptionIdFromEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub_2" } } }), "sub_2");
    assert.equal(subscriptionIdFromEvent({ type: "invoice.payment_succeeded", data: { object: { id: "in_1", subscription: "sub_3" } } }), null);
});

test("the Accounts endpoint only accepts the exact API key", () => {
    assert.equal(apiKeyMatches("Bearer s3cret-key", "s3cret-key"), true);
    assert.equal(apiKeyMatches("s3cret-key", "s3cret-key"), true);
    assert.equal(apiKeyMatches("Bearer s3cret-kez", "s3cret-key"), false);
    assert.equal(apiKeyMatches("Bearer s3cret", "s3cret-key"), false);
    assert.equal(apiKeyMatches("Bearer anything", undefined), false);
    assert.equal(apiKeyMatches(undefined, ""), false);
});

test("platform requests need an unexpired token and an Organisation header", () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
    const token = (payload) => "Bearer " + Buffer.from(`${b64({ alg: "HS512" })}.${b64(payload)}.sig`).toString("base64");
    const now = Math.floor(Date.now() / 1000);
    const valid = token({ exp: now + 60, nbf: now - 60, PAYLOAD: "a@b.com" });

    assert.deepEqual(requestOrganisation({ headers: { authorization: valid, organisation: "12" } }), { organisationId: 12, email: "a@b.com" });
    assert.equal(requestOrganisation({ headers: { authorization: valid } }).error, 400);
    assert.equal(requestOrganisation({ headers: { authorization: token({ exp: now - 1 }), organisation: "12" } }).error, 401);
    assert.equal(requestOrganisation({ headers: { organisation: "12" } }).error, 401);
});
