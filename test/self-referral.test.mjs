// Tests api/_self-referral.js — the shared self-referral SQL fragment used
// by every referrer/channel query (docs/analytics-audit-plan.md item 2).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { isValidHostname, selfReferralClause, noiseReferralClause, SPAM_REFERRER_DOMAINS } from "../api/_self-referral.js";

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

test("noiseReferralClause includes the evidenced spam domain from the live audit", () => {
    assert.ok(SPAM_REFERRER_DOMAINS.includes("everydaydealsnow.com"));
    const clause = noiseReferralClause();
    assert.match(clause, /everydaydealsnow\.com/);
});

test("noiseReferralClause covers the dev/local patterns mirrored from isDevOrLocalHost in api/a.js", () => {
    const clause = noiseReferralClause();
    assert.match(clause, /'localhost'/);
    assert.match(clause, /'0\.0\.0\.0'/);
    assert.match(clause, /%\.local/);
    assert.match(clause, /\^127\\\./);
});

test("noiseReferralClause uses a custom column name when given one", () => {
    const clause = noiseReferralClause("ae.referrer_host");
    assert.match(clause, /coalesce\(ae\.referrer_host,''\)/);
});
