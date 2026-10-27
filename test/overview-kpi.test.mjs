// Tests for docs/analytics-audit-plan.md Phase 2, item 1: the new optional
// "Conversions"/"Conversion rate" Overview KPI cards. totalConversions() is
// extracted from src/Pages/Analytics/index.js as text rather than imported
// as a module — same reason as test/foreign-domains-banner.test.mjs and
// test/consistency.test.mjs: index.js pulls in browser-only globals (React,
// window.ReactRouterDOM) and JSX that don't run in plain Node.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
    path.join(__dirname, "..", "src", "Pages", "Analytics", "index.js"),
    "utf8"
);

function extractFunctionSource(src, name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `function ${name}() not found in index.js`);
    const braceStart = src.indexOf("{", start);
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

const fnSrc = extractFunctionSource(SRC, "totalConversions");
const totalConversions = vm.runInContext(`(${fnSrc})`, vm.createContext({}));

test("totalConversions sums per-event counts across the conversions list", () => {
    const conversions = [
        { name: "purchase", count: 12 },
        { name: "lead", count: 5 },
        { name: "form_submit", count: 3 },
    ];
    assert.strictEqual(totalConversions(conversions), 20);
});

test("totalConversions treats a missing count as zero rather than producing NaN", () => {
    assert.strictEqual(totalConversions([{ name: "purchase" }]), 0);
});

test("totalConversions returns 0 for an empty or missing conversions list", () => {
    assert.strictEqual(totalConversions([]), 0);
    assert.strictEqual(totalConversions(null), 0);
    assert.strictEqual(totalConversions(undefined), 0);
});

test("totalConversions is not deduped by session — it sums raw event counts, same as the Conversions tab", () => {
    // A session that fires the same conversion event twice should count
    // twice here, same as data.totals.convertedSessions is a *different*,
    // session-deduped number used for conversionRate instead.
    const conversions = [{ name: "clicked_book_demo", count: 2 }];
    assert.strictEqual(totalConversions(conversions), 2);
});
