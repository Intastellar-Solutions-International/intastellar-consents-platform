// Live view's 30-minute chart: which bar an interaction lands in.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Components", "LiveView", "liveInteractionTimestamp.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);
const buckets = (events) => Array.from(ctx.liveMinuteBuckets(events));

test("live view: the newest minute is the last bar", () => {
    const b = buckets([{ minutes: 0.2 }, { minutes: 29.9 }]);
    assert.strictEqual(b[29], 1, "an interaction seconds ago is counted");
    assert.strictEqual(b[0], 1);
});

test("live view: events outside the window or without a time are ignored", () => {
    assert.strictEqual(buckets([{ minutes: 30 }, { minutes: -1 }, {}]).reduce((a, n) => a + n, 0), 0);
});

test("live view: seconds are used when minutes are missing", () => {
    assert.strictEqual(buckets([{ seconds: 90 }])[28], 1);
});

test("live view: no data gives 30 empty minutes", () => {
    assert.deepStrictEqual(buckets(undefined), Array(30).fill(0));
});
