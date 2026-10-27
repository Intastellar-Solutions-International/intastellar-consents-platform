// Tests the embedded-pageview exclusion rule used throughout
// api/analytics-report.js's queries (item 1 of docs/analytics-audit-plan.md).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { embeddedClause } from "../api/analytics-report.js";

test("embeddedClause(false) excludes embedded pageviews by default", () => {
    assert.strictEqual(embeddedClause(false), "is_embedded = false");
});

test("embeddedClause(true) opts back in (?includeEmbedded=1) with no filter", () => {
    assert.strictEqual(embeddedClause(true), null);
});
