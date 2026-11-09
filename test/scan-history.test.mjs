// The list of cookie scans: who can see which, and what each row reports.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { listScans, scanDomainList } from "../api/pre-consent-scans.js";
import { addScanDeltas, formatScanDelta, staleScanDays } from "../api/_scan-history.js";
import { scanConsentStep } from "../api/_consent-phase.js";

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
    assert.deepStrictEqual({ ...scans[0], scanned_at: undefined }, { id: 9, domain: "a.com", scanned_at: undefined, vendors_found: 3, consent_step: "accepted", source: "automatic", phase_known: true, transfers: 1, cookies: 1, cookies_found: 2, trackers: 1 });
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
