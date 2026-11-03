import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { normalizeBannerDomain, originMatchesDomain } from "../api/_banner-domain.js";

test("normalizeBannerDomain gives www/URL/trailing-dot variants one canonical key", () => {
    for (const raw of [
        "example.com", "www.example.com", "WWW.Example.COM", "https://www.example.com/cookies?x=1",
        "http://example.com:8080/", "www.example.com.", " example.com ",
    ]) {
        assert.strictEqual(normalizeBannerDomain(raw), "example.com", raw);
    }
    // Real subdomains are kept — only a leading "www." is stripped.
    assert.strictEqual(normalizeBannerDomain("shop.example.com"), "shop.example.com");
    assert.strictEqual(normalizeBannerDomain(""), "");
    assert.strictEqual(normalizeBannerDomain(undefined), "");
});

test("originMatchesDomain accepts the site, its subdomains and its parent", () => {
    assert.ok(originMatchesDomain("https://example.com", "example.com"));
    assert.ok(originMatchesDomain("https://www.example.com", "example.com"));
    assert.ok(originMatchesDomain("https://shop.example.com/page", "example.com"));
    assert.ok(originMatchesDomain("https://example.com", "shop.example.com"));
});

test("originMatchesDomain rejects other sites, including same-suffix ones", () => {
    assert.ok(!originMatchesDomain("https://evil.com", "example.com"));
    assert.ok(!originMatchesDomain("https://notexample.com", "example.com"));
    // The old "last two labels" check treated these as the same site.
    assert.ok(!originMatchesDomain("https://evil.co.uk", "example.co.uk"));
    assert.ok(!originMatchesDomain("", "example.com"));
});
