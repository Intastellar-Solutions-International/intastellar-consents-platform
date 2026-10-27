// Tests api/_self-referral.js — the shared self-referral SQL fragment used
// by every referrer/channel query (docs/analytics-audit-plan.md item 2).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { isValidHostname, selfReferralClause } from "../api/_self-referral.js";

test("isValidHostname accepts ordinary hostnames", () => {
    assert.ok(isValidHostname("asasoftware.aero"));
    assert.ok(isValidHostname("book.asasoftware.aero"));
    assert.ok(isValidHostname("a-b.example.com"));
});

test("isValidHostname rejects SQL-injection-shaped input", () => {
    assert.ok(!isValidHostname("a' OR '1'='1"));
    assert.ok(!isValidHostname("a';DROP TABLE analytics_events;--"));
    assert.ok(!isValidHostname(""));
    assert.ok(!isValidHostname(null));
    assert.ok(!isValidHostname(42));
});

test("selfReferralClause with no valid input matches nothing", () => {
    assert.strictEqual(selfReferralClause(null, []), "false");
    assert.strictEqual(selfReferralClause("", []), "false");
});

test("selfReferralClause matches the site's own domain and www-subdomain, strips www before comparing", () => {
    const clause = selfReferralClause("asasoftware.aero", []);
    assert.match(clause, /=\s*'asasoftware\.aero'/);
    assert.match(clause, /LIKE '%\.asasoftware\.aero'/);
});

test("selfReferralClause includes each approved cross-site domain", () => {
    const clause = selfReferralClause("asasoftware.aero", ["book.asasoftware.aero", "new.asasoftware.aero"]);
    assert.match(clause, /'book\.asasoftware\.aero'/);
    assert.match(clause, /'new\.asasoftware\.aero'/);
});

test("selfReferralClause silently drops an invalid approved-domain entry instead of interpolating it raw", () => {
    const clause = selfReferralClause("asasoftware.aero", ["'; DROP TABLE analytics_events; --"]);
    assert.ok(!clause.includes("DROP TABLE"));
});

test("selfReferralClause accepts an array of site domains (portfolio rollup case)", () => {
    const clause = selfReferralClause(["a.com", "b.com"], []);
    assert.match(clause, /'a\.com'/);
    assert.match(clause, /'b\.com'/);
});

test("selfReferralClause uses a custom column name when given one", () => {
    const clause = selfReferralClause("asasoftware.aero", [], "ft.referrer_host");
    assert.match(clause, /coalesce\(ft\.referrer_host,''\)/);
});
