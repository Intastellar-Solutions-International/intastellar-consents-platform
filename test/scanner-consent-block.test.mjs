// Item 2 (scanner half): the cookie scanner must not record its own
// IntaAcceptAll() as a visitor consent. Read from source text — importing
// api/_scan-core.js pulls in Chromium.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "api", "_scan-core.js"), "utf8");
const listSrc = SRC.match(/export const CONSENT_RECORDING_URLS = (\[[\s\S]*?\]);/)[1];
const PATTERNS = JSON.parse(listSrc.replace(/,\s*\]/, "]"));

// Chrome's Network.setBlockedURLs wildcard semantics: "*" matches anything.
const matches = (url) => PATTERNS.some((p) =>
    new RegExp("^" + p.split("*").map((s) => s.replace(/[.?+^$()[\]{}|\\/]/g, "\\$&")).join(".*") + "$").test(url));

test("scanner blocks every endpoint where the banner records a visitor's decision", () => {
    // Observed in Chrome when IntaAcceptAll() runs on a live customer site.
    for (const url of [
        "https://www.consentsmanagement.com/api/beacon-collector.php",
        "https://consents.intastellarsolutions.com/api/v1/cookie-events",
        "https://analytics.intastellarsolutions.com/form/collect?x=1",
    ]) assert.ok(matches(url), url);
});

test("scanner block list leaves the site and the banner's own assets alone", () => {
    for (const url of [
        "https://www.example.com/",
        "https://cdn.intastellar.eu/uc-core.js",
        "https://www.intastellarconsents.com/api/cookie-banner?domain=example.com",
    ]) assert.ok(!matches(url), url);
});

test("scanDomain applies the block list before loading the page", () => {
    const blockAt = SRC.indexOf('send("Network.setBlockedURLs", { urls: CONSENT_RECORDING_URLS })');
    const gotoAt = SRC.indexOf("await page.goto(`https://${domain}`");
    assert.ok(blockAt !== -1 && gotoAt !== -1 && blockAt < gotoAt);
});
