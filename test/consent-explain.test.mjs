// Consent → revenue (api/_banner-experiment.js) and "What changed"
// (api/_explain.js).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "./_harness.mjs";
import { cleanBannerRef, consentRevenue, compareVariants } from "../api/_banner-experiment.js";
import { explainChange, periods } from "../api/_explain.js";

test("consent revenue: attributable vs declined conversions and the +5 points estimate", () => {
    const r = consentRevenue(
        [{ consent_level: "full", conversions: "40", revenue_cents: "400000", currency: "EUR" }, { consent_level: "minimal", conversions: "60", revenue_cents: "600000" }],
        { full: "400", total: "1000" },
    );
    assert.deepEqual(r.conversions, { total: 100, attributable: 40, unattributed: 60, attributableShare: 0.4 });
    assert.equal(r.revenue.currency, "EUR");
    // 40 attributable at 40 % consent → +5 points ≈ +5 conversions, ≈ +500 €
    assert.deepEqual(r.whatIf, { points: 5, conversions: 5, revenue: 500 });
    const capped = consentRevenue([{ consent_level: "full", conversions: "10" }, { consent_level: "minimal", conversions: "1" }], { full: "10", total: "100" }, { points: 50 });
    assert.equal(capped.whatIf.conversions, 1, "never more than the unattributed conversions");
    assert.equal(consentRevenue([], { full: 0, total: 0 }).whatIf, null);
});

test("consent revenue: banner variants compared with the control per 1,000 page views", () => {
    const [exp] = compareVariants(
        [{ banner_exp: "e1", banner_variant: "control", total: "1000", full: "500" }, { banner_exp: "e1", banner_variant: "b", total: "1000", full: "560" }],
        [{ banner_exp: "e1", banner_variant: "control", conversions: "20", attributable: "10", revenue_cents: "10000" }, { banner_exp: "e1", banner_variant: "b", conversions: "20", attributable: "12", revenue_cents: "12000" }],
    );
    const [control, b] = exp.variants;
    assert.equal(control.isControl, true);
    assert.equal(b.attributablePer1k, 12);
    assert.equal(Math.round(b.vsControl.consentRatePoints * 10) / 10, 6);
    assert.equal(Math.round(b.vsControl.attributablePer1kPct), 20);
    assert.equal(b.smallSample, false);
    const [noControl] = compareVariants([{ banner_exp: "e2", banner_variant: "x", total: "50", full: "5" }, { banner_exp: "e2", banner_variant: "y", total: "300", full: "30" }], []);
    assert.equal(noControl.variants[0].variant, "y", "without a 'control', the variant with most traffic");
    assert.equal(noControl.variants[1].smallSample, true);
});

test("consent revenue: banner ids are validated; the tracker sends them on every path", () => {
    assert.equal(cleanBannerRef("exp-42"), "exp-42");
    assert.equal(cleanBannerRef("variant b"), null);
    assert.equal(cleanBannerRef("x".repeat(65)), null);
    const tracker = readFileSync(new URL("../api/a.js", import.meta.url), "utf8");
    assert.match(tracker, /window\.INTA\.experimentVariant/);
    assert.equal((tracker.match(/var be=bannerExp\(\);/g) || []).length, 3, "minimal page view, full page view, event");
});

test("what changed: names the channel × device behind a drop and what offset it", () => {
    const r = explainChange({ current: 600, previous: 1000 }, {
        channel: [{ value: "paid_social", current: 100, previous: 450 }, { value: "organic", current: 350, previous: 250 }, { value: "direct", current: 150, previous: 300 }],
        device: [{ value: "mobile", current: 200, previous: 550 }, { value: "desktop", current: 400, previous: 450 }],
        channel_device: [{ value: "paid_social|mobile", current: 40, previous: 370 }],
        page: [], country: [],
    });
    assert.equal(r.meaningful, true);
    assert.equal(r.pct, -40);
    assert.deepEqual([r.headline.dimension, r.headline.value], ["channel_device", "paid_social|mobile"], "the precise combination when it explains nearly as much");
    assert.equal(r.offset.value, "organic");
    assert.equal(Math.round(r.headline.share * 100), 83);
});

test("what changed: small changes aren't explained; periods have equal length", () => {
    assert.equal(explainChange({ current: 1010, previous: 1000 }, { channel: [] }).meaningful, false);
    assert.equal(explainChange({ current: 15, previous: 0 }, { channel: [] }).meaningful, false);
    assert.deepEqual(periods("2026-11-01", "2026-11-30"), { prevFrom: "2026-10-02", from: "2026-11-01", toExclusive: "2026-12-01", days: 30 });
});
