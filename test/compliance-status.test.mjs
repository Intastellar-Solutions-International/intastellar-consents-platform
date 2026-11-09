// Compliance overview: the header status and "Top fixes" come from the same findings.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { groupTransfersByVendor, complianceFindings, complianceStatus, scanCompliance } from "../api/_transfer-compliance.js";

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
