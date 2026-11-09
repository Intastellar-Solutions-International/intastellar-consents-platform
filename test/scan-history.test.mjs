// The list of cookie scans: who can see which, and what each row reports.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { listScans, scanDomainList } from "../api/pre-consent-scans.js";
import { addScanDeltas, formatScanDelta, staleScanDays } from "../api/_scan-history.js";
import { scanConsentStep, applyFirstVisit, firstVisitApplies, consentPhaseLabel, filterByConsentPhase } from "../api/_consent-phase.js";
import fs from "node:fs";

function fakeDb(rows = [], total = rows.length) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            return { rows: /COUNT\(\*\)/.test(sql) ? [{ total }] : rows };
        },
    };
}
const run = (db, over = {}) => listScans(db, { organisationId: 7, domains: ["a.com"], ...over });

test("scan list: both the bare and www form of each domain are searched", () => {
    assert.deepStrictEqual(scanDomainList(["WWW.A.com", "a.com", "", "https://b.dk/x"]), ["a.com", "www.a.com", "b.dk", "www.b.dk"]);
});

test("scan list: only completed scans of this organisation or the banner", async () => {
    const db = fakeDb();
    await run(db);
    for (const c of db.calls) {
        assert.match(c.sql, /domain = ANY\(\$1\) AND \(organisation_id = \$2 OR organisation_id IS NULL\) AND status = 'completed'/);
        assert.deepStrictEqual(c.params.slice(0, 2), [["a.com"], 7]);
    }
});

test("scan list: sort and page size cannot inject or exceed their limits", async () => {
    const db = fakeDb();
    await run(db, { sort: "domain; DROP TABLE x", direction: "sideways", pageSize: 100000, page: 2 });
    const list = db.calls.find((c) => /LIMIT/.test(c.sql));
    assert.match(list.sql, /ORDER BY scanned_at DESC, id DESC/);
    assert.deepStrictEqual(list.params.slice(3), [100, 200]);
});

test("scan list: search wildcards are treated as text", async () => {
    const db = fakeDb();
    await run(db, { search: " 100%_A " });
    assert.strictEqual(db.calls[0].params[2], "%100\\%\\_a%");
});

test("scan list: rows count what loaded before consent and leave out our own CMP", async () => {
    const db = fakeDb([{
        id: 9, domain: "a.com", scanned_at: "2026-11-08T12:00:00Z",
        transfers: [
            { host: "www.google-analytics.com", service: "Google Analytics", category: "analytics", consentPhase: "pre" },
            { host: "ads.example", service: "Ads", category: "advertising", consentPhase: "post" },
            { host: "cdn.intastellar.eu", service: "Intastellar Consents", category: "cmp", consentPhase: "pre" },
        ],
        cookies: [{ name: "_ga", consentPhase: "pre" }, { name: "x", consentPhase: "post" }],
    }]);
    const { total, scans } = await run(db);
    assert.strictEqual(total, 1);
    assert.deepStrictEqual({ ...scans[0], scanned_at: undefined }, { id: 9, domain: "a.com", scanned_at: undefined, vendors_found: 3, consent_step: "accepted", source: "automatic", scan_type: "accept_all", scan_region: null, phase_known: true, transfers: 1, cookies: 1, cookies_found: 2, trackers: 1 });
});

test("scan list: a scan without stored results still gets a row", async () => {
    const { scans } = await run(fakeDb([{ id: 1, domain: "a.com", scanned_at: "2026-11-08T12:00:00Z", transfers: null, cookies: null }]));
    assert.strictEqual(scans[0].trackers, 0);
});

const scan = (id, consent_step, vendors_found, cookies_found) => ({ id, consent_step, vendors_found, cookies_found });

test("deltas compare against the previous scan with the same accept step", () => {
    const rows = addScanDeltas([scan(4, "accepted", 22, 31), scan(3, "none", 8, 5), scan(2, "accepted", 19, 33), scan(1, "none", 8, 5)]);
    assert.deepStrictEqual(rows[0].delta, { vendors: 3, cookies: -2 });
    assert.deepStrictEqual(rows[1].delta, { vendors: 0, cookies: 0 });
    assert.strictEqual(rows[2].delta, null);
    assert.strictEqual(rows[3].delta, null);
});

test("delta wording", () => {
    assert.strictEqual(formatScanDelta({ vendors: 3, cookies: -2 }), "+3 vendors, -2 cookies");
    assert.strictEqual(formatScanDelta({ vendors: 1, cookies: 0 }), "+1 vendor");
    assert.strictEqual(formatScanDelta({ vendors: 0, cookies: 0 }), "No change");
    assert.strictEqual(formatScanDelta(null), "No comparable earlier scan");
});

test("a scan row reports its source and accept step", async () => {
    const db = fakeDb([{ id: 1, domain: "a.com", scanned_at: "2026-11-03", has_reject_pass: true, cookies: [], transfers: [
        { host: "a", service: "S", consentPhase: "pre" }, { host: "b", service: "S", consentPhase: "post" },
    ] }]);
    const { scans: [row] } = await run(db);
    assert.strictEqual(row.source, "dashboard");
    assert.strictEqual(row.consent_step, "accepted");
    assert.strictEqual(row.vendors_found, 1);
});

test("accept step: none when everything is pre-consent, unknown without tags", () => {
    assert.strictEqual(scanConsentStep([{ consentPhase: "pre" }], []), "none");
    assert.strictEqual(scanConsentStep([{}], []), "unknown");
    assert.strictEqual(scanConsentStep([], []), "unknown");
});

test("the stale warning needs a 30-day range and a scan over 3 days old", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    assert.strictEqual(staleScanDays("2026-11-03T12:00:00Z", 30, now), 6);
    assert.strictEqual(staleScanDays("2026-11-07T12:00:00Z", 30, now), null);
    assert.strictEqual(staleScanDays("2026-11-03T12:00:00Z", 7, now), null);
});

test("deltas only compare scans of the same type and region", () => {
    const row = (id, scan_type, scan_region, n) => ({ id, scan_type, scan_region, consent_step: "none", vendors_found: n, cookies_found: n });
    const rows = addScanDeltas([row(3, "first_visit", "fra1", 5), row(2, "accept_all", "iad1", 20), row(1, "first_visit", "iad1", 9)]);
    assert.strictEqual(rows[0].delta, null);
    assert.strictEqual(rows[1].delta, null);
});

test("first visit: its results decide what loaded before consent", () => {
    const out = applyFirstVisit(
        [{ host: "a", consentPhase: "pre" }, { host: "b", consentPhase: "pre" }],
        [{ name: "x", domain: "d", consentPhase: "pre" }],
        { transfers: [{ host: "a" }, { host: "only-visit" }], cookies: [{ name: "y", domain: "d" }] },
    );
    assert.deepStrictEqual(out.transfers.map((t) => `${t.host}:${t.consentPhase}`), ["a:pre", "b:post", "only-visit:pre"]);
    assert.deepStrictEqual(out.cookies.map((c) => `${c.name}:${c.consentPhase}`), ["x:post", "y:pre"]);
});

test("first visit: an old one doesn't speak for a newer scan", () => {
    assert.ok(firstVisitApplies("2026-11-09", { scanned_at: "2026-11-05" }));
    assert.ok(!firstVisitApplies("2026-11-09", { scanned_at: "2026-10-01" }));
    assert.ok(!firstVisitApplies("2026-11-09", undefined));
});

test("first visit: the scan list leaves it out unless asked", async () => {
    const hidden = fakeDb();
    await run(hidden);
    assert.match(hidden.calls[0].sql, /first_visit/);
    const shown = fakeDb();
    await run(shown, { includeFirstVisit: true });
    assert.doesNotMatch(shown.calls[0].sql, /first_visit/);
});

test("first visit: every reader of the scan table excludes it", () => {
    for (const file of ["cookie-banner", "cookie-banner-scan", "cron-scan-domains", "pre-consent-transfers", "pre-consent-scans", "pre-consent-scan-public", "_scan-notifications", "ropa"]) {
        assert.match(fs.readFileSync(new URL(`../api/${file}.js`, import.meta.url), "utf8"), /\$\{NOT_FIRST_VISIT\}/, file);
    }
    assert.match(fs.readFileSync(new URL("../api/cron-cleanup-scans.js", import.meta.url), "utf8"), /PARTITION BY domain, status, \$\{SCAN_TYPE\}/);
});

test("cookie filter: narrows by consent phase, all keeps untagged items", () => {
    const items = [{ name: "a", consentPhase: "pre" }, { name: "b", consentPhase: "post" }, { name: "c" }];
    assert.deepStrictEqual(filterByConsentPhase(items, "pre").map((x) => x.name), ["a"]);
    assert.deepStrictEqual(filterByConsentPhase(items, "post").map((x) => x.name), ["b"]);
    assert.strictEqual(filterByConsentPhase(items, "all").length, 3);
});

test("CSV wording says before, after or unknown", () => {
    assert.deepStrictEqual(["pre", "post", undefined].map(consentPhaseLabel), ["Before consent", "After consent", "Unknown"]);
});
