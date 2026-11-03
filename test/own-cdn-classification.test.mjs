// cdn.intastellar.eu is Intastellar Consents' own CDN, not a third-party
// transfer — both in new scans and in scans stored before it was listed.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { classifyHost, reclassifyStoredTransfer } from "../api/_scan-core.js";

test("cdn.intastellar.eu is classified as Intastellar Consents (CMP, EU)", () => {
    assert.deepEqual(classifyHost("cdn.intastellar.eu"), { service: "Intastellar Consents", category: "cmp", dataRegion: "eu", dataCountry: "DK" });
});

test("a stored scan that saw cdn.intastellar.eu as unknown is corrected on read", () => {
    const stored = { host: "cdn.intastellar.eu", service: "intastellar.eu", category: "third-party", bannerCategory: "functional", dataRegion: "non-eu", rdapLookup: true, consentPhase: "pre", resourceType: "script" };
    const t = reclassifyStoredTransfer(stored);
    assert.equal(t.service, "Intastellar Consents");
    assert.equal(t.category, "cmp");
    assert.equal(t.bannerCategory, "necessary");
    assert.equal(t.dataRegion, "eu");
    assert.equal(t.rdapLookup, false);
    // Scan facts are kept.
    assert.equal(t.consentPhase, "pre");
    assert.equal(t.resourceType, "script");
});

test("stored classifications that were already known, and unknown hosts, are left as stored", () => {
    const known = { host: "cdn.intastellar.eu", service: "Custom name", category: "functional" };
    assert.equal(reclassifyStoredTransfer(known), known);
    const unknown = { host: "x.unknown-vendor.net", category: "third-party" };
    assert.equal(reclassifyStoredTransfer(unknown), unknown);
});
