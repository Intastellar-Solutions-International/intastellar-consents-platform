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
const plan = (facts, opts) => ctx.onboardingSteps({ domains: 0, records: 0, verified: 0, scans: 0, reports: 0, ...facts }, "gdpr", opts);
const required = (p) => p.steps.filter((s) => !s.optional && !s.locked);

test("onboarding: a new account has nothing done and starts with its domain", () => {
    const p = plan({});
    assert.strictEqual(p.completed, 0);
    assert.strictEqual(p.steps[0].next, true);
    assert.strictEqual(p.steps.filter((s) => s.next).length, 1);
});

test("onboarding: each step follows its own data and next moves on", () => {
    const p = plan({ domains: 1, records: 4 });
    assert.deepStrictEqual(Array.from(required(p), (s) => s.done), [true, true, false, false, false, false, false]);
    assert.strictEqual(p.steps.find((s) => s.next).id, "verify");
});

test("onboarding: all required steps done leaves no next step, optional ones don't block", () => {
    const p = plan({ domains: 1, records: 1, verified: 1, scans: 1, reports: 1, analyticsSites: 1, sitesWithEvents: 1 });
    assert.strictEqual(p.completed, p.total);
    assert.ok(!p.steps.some((s) => s.next));
    assert.ok(p.steps.some((s) => s.optional && !s.done), "ads/conversion stay open but optional");
});

test("onboarding: shared + consent + analytics tracks, analytics steps follow analytics data", () => {
    const p = plan({ domains: 1, analyticsSites: 1 });
    assert.deepStrictEqual([...new Set(Array.from(p.steps, (s) => s.track))], ["shared", "consent", "analytics"]);
    assert.strictEqual(p.steps.find((s) => s.id === "analytics-enable").done, true);
    assert.strictEqual(p.steps.find((s) => s.id === "analytics-data").done, false);
});

test("onboarding: without Analytics on the plan its track is locked and not counted", () => {
    const p = plan({ domains: 1, records: 1, verified: 1, scans: 1, reports: 1 }, { analytics: false });
    assert.ok(p.steps.filter((s) => s.track === "analytics").every((s) => s.locked));
    assert.strictEqual(p.completed, p.total);
    assert.strictEqual(p.total, 5);
});

test("onboarding: every step links inside the platform or to a section of the page", () => {
    for (const s of plan({}).steps) assert.ok(s.to.startsWith("/") || s.to.startsWith("#"), s.id);
});
