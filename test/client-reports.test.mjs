// Agency Pro client reports: which sites a scheduled-report config covers,
// the per-domain email, and the server-side plan check that gates them.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { resolveReportSites, buildReportData, buildReportEmailHtml } from "../api/_scheduled-report.js";
import { organisationHasPlan } from "../api/_stripe.js";

// Records every query and answers from `answer(sql, params)`.
function fakeDb(answer = () => []) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => { calls.push({ sql, params }); return { rows: answer(sql, params) || [] }; },
    };
}

test("client report resolves only the organisation's own active sites, by lowercased domain", async () => {
    const db = fakeDb(() => [{ id: "s1", domain: "a.com" }, { id: "s2", domain: "b.com" }]);
    const out = await resolveReportSites(db, { workspace_id: "7", organisation_id: 12, domains: ["A.com", "b.com"] });
    assert.deepStrictEqual(out, { siteIds: ["s1", "s2"], domains: ["a.com", "b.com"] });
    assert.match(db.calls[0].sql, /organisation_id = \$1 AND LOWER\(domain\) = ANY\(\$2\) AND active = true/);
    assert.deepStrictEqual(db.calls[0].params, [12, ["a.com", "b.com"]]);
});

test("single-site report still resolves by site_id", async () => {
    const db = fakeDb(() => [{ id: "s9", domain: "c.com" }]);
    const out = await resolveReportSites(db, { site_id: "s9", organisation_id: 12 });
    assert.deepStrictEqual(out, { siteIds: ["s9"], domains: ["c.com"] });
    assert.deepStrictEqual(db.calls[0].params, ["s9"]);
});

test("report data queries every site and breaks totals down per domain", async () => {
    const db = fakeDb((sql) => {
        if (/SELECT id, domain FROM analytics_sites/.test(sql)) return [{ id: "s1", domain: "a.com" }, { id: "s2", domain: "b.com" }];
        if (/prev_sessions/.test(sql)) return [
            { site_id: "s1", total: 10, full_count: 5, sessions: 4, prev_sessions: 2 },
            { site_id: "s2", total: 40, full_count: 30, sessions: 20, prev_sessions: 20 },
        ];
        if (/GROUP BY ace.site_id/.test(sql)) return [{ site_id: "s2", conversions: 3 }];
        if (/GROUP BY site_id, pathname/.test(sql)) return [{ site_id: "s2", pathname: "/pricing", views: 9 }];
        return [];
    });
    const data = await buildReportData(db, ["s1", "s2"], 7);
    const eventQueries = db.calls.filter(c => /FROM analytics_events/.test(c.sql));
    assert.ok(eventQueries.length > 0);
    for (const c of eventQueries) {
        assert.doesNotMatch(c.sql, /site_id = \$1/, "single-site filter left in a query");
        assert.deepStrictEqual(c.params[0], ["s1", "s2"]);
    }
    assert.deepStrictEqual(data.perDomain.map(d => [d.domain, d.sessions, d.consentRate, d.conversions]), [
        ["b.com", 20, 75, 3],
        ["a.com", 4, 50, 0],
    ]);
    assert.strictEqual(data.perDomain[1].sessionsTrend, 100);
    assert.strictEqual(data.topPages[0].pathname, "b.com/pricing");
});

test("a one-site report has no per-domain breakdown and plain paths", async () => {
    const db = fakeDb((sql) => {
        if (/SELECT id, domain FROM analytics_sites/.test(sql)) return [{ id: "s1", domain: "a.com" }];
        if (/GROUP BY site_id, pathname/.test(sql)) return [{ site_id: "s1", pathname: "/", views: 1 }];
        return [];
    });
    const data = await buildReportData(db, "s1", 7);
    assert.deepStrictEqual(data.perDomain, []);
    assert.strictEqual(data.topPages[0].pathname, "/");
    assert.ok(!db.calls.some(c => /prev_sessions/.test(c.sql)));
});

const DATA = {
    from: "2026-10-28", to: "2026-11-03",
    totals: { events: 1, sessions: 24, engagedUsers: 3, consentRate: 70, conversions: 3 },
    trends: {},
    topPages: [{ pathname: "/<script>", views: 2 }], topCountries: [], topReferrers: [], topConversion: null, revenue: null,
    perDomain: [
        { domain: "b.com", sessions: 20, sessionsTrend: 0, consentRate: 75, conversions: 3 },
        { domain: "a.com", sessions: 4, sessionsTrend: 100, consentRate: 50, conversions: 0 },
    ],
};

test("client report email names the client, counts its domains and lists each one", () => {
    const html = buildReportEmailHtml({ domain: "a.com", frequency: "weekly", label: null, data: DATA, clientName: "Acme & Co" });
    assert.match(html, /Acme &amp; Co · 2 domains · Last 7 days/);
    assert.match(html, /By domain/);
    assert.ok(html.indexOf("b.com") < html.indexOf("a.com"), "busiest domain first");
});

test("report email escapes labels and visitor-supplied paths", () => {
    const html = buildReportEmailHtml({ domain: "a.com", frequency: "weekly", label: "<b>x</b>", data: { ...DATA, perDomain: [] } });
    assert.ok(!html.includes("<script>") && !html.includes("<b>x</b>"));
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.doesNotMatch(html, /By domain/);
});

test("organisationHasPlan compares the current plan against the minimum", async () => {
    const withPlan = (plan) => fakeDb((sql) => (/FROM billing_subscriptions/.test(sql) ? [{ plan, status: "active" }] : []));
    assert.strictEqual(await organisationHasPlan(withPlan("agency-pro"), 5, "agency-pro"), true);
    assert.strictEqual(await organisationHasPlan(withPlan("growth"), 5, "agency-pro"), false);
    assert.strictEqual(await organisationHasPlan(withPlan("growth"), 5, "growth"), true);
    assert.strictEqual(await organisationHasPlan(fakeDb(), 5, "growth"), false);
    assert.strictEqual(await organisationHasPlan(fakeDb(), 1, "agency-pro"), true, "Intastellar's own organisation");
});
