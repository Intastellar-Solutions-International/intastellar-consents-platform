// Tests api/_conversions.js — the shared conversion-tier classification
// (docs/analytics-audit-plan.md item 5).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import {
    classifyTier, tierCaseSql, isHeadlineConversionSql,
    SALE_KINDS, LEAD_KINDS, INTENT_KINDS, LEAD_EVENT_NAMES, AUTO_EVENT_NAMES,
} from "../api/_conversions.js";

test("classifyTier: form_submit is always Lead, regardless of kind", () => {
    assert.strictEqual(classifyTier("form_submit", "custom"), "lead");
    assert.strictEqual(classifyTier("form_submit", undefined), "lead");
    assert.strictEqual(classifyTier("form_submit", "purchase"), "lead");
});

test("classifyTier: kind='lead' (e.g. a booking-confirmation event) is Lead", () => {
    assert.strictEqual(classifyTier("booked", "lead"), "lead");
    assert.strictEqual(classifyTier("demo_requested", "lead"), "lead");
});

test("classifyTier: purchase/e-commerce kinds are Sale, not Lead", () => {
    assert.strictEqual(classifyTier("purchase", "purchase"), "sale");
    assert.strictEqual(classifyTier("add_to_cart_event", "add_to_cart"), "sale");
    assert.strictEqual(classifyTier("checkout_event", "checkout"), "sale");
});

test("classifyTier: a CTA click is Intent, never Lead or Sale", () => {
    assert.strictEqual(classifyTier("clicked_book_demo", "click"), "intent");
});

test("classifyTier: an unregistered/custom event with no special name is Micro", () => {
    assert.strictEqual(classifyTier("scroll_depth", undefined), "micro");
    assert.strictEqual(classifyTier("something_custom", "custom"), "micro");
});

test("SALE_KINDS does not include 'lead' or 'click'", () => {
    assert.ok(!SALE_KINDS.includes("lead"));
    assert.ok(!SALE_KINDS.includes("click"));
});

test("AUTO_EVENT_NAMES includes form_submit (it's still auto-collected — just also promoted to Lead by name)", () => {
    assert.ok(AUTO_EVENT_NAMES.has("form_submit"));
});

test("tierCaseSql produces a CASE expression referencing both aliases", () => {
    const sql = tierCaseSql("ace", "d");
    assert.match(sql, /CASE/);
    assert.match(sql, /ace\.name/);
    assert.match(sql, /d\.kind/);
    assert.match(sql, /'lead'/);
    assert.match(sql, /'sale'/);
    assert.match(sql, /'intent'/);
    assert.match(sql, /'micro'/);
});

test("tierCaseSql with no defsAlias still promotes form_submit to lead but can't see kind-based tiers", () => {
    const sql = tierCaseSql("ace", null);
    assert.match(sql, /NULL IN/);
});

test("isHeadlineConversionSql wraps tierCaseSql with an IN ('lead','sale') check", () => {
    const sql = isHeadlineConversionSql("ace", "d");
    assert.match(sql, /IN \('lead','sale'\)/);
});
