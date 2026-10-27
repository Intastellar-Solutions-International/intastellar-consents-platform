// Tests for docs/design-audit-plan.md Phase 1 item 8: KpiCard's new
// deltaSentiment() helper — the invertible status-color logic the design
// brief asks for ("down = good for bounce rate"). Extracted from
// _shared.js as text rather than imported as a module — same reason as
// test/consistency.test.mjs: the file pulls in browser-only globals.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
    path.join(__dirname, "..", "src", "Pages", "Analytics", "_shared.js"),
    "utf8"
);

function extractFunctionSource(src, name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `function ${name}() not found in _shared.js`);
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

const fnSrc = extractFunctionSource(SRC, "deltaSentiment");
const deltaSentiment = vm.runInContext(`(${fnSrc})`, vm.createContext({}));

// assert.deepStrictEqual can't be used on the returned object directly:
// deltaSentiment runs inside a separate vm realm, so the plain object it
// returns has a different Object.prototype than one built in this file —
// deepStrictEqual's strict-mode prototype check fails even when every
// field matches. Comparing the primitive fields individually sidesteps it.

test("deltaSentiment: a rising value with no invert is good (e.g. sessions up)", () => {
    const { isUp, isGood } = deltaSentiment({ value: 12 });
    assert.strictEqual(isUp, true);
    assert.strictEqual(isGood, true);
});

test("deltaSentiment: a falling value with no invert is bad (e.g. sessions down)", () => {
    const { isUp, isGood } = deltaSentiment({ value: -5 });
    assert.strictEqual(isUp, false);
    assert.strictEqual(isGood, false);
});

test("deltaSentiment: a falling value WITH invert is good — the exact bounce-rate case from docs/design-audit-plan.md", () => {
    const { isUp, isGood } = deltaSentiment({ value: -8.1, invert: true });
    assert.strictEqual(isUp, false);
    assert.strictEqual(isGood, true);
});

test("deltaSentiment: a rising value WITH invert is bad (bounce rate getting worse)", () => {
    const { isUp, isGood } = deltaSentiment({ value: 8.1, invert: true });
    assert.strictEqual(isUp, true);
    assert.strictEqual(isGood, false);
});

test("deltaSentiment: the arrow direction (isUp) never changes based on invert — only the color sentiment does", () => {
    const a = deltaSentiment({ value: 5, invert: false });
    const b = deltaSentiment({ value: 5, invert: true });
    assert.strictEqual(a.isUp, b.isUp);
    assert.notStrictEqual(a.isGood, b.isGood);
});

test("deltaSentiment: zero counts as \"up\" (matches the existing trend prop's >= 0 convention)", () => {
    const { isUp, isGood } = deltaSentiment({ value: 0 });
    assert.strictEqual(isUp, true);
    assert.strictEqual(isGood, true);
});
