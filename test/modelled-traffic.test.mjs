// The traffic model behind "Modelled sessions" (api/_modelled-traffic.js).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { modelSessions, modelPageSessions } from "../api/_modelled-traffic.js";
import { withModel } from "../api/analytics-report.js";

test("traffic model: each consenting session stands for 1 ÷ its group's consent rate", () => {
    const strata = [
        { day: "2026-11-01", grp: "search", device: "mobile", full: 25, all: 100 },  // 25 % accept
        { day: "2026-11-01", grp: "none", device: "desktop", full: 50, all: 100 },   // 50 % accept
    ];
    const sessions = [
        { day: "2026-11-01", grp: "search", device: "mobile", channel: "organic", sessions: 10 },
        { day: "2026-11-01", grp: "none", device: "desktop", channel: "direct", sessions: 20 },
    ];
    const m = modelSessions(strata, sessions);
    assert.equal(m.channels.organic.modelled, 40);
    assert.equal(m.channels.direct.modelled, 40);
    assert.equal(m.sessions, 80, "channels add up to the total");
    assert.equal(m.observedSessions, 30);
    assert.equal(m.daily["2026-11-01"], 80);
    assert.equal(m.coverage, 1);
});

test("traffic model: small groups borrow the day's rate, then the site's", () => {
    const strata = [
        { day: "d1", grp: "social", device: "mobile", full: 1, all: 2 },     // too small (50 %)
        { day: "d1", grp: "none", device: "desktop", full: 20, all: 98 },    // day: 21/100
        { day: "d2", grp: "other", device: "mobile", full: 1, all: 5 },      // day d2 too small → site rate
    ];
    const m = modelSessions(strata, [
        { day: "d1", grp: "social", device: "mobile", channel: "referral", sessions: 1 },
        { day: "d2", grp: "other", device: "mobile", channel: "referral", sessions: 1 },
    ]);
    // d1 → 1 / 0.21 ≈ 4.76; d2 → 1 / (22/105) ≈ 4.77
    assert.equal(m.daily.d1, 5);
    assert.equal(m.sessions, 10);
});

test("traffic model: a rate under 5 % is capped, nothing without consenting traffic", () => {
    const m = modelSessions([{ day: "d", grp: "none", device: "mobile", full: 1, all: 1000 }], [{ day: "d", grp: "none", device: "mobile", channel: "direct", sessions: 1 }]);
    assert.equal(m.sessions, 20, "at most 20× per session");
    assert.equal(modelSessions([{ day: "d", grp: "none", device: "mobile", full: 0, all: 50 }], []), null);
    assert.equal(modelSessions([], []), null);
});

test("traffic model: coverage drops when a group had no consenting views", () => {
    const m = modelSessions([
        { day: "d", grp: "none", device: "desktop", full: 10, all: 30 },
        { day: "d", grp: "social", device: "mobile", full: 0, all: 70 },
    ], []);
    assert.equal(m.coverage, 0.3);
});

test("traffic model: pages scale by their own counted ratio", () => {
    assert.equal(modelPageSessions({ allViews: 300, fullViews: 100, fullSessions: 40 }, 0.5), 120);
    assert.equal(modelPageSessions({ allViews: 10, fullViews: 5, fullSessions: 4 }, 0.25), 16, "few views → site rate");
    assert.equal(modelPageSessions({ allViews: 50, fullViews: 0, fullSessions: 0 }, 0.5), null, "only anonymous views");
});

test("traffic model: the estimator shows the model's numbers when it ran", () => {
    const impact = { consentRate: 25, observedSessions: 50, estimatedTrue: 200, dailyEstimates: [{ date: "d1", estimated: 9 }] };
    assert.equal(withModel(impact, null).method, "site-rate");
    const out = withModel(impact, { method: "stratified-v1", sessions: 180, observedSessions: 45, coverage: 0.987, daily: { d1: 7 } });
    assert.equal(out.estimatedTrue, 180);
    assert.equal(out.observedSessions, 45);
    assert.equal(out.coverage, 98.7);
    assert.deepEqual(out.dailyEstimates, [{ date: "d1", estimated: 7 }]);
});
