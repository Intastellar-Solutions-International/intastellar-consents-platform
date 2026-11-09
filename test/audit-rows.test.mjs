// Compliance overview: the audit log sample reads as evidence.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ctx = vm.createContext({ JSON, String, Array, Infinity });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "Components", "AuditSnapshotCard", "auditRows.js"), "utf8").replace(/^export /gm, "") + "\n;this.api = { auditRowChoiceSummary, auditRowChoices, consentIdOf, matchesConsentId, sortNewestFirst };", ctx);
const { auditRowChoiceSummary, auditRowChoices, consentIdOf, matchesConsentId, sortNewestFirst } = ctx.api;
const plain = (x) => JSON.parse(JSON.stringify(x));
const row = (consent, extra = {}) => ({ consent: JSON.stringify(consent), ...extra });

test("audit rows: choices list the accepted and declined categories, without Necessary", () => {
    const r = row([{ type: "necessary", checked: true }, { type: "marketing", checked: false }, { type: "statistics", checked: true }]);
    assert.strictEqual(auditRowChoiceSummary(r), "Mixed choices");
    assert.deepStrictEqual(plain(auditRowChoices(r)), { accepted: ["Statistics"], declined: ["Marketing"] });
});

test("audit rows: the consent_type shape is read the same way", () => {
    const r = row([{ consent_type: "marketing", consent_value: "1" }, { consent_type: "functional", consent_value: "0" }]);
    assert.strictEqual(auditRowChoiceSummary(r), "Mixed choices");
    assert.deepStrictEqual(plain(auditRowChoices(r)), { accepted: ["Marketing"], declined: ["Functional"] });
});

test("audit rows: a single recorded choice keeps its summary and unreadable JSON is a dash", () => {
    assert.strictEqual(auditRowChoiceSummary(row([{ consent_type: "all", consent_value: "checked" }])), "Accepted all");
    assert.strictEqual(auditRowChoiceSummary(row([{ consent_type: "all", consent_value: "0" }], { regulation_applied: "CCPA" })), "Opt-out");
    assert.strictEqual(auditRowChoiceSummary({ consent: "not json" }), "—");
    assert.deepStrictEqual(plain(auditRowChoices({ consent: "not json" })), { accepted: [], declined: [] });
});

test("audit rows: consent ID search ignores case and surrounding spaces", () => {
    assert.strictEqual(consentIdOf({ shopify_consent_id: 42 }), "42");
    assert.ok(matchesConsentId({ uid: "cns_8F3A" }, "  8f3a "));
    assert.ok(!matchesConsentId({ uid: "cns_8F3A" }, "zzz"));
});

test("audit rows: newest first, unreadable timestamps last", () => {
    const parse = (s) => (s ? new Date(s) : null);
    const out = sortNewestFirst([{ consents_timestamp: "2026-11-01" }, { consents_timestamp: null }, { consents_timestamp: "2026-11-03" }], parse);
    assert.deepStrictEqual(plain(out.map((r) => r.consents_timestamp)), ["2026-11-03", "2026-11-01", null]);
});
