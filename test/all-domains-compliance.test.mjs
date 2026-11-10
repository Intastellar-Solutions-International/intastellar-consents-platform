// Compliance overview with "All domains" selected: one status per domain, issues grouped by vendor.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "allDomainsCompliance.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({ Promise, Array, Math });
vm.runInContext(SRC + "\nthis.out = { combineDomainCompliance, filterDomainCompliance, sortDomains, mapWithLimit };", ctx);
const { combineDomainCompliance, filterDomainCompliance, sortDomains, mapWithLimit } = ctx.out;
const plain = (value) => JSON.parse(JSON.stringify(value));

const status = (level, findings) => {
    const breakdown = { consent: 0, mechanism: 0, dpa: 0, unconfirmed: 0 };
    findings.forEach((f) => { breakdown[f.kind] += 1; });
    return { level, count: findings.length, breakdown, findings };
};
const consentGa = { kind: "consent", vendor: "Google Analytics" };
const dpaGa = { kind: "dpa", vendor: "Google Analytics" };
const dpaMeta = { kind: "dpa", vendor: "Meta" };

test("all domains: worst domains first, then by issue count", () => {
    const out = combineDomainCompliance([
        { domain: "ok.dk", status: status("healthy", []) },
        { domain: "down.dk", status: null },
        { domain: "dpa.dk", status: status("attention", [dpaGa]) },
        { domain: "bad.dk", status: status("critical", [consentGa, dpaGa]) },
        { domain: "noscan.dk", status: status("unknown", []) },
        { domain: "dpa2.dk", status: status("attention", [dpaGa, dpaMeta]) },
    ]);
    assert.deepStrictEqual(out.domains.map((d) => d.domain), ["bad.dk", "dpa2.dk", "dpa.dk", "noscan.dk", "ok.dk", "down.dk"]);
    assert.deepStrictEqual({ ...out.levels }, { critical: 1, attention: 2, healthy: 1, unknown: 1, failed: 1 });
    assert.strictEqual(out.domains.find((d) => d.domain === "down.dk").count, null);
});

test("all domains: one organisation-wide issue is listed once with every domain it affects", () => {
    const out = combineDomainCompliance([
        { domain: "a.dk", status: status("critical", [consentGa, dpaGa]) },
        { domain: "b.dk", status: status("attention", [dpaGa, dpaMeta]) },
        { domain: "c.dk", status: status("attention", [dpaGa]) },
    ]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(out.issues.map((i) => [i.title, i.domains]))), [
        ["Google Analytics loads before consent", ["a.dk"]],
        ["No confirmed DPA with Google Analytics", ["a.dk", "b.dk", "c.dk"]],
        ["No confirmed DPA with Meta", ["b.dk"]],
    ]);
});

test("all domains: pre-consent cookies add up over scanned domains only", () => {
    const out = combineDomainCompliance([
        { domain: "a.dk", status: status("healthy", []), preConsentCookies: 4 },
        { domain: "b.dk", status: status("healthy", []), preConsentCookies: 0 },
        { domain: "c.dk", status: null, preConsentCookies: null },
    ]);
    assert.strictEqual(out.preConsentCookies, 4);
    assert.strictEqual(out.domainsWithCookieCount, 2);
    assert.strictEqual(combineDomainCompliance([{ domain: "c.dk", status: null }]).preConsentCookies, null);
});

const mixed = () => combineDomainCompliance([
    { domain: "bad.dk", status: status("critical", [consentGa, dpaGa]), scannedAt: "2026-11-01" },
    { domain: "worse.dk", status: status("critical", [consentGa, dpaGa, dpaMeta]), scannedAt: "2026-11-09" },
    { domain: "dpa.dk", status: status("attention", [dpaMeta]), scannedAt: "2026-10-01" },
    { domain: "ok.dk", status: status("healthy", []), scannedAt: "2026-11-05" },
    { domain: "noscan.dk", status: status("unknown", []) },
    { domain: "down.dk", status: null },
]);

test("all domains filter: critical keeps critical domains and only their issues", () => {
    const out = filterDomainCompliance(mixed(), { level: "critical" });
    assert.deepStrictEqual(plain(out.domains.map((d) => d.domain)), ["worse.dk", "bad.dk"]);
    assert.deepStrictEqual(plain(out.issues.map((i) => [i.title, i.domains])), [
        ["Google Analytics loads before consent", ["bad.dk", "worse.dk"]],
        ["No confirmed DPA with Google Analytics", ["bad.dk", "worse.dk"]],
        ["No confirmed DPA with Meta", ["worse.dk"]],
    ]);
});

test("all domains filter: not checked covers no scan and failed checks", () => {
    assert.deepStrictEqual(plain(filterDomainCompliance(mixed(), { level: "not_checked" }).domains.map((d) => d.domain)), ["noscan.dk", "down.dk"]);
});

test("all domains filter: search narrows domains and the issues on them", () => {
    const out = filterDomainCompliance(mixed(), { query: " DPA " });
    assert.deepStrictEqual(plain(out.domains.map((d) => d.domain)), ["dpa.dk"]);
    assert.deepStrictEqual(plain(out.issues.map((i) => [i.title, i.domains])), [["No confirmed DPA with Meta", ["dpa.dk"]]]);
    assert.strictEqual(filterDomainCompliance(mixed(), { level: "healthy", query: "bad" }).domains.length, 0);
});

test("all domains sort: by status, issues, date and name", () => {
    const names = (sort) => plain(sortDomains(mixed().domains, sort).map((d) => d.domain));
    assert.deepStrictEqual(names({ key: "level", direction: "asc" }), ["worse.dk", "bad.dk", "dpa.dk", "noscan.dk", "ok.dk", "down.dk"]);
    assert.deepStrictEqual(names({ key: "level", direction: "desc" }), ["down.dk", "ok.dk", "noscan.dk", "dpa.dk", "bad.dk", "worse.dk"]);
    assert.deepStrictEqual(names({ key: "count", direction: "desc" }), ["worse.dk", "bad.dk", "dpa.dk", "noscan.dk", "ok.dk", "down.dk"]);
    assert.deepStrictEqual(names({ key: "scannedAt", direction: "desc" }), ["worse.dk", "ok.dk", "bad.dk", "dpa.dk", "down.dk", "noscan.dk"]);
    assert.deepStrictEqual(names({ key: "scannedAt", direction: "asc" }), ["dpa.dk", "bad.dk", "ok.dk", "worse.dk", "down.dk", "noscan.dk"]);
    assert.deepStrictEqual(names({ key: "domain", direction: "asc" }), ["bad.dk", "down.dk", "dpa.dk", "noscan.dk", "ok.dk", "worse.dk"]);
});

test("all domains: checks run a few at a time and keep their order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithLimit([5, 1, 4, 2, 3, 0, 6], 3, async (ms) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, ms));
        running -= 1;
        return ms * 10;
    });
    assert.deepStrictEqual([...out], [50, 10, 40, 20, 30, 0, 60]);
    assert.ok(peak <= 3);
    assert.deepStrictEqual([...await mapWithLimit([], 3, async () => 1)], []);
});
