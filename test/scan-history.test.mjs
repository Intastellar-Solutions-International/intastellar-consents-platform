// The list of cookie scans: who can see which, and what each row reports.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { listScans, scanDomainList } from "../api/pre-consent-scans.js";

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
    assert.deepStrictEqual({ ...scans[0], scanned_at: undefined }, { id: 9, domain: "a.com", scanned_at: undefined, phase_known: true, transfers: 1, cookies: 1, cookies_found: 2, trackers: 1 });
});

test("scan list: a scan without stored results still gets a row", async () => {
    const { scans } = await run(fakeDb([{ id: 1, domain: "a.com", scanned_at: "2026-11-08T12:00:00Z", transfers: null, cookies: null }]));
    assert.strictEqual(scans[0].trackers, 0);
});
