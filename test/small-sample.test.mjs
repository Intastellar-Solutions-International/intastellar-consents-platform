// Small numbers: changes on a tiny base are flagged, real changes aren't.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "smallSample.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);

test("small sample: 3 → 1 users is too little data, 300 → 100 is a real change", () => {
    assert.strictEqual(ctx.isLowDataCount(1, 3), true);
    assert.strictEqual(ctx.isLowDataCount(100, 300), false);
    assert.strictEqual(ctx.isLowDataCount(29, 10), true);
    assert.strictEqual(ctx.isLowDataCount(30, 10), false, "the larger period carries the count");
});

test("small sample: a rate is shaky when either period's base is small", () => {
    assert.strictEqual(ctx.isLowDataRate(500, 12), true, "12 sessions last period");
    assert.strictEqual(ctx.isLowDataRate(500, 400), false);
});

test("small sample: missing values never claim low data", () => {
    assert.strictEqual(ctx.isLowDataCount(null, undefined), false);
    assert.strictEqual(ctx.isLowDataRate(undefined, null), false);
});
