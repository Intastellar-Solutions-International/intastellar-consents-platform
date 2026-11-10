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
const inDays = (days) => new Date(NOW + days * 86400000).toISOString();

test("dsr summary: open, due within 7 days, overdue; closed requests don't count", () => {
    const out = ctx.dsrSummary([
        { status: "pending", effective_due_at: inDays(5) },
        { status: "in_progress", effective_due_at: inDays(-1) },
        { status: "pending", effective_due_at: inDays(28) },
        { status: "completed", effective_due_at: inDays(-30) },
        { status: "rejected", effective_due_at: inDays(-30) },
    ], NOW);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), { open: 3, dueSoon: 1, overdue: 1 });
});
