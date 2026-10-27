// Tests computeConsentImpact() in api/analytics-report.js — the exact bug
// behind the 27.3% (KPI) vs 0.3% (estimator) discrepancy from
// docs/analytics-audit-plan.md item 6.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { computeConsentImpact } from "../api/analytics-report.js";

test("computeConsentImpact returns consentRate on the same 0-100 percent scale as totals.consentRate", () => {
    // Real asasoftware.aero shape: 2684 full / 9838 total.
    const impact = computeConsentImpact({ full_count: 2684, total: 9838, unique_sessions: 3544 }, []);
    assert.strictEqual(impact.consentRate, 27.3);
});

test("computeConsentImpact does not regress to a raw 0-1 fraction", () => {
    const impact = computeConsentImpact({ full_count: 1, total: 2, unique_sessions: 10 }, []);
    // A naive full/total would be 0.5 — must be percent-scaled to 50.
    assert.strictEqual(impact.consentRate, 50);
    assert.notStrictEqual(impact.consentRate, 0.5);
});

test("computeConsentImpact handles zero total events without dividing by zero", () => {
    const impact = computeConsentImpact({ full_count: 0, total: 0, unique_sessions: 0 }, []);
    assert.strictEqual(impact.consentRate, 0);
    assert.strictEqual(impact.estimatedTrue, null);
});

test("computeConsentImpact's estimatedTrue uses the fraction (not the percent) as a divisor", () => {
    // 50 observed sessions at a 25% consent rate implies ~200 true sessions.
    const impact = computeConsentImpact({ full_count: 25, total: 100, unique_sessions: 50 }, []);
    assert.strictEqual(impact.consentRate, 25);
    assert.strictEqual(impact.estimatedTrue, 200);
});

test("computeConsentImpact's dailyEstimates fall back to the period rate when a day has no events", () => {
    const impact = computeConsentImpact(
        { full_count: 25, total: 100, unique_sessions: 50 },
        [{ date: "2026-10-01", full_count: 0, minimal: 0 }]
    );
    assert.strictEqual(impact.dailyEstimates[0].estimated, 0);
});
