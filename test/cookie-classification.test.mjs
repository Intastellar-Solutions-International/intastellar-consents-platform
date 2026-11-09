// Cookie categories follow the owning vendor, and our scanner may not record
// consent. Read from source: api/_scan-core.js needs Chromium to import.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "api", "_scan-core.js"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/^export default /gm, "")
    .replace(/^export /gm, "")
    .replace(/^const (chromium|puppeteer)\b.*$/gm, "");
const ctx = vm.createContext({ console, URL, setTimeout, Object, Map, Set, Date, fetch: () => {}, AbortSignal, process });
vm.runInContext(SRC + "\n;this.api = { cookieCategory, vendorCategory, isEuHostedHost, COOKIE_VENDOR_HINTS, CONSENT_RECORDING_URLS };", ctx);
const { cookieCategory, vendorCategory, isEuHostedHost, COOKIE_VENDOR_HINTS, CONSENT_RECORDING_URLS } = ctx.api;

test("classification: the cookies from the sample reports get their vendor's category", () => {
    for (const [name, want] of [["_uetsid", "marketing"], ["_uetvid", "marketing"], ["_vwo_uuid", "analytics"], ["_vwo_sn", "analytics"], ["_gid", "analytics"], ["_ga", "analytics"], ["_gat_UA-76750007-4", "analytics"]]) {
        assert.strictEqual(cookieCategory(name), want, name);
    }
});

test("classification: a documented override wins over the vendor", () => {
    assert.strictEqual(cookieCategory("_vwo_consent"), "necessary");
});

test("classification: an unknown cookie is left for the caller to place", () => {
    assert.strictEqual(cookieCategory("some_unknown_cookie"), null);
});

test("classification: the matched host's vendor is only a fallback", () => {
    assert.strictEqual(cookieCategory("_gid", "Some CDN"), "analytics");
});

test("classification: a tracking vendor's cookies always take that vendor's category", () => {
    for (const hint of COOKIE_VENDOR_HINTS) {
        const name = hint.exact || hint.prefix;
        const vendor = vendorCategory(hint.service);
        if (name === "_vwo_consent" || !["marketing", "analytics"].includes(vendor)) continue;
        assert.strictEqual(cookieCategory(name), vendor, name + " (" + hint.service + ")");
    }
});

test("classification: strictly necessary cookies of non-tracking vendors stay necessary", () => {
    assert.strictEqual(cookieCategory("__cf_bm"), "security");
});

test("region: HubSpot's EU hosts are recognised, others are not", () => {
    for (const host of ["js-eu1.hs-scripts.com", "api-eu1.hubspot.com", "js-eu1.hs-banner.com", "track-eu1.hubspot.com"]) assert.ok(isEuHostedHost(host), host);
    for (const host of ["js.hs-scripts.com", "api.hubspot.com", "eu1.evil.example"]) assert.ok(!isEuHostedHost(host), host);
});

test("scanner: the banner's decision endpoint is blocked during scans", () => {
    assert.ok(Array.from(CONSENT_RECORDING_URLS).includes("*://analytics.intastellarsolutions.com/collect*"));
});
