// Home trend chart: laying dailyNum out over the requested range.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "consentTrend.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);
const { buildTrendPoints, linePath, decisionSplit } = ctx;

// Arrays from the vm context have another prototype than this file's.
const list = (points, field) => Array.from(points, (p) => p[field]);

test("trend: days without decisions are 0 volume and have no acceptance rate", () => {
    const points = buildTrendPoints(
        [{ date: "2026-11-01", num: 10, accepted: 80, previousPeriod: { date: "2026-10-01", num: 8, accepted: 70 } },
         { date: "2026-11-03", num: 4, accepted: 50, previousPeriod: { date: "2026-10-03", num: 2 } }],
        "2026-11-01", "2026-11-03"
    );
    assert.deepStrictEqual(list(points, "key"), ["2026-11-01", "2026-11-02", "2026-11-03"]);
    assert.deepStrictEqual(list(points, "num"), [10, 0, 4]);
    assert.deepStrictEqual(list(points, "rate"), [80, null, 50]);
    assert.deepStrictEqual(list(points, "prevRate"), [70, null, null]);
    assert.deepStrictEqual(list(points, "prevNum"), [8, 0, 2]);
});

test("trend: an API without daily rates leaves every rate null", () => {
    const points = buildTrendPoints([{ date: "2026-11-01", num: 3 }], "2026-11-01", "2026-11-01");
    assert.strictEqual(points[0].rate, null);
});

test("trend: hourly rows are kept as they arrive", () => {
    const points = buildTrendPoints([{ date: "2026-11-01 09:00:00", num: 2, accepted: 50 }], "2026-11-01", "2026-11-01", "hour");
    assert.strictEqual(points.length, 1);
    assert.strictEqual(points[0].key, "2026-11-01 09:00:00");
    assert.strictEqual(points[0].rate, 50);
});

test("trend: a null breaks the line, and an isolated value still draws", () => {
    const same = (v) => v;
    assert.strictEqual(linePath([1, 2, null, 3], same, same), "M0.00 1.00 L1.00 2.00 M3.00 3.00 L3.00 3.00");
    assert.strictEqual(linePath([null, 2, null], same, same), "M1.00 2.00 L1.00 2.00");
});

const splitOf = (consent) => Object.fromEntries(Array.from(decisionSplit(consent).segments, (s) => [s.key, s]));

test("decision split: accepted, custom and denied cover every decision", () => {
    const s = splitOf({ Total: 820, interactions_number: { accept: 625, decline: 193 } });
    assert.strictEqual(s.custom.count, 2);
    assert.ok(Math.abs(s.accepted.percent + s.custom.percent + s.denied.percent - 100) < 1e-9);
});

test("decision split: custom is never negative and no data is all zeros", () => {
    assert.strictEqual(splitOf({ Total: 5, interactions_number: { accept: 4, decline: 4 } }).custom.count, 0);
    const empty = decisionSplit({ Total: 0 });
    assert.strictEqual(empty.total, 0);
    assert.deepStrictEqual(Array.from(empty.segments, (s) => s.percent), [0, 0, 0]);
});
