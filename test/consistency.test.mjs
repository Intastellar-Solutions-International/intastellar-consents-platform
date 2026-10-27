// Tests for docs/analytics-audit-plan.md item 12: cross-tab consistency of
// currency formatting (formatCurrency) and number formatting (formatCount)
// in src/Pages/Analytics/_shared.js. Extracted from the file as text rather
// than imported as a module: _shared.js pulls in a long chain of
// browser-only dependencies (React globals, window.ReactRouterDOM, chart
// libs, etc.) that don't run in plain Node — same reason as
// test/foreign-domains-banner.test.mjs.
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

    // Skip past the parameter list first — formatCurrency/formatCount both
    // destructure an options object with a default value (`{ cents = false }
    // = {}`), which contains its own braces that would otherwise be mistaken
    // for the function body's opening brace.
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

function extractConstSource(src, name) {
    const marker = `export const ${name} = {`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `const ${name} not found in _shared.js`);
    const braceStart = src.indexOf("{", start);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i).replace(/^export\s+/, "") + ";";
}

function loadFn(name) {
    const fnSrc = extractFunctionSource(SRC, name);
    const constSrc = extractConstSource(SRC, "CURRENCY_SYMBOLS");
    const ctx = vm.createContext({ Number, Math });
    vm.runInContext(constSrc, ctx);
    return vm.runInContext(`(${fnSrc})`, ctx);
}

const formatCurrency = loadFn("formatCurrency");
const formatCount = loadFn("formatCount");

// ── formatCurrency ───────────────────────────────────────────────────────

test("formatCurrency formats EUR with de-DE decimal comma, no space before symbol", () => {
    assert.strictEqual(formatCurrency(49.99, "EUR"), "€49,99");
});

test("formatCurrency uses de-DE thousands separator for larger amounts", () => {
    assert.strictEqual(formatCurrency(1234.5, "EUR"), "€1.234,50");
});

test("formatCurrency cents:true divides by 100 before formatting (ConversionAttribution.js's value_cents case)", () => {
    assert.strictEqual(formatCurrency(4999, "EUR", { cents: true }), "€49,99");
});

test("formatCurrency uses a trailing-space 'kr ' prefix for DKK/SEK/NOK, matching the other symbol currencies' spacing convention", () => {
    assert.strictEqual(formatCurrency(100, "DKK"), "kr 100,00");
    assert.strictEqual(formatCurrency(100, "SEK"), "kr 100,00");
    assert.strictEqual(formatCurrency(100, "NOK"), "kr 100,00");
});

test("formatCurrency falls back to the currency code + space for an unmapped currency", () => {
    assert.strictEqual(formatCurrency(10, "XYZ"), "XYZ 10,00");
});

test("formatCurrency falls back to no symbol when currency is missing entirely", () => {
    assert.strictEqual(formatCurrency(10, undefined), "10,00");
});

test("formatCurrency treats a null/undefined amount as zero rather than throwing", () => {
    assert.strictEqual(formatCurrency(null, "EUR"), "€0,00");
    assert.strictEqual(formatCurrency(undefined, "EUR"), "€0,00");
});

// ── formatCount ──────────────────────────────────────────────────────────

test("formatCount uses de-DE thousands separator, not the English-style comma", () => {
    assert.strictEqual(formatCount(1234), "1.234");
});

test("formatCount leaves sub-1000 values unformatted (no separator needed)", () => {
    assert.strictEqual(formatCount(999), "999");
});

test("formatCount rounds fractional values", () => {
    assert.strictEqual(formatCount(1234.6), "1.235");
});

test("formatCount abbreviate:true uses de-DE comma decimal for the 'k' suffix (the item 12 bug: BandLineChart.fmtY() used an English-style period, e.g. '1.1k', right next to de-DE numbers elsewhere on the same dashboard)", () => {
    assert.strictEqual(formatCount(1234, { abbreviate: true }), "1,2k");
});

test("formatCount abbreviate:true does not abbreviate below the 1000 threshold", () => {
    assert.strictEqual(formatCount(999, { abbreviate: true }), "999");
});

test("formatCount abbreviate:true handles negative values using the magnitude threshold", () => {
    assert.strictEqual(formatCount(-1500, { abbreviate: true }), "-1,5k");
});

test("formatCount returns an em dash for null/undefined/non-finite input instead of 'NaN'", () => {
    assert.strictEqual(formatCount(null), "—");
    assert.strictEqual(formatCount(undefined), "—");
    assert.strictEqual(formatCount(NaN), "—");
    assert.strictEqual(formatCount(Infinity), "—");
});
