// Custom dimensions and segments: tracker payload sanitising (api/a.js),
// the report's dimension filter (api/analytics-report.js) and the
// dimensions list (api/analytics-dimensions.js).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { readFileSync } from "node:fs";
import { sanitizeDims } from "../api/_dims.js";
import { dimensionClause } from "../api/analytics-report.js";
import { groupDimensions, VALUES_PER_KEY } from "../api/analytics-dimensions.js";

test("dimensions: at most 5 valid keys, short string values, no e-mail addresses", () => {
    const out = JSON.parse(sanitizeDims({ plan: "pro", Bad: "x", "with space": "x", logged_in: true, email: "jane@example.com", n: 42, obj: { x: 1 }, a: "1", b: "2", c: "3" }));
    assert.deepEqual(out, { plan: "pro", logged_in: "true", n: "42", a: "1", b: "2" });
    assert.equal(JSON.parse(sanitizeDims({ long: "x".repeat(300) })).long.length, 100);
    assert.equal(sanitizeDims({ empty: "  " }), null);
    assert.equal(sanitizeDims(["plan"]), null);
    assert.equal(sanitizeDims("plan=pro"), null);
});

// a.js itself needs Node 18+ to import; its tracker source is checked as text
// (the added code has no backslashes, so source and shipped script match).
const EMBED_SCRIPT = readFileSync(new URL("../api/a.js", import.meta.url), "utf8");

test("dimensions: the tracker exposes set() and sends dims with full page views only", () => {
    assert.match(EMBED_SCRIPT, /window\.intaAnalytics=\{track:track,set:setDim\}/);
    assert.match(EMBED_SCRIPT, /if\(!\/\^\[a-z0-9_\]\+\$\/\.test\(k\)\)return;/, "key check in the tracker");
    const minimal = EMBED_SCRIPT.slice(EMBED_SCRIPT.indexOf("function sendMinimal"), EMBED_SCRIPT.indexOf("function sendFull"));
    assert.doesNotMatch(minimal, /_dims/, "anonymous page views never carry dimensions");
});

test("dimensions: the segment clause quotes the value and rejects bad keys", () => {
    assert.equal(dimensionClause("plan", "pro"), "custom_dims->>'plan' = 'pro'");
    assert.equal(dimensionClause("plan", "x'); DROP TABLE analytics_events;--"), "custom_dims->>'plan' = 'x''); DROP TABLE analytics_events;--'");
    assert.equal(dimensionClause("plan'--", "x"), null);
    assert.equal(dimensionClause("Plan", "x"), null);
    assert.equal(dimensionClause("plan", ""), null);
    assert.equal(dimensionClause("plan", "x".repeat(101)), null);
});

test("dimensions: grouped per key, most used first, values capped", () => {
    const rows = [
        { key: "plan", value: "free", pageviews: "10", sessions: "4" },
        { key: "plan", value: "pro", pageviews: "30", sessions: "9" },
        { key: "logged_in", value: "yes", pageviews: "100", sessions: "20" },
        ...Array.from({ length: 30 }, (_, i) => ({ key: "type", value: `t${i}`, pageviews: String(i), sessions: "1" })),
    ];
    const out = groupDimensions(rows);
    assert.deepEqual(out.map((d) => d.key), ["type", "logged_in", "plan"]);
    assert.deepEqual(out[2].values.map((v) => v.value), ["pro", "free"]);
    assert.equal(out[0].values.length, VALUES_PER_KEY);
});
