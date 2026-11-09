// Compliance overview: the DSR card counts open, due-soon and overdue requests.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ctx = vm.createContext({ Date });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "dsrSummary.js"), "utf8").replace(/^export /gm, "") + "\n;this.dsrSummary = dsrSummary;", ctx);
const NOW = Date.parse("2026-11-09T12:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

test("dsr summary: open, due within 7 days, overdue; completed requests don't count", () => {
    const out = ctx.dsrSummary([
        { status: "pending", submitted: ago(25), regulation: "GDPR" },
        { status: "in_progress", submitted: ago(31), regulation: "GDPR" },
        { status: "pending", submitted: ago(2), regulation: "GDPR" },
        { status: "completed", submitted: ago(60), regulation: "GDPR" },
    ], { GDPR: 30 }, NOW);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), { open: 3, dueSoon: 1, overdue: 1 });
});

test("dsr summary: uses the regulation's deadline, 30 days otherwise", () => {
    assert.strictEqual(ctx.dsrSummary([{ status: "pending", submitted: ago(35), regulation: "CCPA" }], { CCPA: 45 }, NOW).overdue, 0);
    assert.strictEqual(ctx.dsrSummary([{ status: "pending", submitted: ago(35), regulation: "OTHER" }], { CCPA: 45 }, NOW).overdue, 1);
});
