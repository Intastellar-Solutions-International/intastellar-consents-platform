// Getting started: a step is only done when the account's data shows it.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "onboardingSteps.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);
const plan = (facts) => ctx.onboardingSteps({ domains: 0, records: 0, verified: 0, scans: 0, reports: 0, ...facts }, "gdpr");

test("onboarding: a new account has nothing done and starts with its domain", () => {
    const p = plan({});
    assert.strictEqual(p.completed, 0);
    assert.strictEqual(p.steps[0].next, true);
    assert.strictEqual(p.steps.filter((s) => s.next).length, 1);
});

test("onboarding: each step follows its own data and next moves on", () => {
    const p = plan({ domains: 1, records: 4 });
    assert.deepStrictEqual(Array.from(p.steps, (s) => s.done), [true, true, false, false, false]);
    assert.strictEqual(p.steps.find((s) => s.next).id, "verify");
});

test("onboarding: all done leaves no next step", () => {
    const p = plan({ domains: 1, records: 1, verified: 1, scans: 1, reports: 1 });
    assert.strictEqual(p.completed, p.total);
    assert.ok(!p.steps.some((s) => s.next));
});

test("onboarding: every step links inside the platform", () => {
    for (const s of plan({}).steps) assert.ok(s.to.startsWith("/"), s.id);
});
