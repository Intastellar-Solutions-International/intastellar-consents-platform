// Stage 4 / Compliance: scanned hosts are grouped into vendors for the table.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Pages", "Compliance", "TransferVendors.js"), "utf8");
const fnSrc = SRC.slice(SRC.indexOf("const RISK_RANK"), SRC.indexOf("const REGION_LABEL")).replace(/^export /gm, "");
const ctx = vm.createContext({ Map, Set });
vm.runInContext(fnSrc, ctx);
const group = (t, meta) => JSON.parse(JSON.stringify(ctx.groupTransfersByVendor(t, meta)));

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
