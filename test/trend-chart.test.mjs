// Tests for docs/design-audit-plan.md Phase 2 item 7: TrendLineChart.js's
// niceTicks() (fixes skipped/uneven Y-axis ticks) and zeroFillSeries()
// (fixes both the Avg/day bug and sparse-data-as-connected-line). Same
// text-extraction approach as every other test here — TrendLineChart.js
// is a React component file (JSX, relies on the global React), not
// importable directly under plain Node.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
    path.join(__dirname, "..", "src", "Pages", "Analytics", "TrendLineChart.js"),
    "utf8"
);

function extractFunctionSource(src, name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `function ${name}() not found in TrendLineChart.js`);
    const parenStart = src.indexOf("(", start);
    let pDepth = 0, j = parenStart;
    for (; j < src.length; j++) {
        if (src[j] === "(") pDepth++;
        else if (src[j] === ")") {
            pDepth--;
            if (pDepth === 0) { j++; break; }
        }
    }
    const braceStart = src.indexOf("{", j);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i);
}

function loadFn(name) {
    const fnSrc = extractFunctionSource(SRC, name).replace(/^export\s+/, "");
    const ctx = vm.createContext({ Number, Math, Map, Date });
    // zeroFillSeries calls toIsoDate(), imported from _shared.js in the
    // real file — stub it with the same YYYY-MM-DD logic rather than
    // pulling in the whole module (which needs browser globals).
    ctx.toIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };
    return vm.runInContext(`(${fnSrc})`, ctx);
}

const niceTicks = loadFn("niceTicks");
const zeroFillSeries = loadFn("zeroFillSeries");

// Both functions build arrays/objects inside the vm realm, which have a
// different Array.prototype/Object.prototype than this file's — strict
// deepStrictEqual fails on that prototype mismatch even when every value
// matches (same gotcha as test/kpi-card.test.mjs, one level deeper here
// since Array.prototype.map on a vm-realm array produces another vm-realm
// array). A JSON round-trip strips the foreign prototype before comparing.
const plain = (x) => JSON.parse(JSON.stringify(x));

// ── niceTicks ────────────────────────────────────────────────────────────

test("niceTicks(5) produces evenly-spaced [0,1,2,3,4,5] — the exact skipped-tick example from the design brief (old logic produced [0,1,3,4,5])", () => {
    assert.deepStrictEqual(plain(niceTicks(5)), [0, 1, 2, 3, 4, 5]);
});

test("niceTicks never skips or duplicates a step for a round number", () => {
    const ticks = niceTicks(100);
    for (let i = 1; i < ticks.length; i++) {
        assert.strictEqual(ticks[i] - ticks[i - 1], ticks[1] - ticks[0], "all steps must be equal");
    }
});

test("niceTicks covers the full data range — the last tick is always >= maxVal", () => {
    for (const maxVal of [5, 41, 413, 4100, 41000, 7, 999]) {
        const ticks = niceTicks(maxVal);
        assert.ok(ticks[ticks.length - 1] >= maxVal, `${maxVal} not covered by ${ticks}`);
    }
});

test("niceTicks(0) and negative values fall back to a sane two-tick axis instead of a single [0]", () => {
    assert.deepStrictEqual(plain(niceTicks(0)), [0, 1]);
    assert.deepStrictEqual(plain(niceTicks(-5)), [0, 1]);
});

test("niceTicks always starts at 0", () => {
    for (const maxVal of [3, 17, 250, 9829]) {
        assert.strictEqual(niceTicks(maxVal)[0], 0);
    }
});

// ── zeroFillSeries ───────────────────────────────────────────────────────

test("zeroFillSeries is a no-op when fromDate/toDate aren't provided — backward compatible with any caller that doesn't pass them", () => {
    const series = [{ date: "2026-10-01", num: 5 }];
    assert.strictEqual(zeroFillSeries(series, null, null), series);
});

test("zeroFillSeries fills gaps with explicit zeros — the direct fix for sparse-data-as-connected-line", () => {
    const series = [
        { date: "2026-10-01", num: 9 },
        { date: "2026-10-03", num: 3 },
    ];
    const result = zeroFillSeries(series, new Date(2026, 9, 1), new Date(2026, 9, 3));
    assert.deepStrictEqual(plain(result.map(r => [r.date, r.num])), [
        ["2026-10-01", 9],
        ["2026-10-02", 0],
        ["2026-10-03", 3],
    ]);
});

test("zeroFillSeries produces exactly one entry per calendar day in range — the direct fix for Avg/day dividing by active days only", () => {
    // 9 total / 3 active days (the old bug) should become 9 / 30 days once
    // zero-filled, per the design brief's own example.
    const series = [
        { date: "2026-09-27", num: 4 },
        { date: "2026-10-05", num: 3 },
        { date: "2026-10-20", num: 2 },
    ];
    const result = zeroFillSeries(series, new Date(2026, 8, 27), new Date(2026, 9, 26));
    assert.strictEqual(result.length, 30);
    const total = result.reduce((s, r) => s + r.num, 0);
    assert.strictEqual(total, 9);
    assert.strictEqual(Math.round((total / result.length) * 10) / 10, 0.3);
});

test("zeroFillSeries handles an empty series by returning all zeros across the range, not an empty array", () => {
    const result = zeroFillSeries([], new Date(2026, 9, 1), new Date(2026, 9, 2));
    assert.deepStrictEqual(plain(result.map(r => [r.date, r.num])), [
        ["2026-10-01", 0],
        ["2026-10-02", 0],
    ]);
});

test("zeroFillSeries handles a single-day range", () => {
    const result = zeroFillSeries([{ date: "2026-10-05", num: 7 }], new Date(2026, 9, 5), new Date(2026, 9, 5));
    assert.deepStrictEqual(plain(result.map(r => [r.date, r.num])), [["2026-10-05", 7]]);
});
