// Compliance overview: the header status and "Top fixes" come from the same findings.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { groupTransfersByVendor, complianceFindings, complianceStatus, scanCompliance, vendorTotals, chapterVSummary, issueBreakdownText } from "../api/_transfer-compliance.js";

const host = (service, category, consentPhase, extra = {}) => ({ host: `${service}-${Math.random()}`.toLowerCase(), service, category, consentPhase, dataRegion: "non-eu", ...extra });
const SIGNED = { dpa_status: "signed", mechanism: "dpf", mechanism_confirmed_at: "2026-11-01" };
const status = (transfers, records = {}, phaseKnown = true) => {
    const findings = complianceFindings(groupTransfersByVendor(transfers), records, { phaseKnown });
    return complianceStatus(findings, { phaseKnown }).level;
};

test("status: advertising or analytics before consent is critical", () => {
    assert.strictEqual(status([host("Ads", "advertising", "pre")], { Ads: SIGNED }), "critical");
    assert.strictEqual(status([host("Stats", "analytics", "pre")], { Stats: SIGNED }), "critical");
});

test("status: a missing DPA or mechanism without tracking before consent needs attention", () => {
    assert.strictEqual(status([host("Ads", "advertising", "post")], { Ads: { mechanism: "dpf" } }), "attention");
    assert.strictEqual(status([host("Ads", "advertising", "post")], { Ads: { dpa_status: "signed" } }), "attention");
    assert.strictEqual(status([host("Cdn", "cdn", "pre")], { Cdn: { dpa_status: "signed" } }), "attention");
});

test("status: healthy only when nothing is open", () => {
    assert.strictEqual(status([host("Ads", "advertising", "post")], { Ads: SIGNED }), "healthy");
    assert.strictEqual(status([host("Eu", "cdn", "pre", { dataRegion: "eu" })], { Eu: { dpa_status: "signed" } }), "healthy");
});

test("status: never healthy on missing data", () => {
    assert.strictEqual(scanCompliance({ error: "No scan" }, {}).level, "unknown");
    assert.strictEqual(scanCompliance(null, {}).level, "unknown");
    assert.strictEqual(status([host("Ads", "advertising", undefined)], { Ads: SIGNED }, false), "unknown");
});

test("status: a scan that found no third parties is healthy", () => {
    assert.strictEqual(scanCompliance({ scanned_at: "2026-11-03", pre_consent_transfers: [], pre_consent_cookies: [] }, {}).level, "healthy");
});

test("the issue count adds up to the findings", () => {
    const s = scanCompliance({ scanned_at: "2026-11-03", consent_phase_known: true, pre_consent_transfers: [host("Ads", "advertising", "pre"), host("Cdn", "cdn", "post")] }, {});
    assert.strictEqual(s.count, s.findings.length);
    assert.deepStrictEqual({ ...s.breakdown }, { consent: 1, mechanism: 2, dpa: 2, unconfirmed: 0 });
});

test("top fixes: consent, then no mechanism, then DPA; most hosts first", () => {
    const transfers = [
        host("NoDpa", "cdn", "post", { dataRegion: "eu" }),
        host("NoMech", "cdn", "post"),
        host("Small", "analytics", "pre"),
        host("Big", "advertising", "pre"), host("Big", "advertising", "pre"), host("Big", "advertising", "post"),
    ];
    const records = { NoMech: { dpa_status: "signed" }, Small: SIGNED, Big: SIGNED };
    const findings = complianceFindings(groupTransfersByVendor(transfers), records, { phaseKnown: true });
    assert.deepStrictEqual(findings.map((f) => `${f.kind}:${f.vendor}`), ["consent:Big", "consent:Small", "mechanism:NoMech", "dpa:NoDpa"]);
    assert.strictEqual(findings[0].title, "Big loads 2 hosts before consent");
    assert.strictEqual(findings[1].title, "Small loads 1 host before consent");
});

test("the issue count reconciles with the summary line", () => {
    const vendors = groupTransfersByVendor([
        host("Ads", "advertising", "pre"), host("Stats", "analytics", "pre"),
        host("Cdn", "cdn", "pre"), host("Cmp", "cmp", "pre", { dataRegion: "eu" }),
        host("Late", "advertising", "post", { transferMechanism: "Standard Contractual Clauses" }),
    ]);
    const records = {};
    const findings = complianceFindings(vendors, records, { phaseKnown: true });
    const { breakdown, count } = complianceStatus(findings);
    const summary = chapterVSummary(vendors, records);
    assert.strictEqual(vendorTotals(vendors).preConsent, 4);
    assert.strictEqual(breakdown.consent, 2); // only tracking vendors are a consent issue
    assert.strictEqual(breakdown.mechanism, summary.problem);
    assert.strictEqual(breakdown.unconfirmed, summary.unconfirmed);
    assert.strictEqual(breakdown.dpa, summary.withoutDpa);
    assert.strictEqual(count, breakdown.consent + summary.problem + summary.unconfirmed + summary.withoutDpa);
});

test("the tooltip spells out the sum", () => {
    assert.strictEqual(issueBreakdownText({ consent: 10, mechanism: 5, unconfirmed: 12, dpa: 18 }), "10 tracking before consent + 5 no transfer mechanism + 12 mechanism unconfirmed + 18 no confirmed DPA. One vendor can have several issues.");
    assert.strictEqual(issueBreakdownText({ consent: 0, mechanism: 0, unconfirmed: 0, dpa: 0 }), "No open issues in the latest scan.");
});
