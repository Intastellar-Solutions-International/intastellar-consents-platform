// Campaign consent page: cost per consent only counts an ad platform's
// paid channels, and small samples never get an alarming arrow.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "src/Pages/Reports/MarketingReport/CampaignConsentParts.js"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/^export (const|function)/gm, "$1");
const ctx = vm.createContext({
    t: (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]),
    formatNumber: String,
    formatPercent: (n) => `${n}%`,
    isLowDataCount: (a, b) => Math.max(a, b) < 30,
    isLowDataRate: (a, b) => Math.min(a, b) < 30,
});
// Stop before CHOICES and the JSX components.
vm.runInContext(src.slice(0, src.indexOf("const CHOICES")) + "\nthis.api = { adCostByPlatform, platformForChannel, countDelta, rateDelta };", ctx);
const { adCostByPlatform, platformForChannel, countDelta, rateDelta } = ctx.api;

test("campaign consent: cost per consent ignores organic channels of the same brand", () => {
    const overview = [
        { channel: "Google Ads", consents: 100, acceptAll: 40 },
        { channel: "Google", consents: 900, acceptAll: 500 },              // organic search
        { channel: "Facebook Ads", consents: 50, acceptAll: 10 },
        { channel: "Instagram Ads", consents: 30, acceptAll: 6 },
        { channel: "Facebook (Organic)", consents: 400, acceptAll: 100 },
    ];
    const costs = adCostByPlatform([
        { platform: "google_ads", amount: 200, currency: "EUR" },
        { platform: "meta_ads", amount: 80, currency: "EUR" },
    ], overview);
    assert.equal(costs.google_ads.consents, 100);
    assert.equal(costs.google_ads.acceptAll, 40);
    assert.equal(costs.meta_ads.consents, 80, "Facebook Ads + Instagram Ads only");
    assert.equal(platformForChannel("Google"), null);
    assert.equal(platformForChannel("Instagram Ads"), "meta_ads");
});

test("campaign consent: small samples say 'too little data' instead of a % change", () => {
    assert.equal(countDelta(3, 9).lowData, true);
    const d = countDelta(120, 100);
    assert.equal(Math.round(d.value), 20);
    assert.equal(d.goodWhen, "up");
    assert.equal(countDelta(80, 100, "down").goodWhen, "down");
    assert.equal(rateDelta(40, 50, 10, 12).lowData, true);
    assert.equal(rateDelta(42.5, 40, 200, 180).value, 2.5);
});
