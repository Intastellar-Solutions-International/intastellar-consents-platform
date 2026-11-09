// Stage 4 / Compliance: scanned hosts are grouped into vendors for the table.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { groupTransfersByVendor, vendorTotals } from "../api/_transfer-compliance.js";
import { classifyHost, isEuHostedHost, reclassifyStoredTransfer } from "../api/_scan-core.js";

const group = (t, meta) => groupTransfersByVendor(t, meta);

const META = { analytics: { risk: "medium" }, advertising: { risk: "high" }, cdn: { risk: "low" } };
const clarity = ["u", "a", "r", "t", "f", "e", "b", "n", "q"].map((s) => ({ host: `${s}.clarity.ms`, service: "Microsoft Clarity", category: "analytics", dataRegion: "non-eu" }));

test("all *.clarity.ms hosts become one Microsoft Clarity vendor", () => {
    const v = group(clarity, META);
    assert.strictEqual(v.length, 1);
    assert.strictEqual(v[0].vendor, "Microsoft Clarity");
    assert.strictEqual(v[0].hosts.length, 9);
    assert.strictEqual(v[0].risk, "medium");
});

test("vendor region: all EU, none EU, or mixed", () => {
    const [eu] = group([{ host: "a", service: "S", dataRegion: "eu" }, { host: "b", service: "S", dataRegion: "eu" }], META);
    const [mixed] = group([{ host: "a", service: "S", dataRegion: "eu" }, { host: "b", service: "S", dataRegion: "non-eu" }], META);
    const [none] = group([{ host: "a", service: "S" }], META);
    assert.deepStrictEqual([eu.region, mixed.region, none.region], ["eu", "mixed", "non-eu"]);
});

test("VWO's numbered hosts roll up into one vendor, including scans stored before the fix", () => {
    const stored = ["r1eu01", "r3eu01"].map((s) => ({ host: `${s}.visualwebsiteoptimizer.com`, service: `${s}.visualwebsiteoptimizer.com`, category: "third-party" }));
    const [vwo, ...rest] = group(stored.map(reclassifyStoredTransfer));
    assert.strictEqual(rest.length, 0);
    assert.strictEqual(vwo.vendor, "VWO");
    assert.strictEqual(vwo.category, "analytics");
    assert.strictEqual(classifyHost("dev.visualwebsiteoptimizer.com").service, "VWO");
});

test("a non-EU company serving from the EU is EU-hosted, unless another host leaves the EU", () => {
    for (const host of ["r1eu01.visualwebsiteoptimizer.com", "js-eu1.hs-banner.com", "js-eu1.hsleadflows.net"]) assert.ok(isEuHostedHost(host), host);
    for (const host of ["dev.visualwebsiteoptimizer.com", "r1.visualwebsiteoptimizer.com"]) assert.ok(!isEuHostedHost(host), host);
    const host = (dataRegion, hostedInEU) => ({ host: `h${dataRegion}${hostedInEU}`, service: "S", dataRegion, hostedInEU });
    assert.strictEqual(group([host("non-eu", true)])[0].region, "eu-hosted");
    assert.strictEqual(group([host("non-eu", true), host("eu", false)])[0].region, "eu-hosted");
    assert.strictEqual(group([host("non-eu", true), host("non-eu", false)])[0].region, "mixed");
});

test("tiles and the summary line add up to the table", () => {
    const vendors = group([...clarity, { host: "x", service: "Ads", category: "advertising", dataRegion: "non-eu", consentPhase: "pre" }, { host: "e", service: "EU", category: "cdn", dataRegion: "eu" }, { host: "h", service: "H", category: "analytics", hostedInEU: true }], META);
    const t = vendorTotals(vendors);
    assert.strictEqual(t.vendors, vendors.length);
    assert.strictEqual(Object.values(t.byCategory).reduce((a, b) => a + b, 0), vendors.length);
    assert.strictEqual(t.hosts, 12);
    assert.strictEqual(t.outsideEu, 2);
    assert.strictEqual(t.preConsent, 1);
    assert.strictEqual(t.preConsentTracking, 1);
});

test("a vendor takes its riskiest host's category; hosts without a service stand alone", () => {
    const v = group([
        { host: "x.ads.com", service: "Ads Co", category: "cdn" },
        { host: "y.ads.com", service: "Ads Co", category: "advertising" },
        { host: "lonely.example" },
    ], META);
    assert.strictEqual(v.find((x) => x.vendor === "Ads Co").category, "advertising");
    assert.strictEqual(v.find((x) => x.vendor === "Ads Co").risk, "high");
    assert.ok(v.find((x) => x.vendor === "lonely.example"));
});

test("details come from the first host that has them", () => {
    const [v] = group([{ host: "a", service: "S" }, { host: "b", service: "S", privacyUrl: "https://s/privacy", dataCountry: "US", purposes: ["ads"] }], META);
    assert.strictEqual(v.privacyUrl, "https://s/privacy");
    assert.deepStrictEqual(v.dataCountries, ["US"]);
    assert.deepStrictEqual(v.purposes, ["ads"]);
});

test("vendor consent phase: pre if any host loaded before consent, post if all after, else unknown", () => {
    const phaseOf = (...phases) => group(phases.map((p, i) => ({ host: `h${i}`, service: "S", consentPhase: p })), META)[0].consentPhase;
    assert.strictEqual(phaseOf("post", "pre"), "pre");
    assert.strictEqual(phaseOf("post", "post"), "post");
    assert.strictEqual(phaseOf(undefined), null);       // scan made before phase tagging
    assert.strictEqual(phaseOf("post", undefined), null);
});

test("one company reads the same across its products, including scans stored before the fix", () => {
    for (const service of ["Google Marketing Platform", "Google Inc.", "Google LLC", "Google Reviews"]) {
        const t = reclassifyStoredTransfer({ host: "x.example", service, category: "advertising", transferMechanism: null });
        assert.strictEqual(t.transferMechanism, "EU-US Data Privacy Framework", service);
    }
    assert.strictEqual(reclassifyStoredTransfer({ host: "a", service: "HubSpot Cookie Banner", category: "cmp" }).transferMechanism, "EU-US Data Privacy Framework");
    assert.strictEqual(reclassifyStoredTransfer({ host: "a", service: "Unknown Co", category: "third-party" }).transferMechanism, undefined);
});

test("before consent: CMPs, fonts and CDNs are counted apart from tracking", () => {
    const pre = (service, category) => ({ host: service, service, category, consentPhase: "pre" });
    const t = vendorTotals(group([pre("Ads", "advertising"), pre("GA", "analytics"), pre("CMP", "cmp"), pre("Fonts", "cdn"), pre("Static", "functional")]));
    assert.strictEqual(t.preConsent, 5);
    assert.strictEqual(t.preConsentTracking, 2);
});

test("Seora is an EU vendor, including in scans stored before the fix", () => {
    assert.strictEqual(classifyHost("app.seora.dk").dataRegion, "eu");
    const stored = reclassifyStoredTransfer({ host: "app.seora.dk", service: "Seora", category: "analytics", dataRegion: "non-eu", transferMechanism: "EEA" });
    assert.strictEqual(stored.dataRegion, "eu");
    assert.strictEqual(group([stored])[0].region, "eu");
    assert.strictEqual(reclassifyStoredTransfer({ host: "a", service: "Meta Pixel", category: "advertising", dataRegion: "non-eu" }).dataRegion, "non-eu");
});
