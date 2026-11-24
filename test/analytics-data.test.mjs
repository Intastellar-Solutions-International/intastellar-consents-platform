// Annotations and raw-data export (api/analytics-annotations.js, api/analytics-export.js).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { handleAnnotations } from "../api/analytics-annotations.js";
import { exportPage, DATASETS, PAGE_SIZE } from "../api/analytics-export.js";

const member = { organisationId: 7, email: "me@x.dk" };
// A site "shop.dk" belongs to organisation 7 only.
function fakeDb({ rows = [] } = {}) {
    const calls = [];
    const notes = [];
    return {
        calls, notes,
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (/CREATE TABLE/.test(sql)) return { rows: [] };
            if (/FROM analytics_sites/.test(sql)) return { rows: params[0] === 7 && params[1].toLowerCase() === "shop.dk" ? [{ id: "site1" }] : [] };
            if (/INSERT INTO analytics_annotations/.test(sql)) {
                const n = { id: notes.length + 1, organisation_id: params[0], day: params[2], text: params[3], created_by: params[4], created_at: "now" };
                notes.push(n);
                return { rows: [n] };
            }
            if (/DELETE FROM analytics_annotations/.test(sql)) {
                const i = notes.findIndex((n) => n.id === params[0] && n.organisation_id === params[1]);
                if (i >= 0) notes.splice(i, 1);
                return { rowCount: i >= 0 ? 1 : 0 };
            }
            if (/FROM analytics_annotations/.test(sql)) return { rows: notes.filter((n) => n.day >= params[2] && n.day <= params[3]) };
            return { rows: rows.slice(0, PAGE_SIZE) };
        },
    };
}

test("annotations: add, list in range, delete — only within the member's organisation", async () => {
    const db = fakeDb();
    const add = await handleAnnotations(db, member, { method: "POST", body: { domain: "Shop.dk", day: "2026-11-02", text: "  Campaign started  " } });
    assert.equal(add.status, 200);
    assert.equal(add.body.annotation.text, "Campaign started");
    assert.equal(add.body.annotation.createdBy, "me@x.dk");

    const list = await handleAnnotations(db, member, { method: "GET", query: { domain: "shop.dk", from: "2026-11-01", to: "2026-11-30" } });
    assert.equal(list.body.annotations.length, 1);

    const foreignSite = await handleAnnotations(db, { ...member, organisationId: 8 }, { method: "GET", query: { domain: "shop.dk", from: "2026-11-01", to: "2026-11-30" } });
    assert.equal(foreignSite.status, 404, "another organisation's site");
    const foreignDelete = await handleAnnotations(db, { ...member, organisationId: 8 }, { method: "DELETE", query: { id: "1" } });
    assert.equal(foreignDelete.status, 404, "can't delete another organisation's note");
    assert.equal((await handleAnnotations(db, member, { method: "DELETE", query: { id: "1" } })).status, 200);
});

test("annotations: invalid input is refused", async () => {
    const db = fakeDb();
    const post = (body) => handleAnnotations(db, member, { method: "POST", body: { domain: "shop.dk", ...body } });
    assert.equal((await post({ day: "2026-13-45", text: "x" })).status, 400);
    assert.equal((await post({ day: "2026-11-02", text: "   " })).status, 400);
    assert.equal((await post({ day: "2026-11-02", text: "x".repeat(201) })).status, 400);
    assert.equal((await handleAnnotations(db, member, { method: "GET", query: { domain: "shop.dk" } })).status, 400);
});

test("export: pages of rows with a cursor, scoped to the member's site", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i + 1, time: new Date("2026-11-02T10:00:00Z"), path: "/" }));
    const db = fakeDb({ rows: full });
    const out = await exportPage(db, member, { domain: "shop.dk", from: "2026-11-01", to: "2026-11-30", dataset: "pageviews" });
    assert.equal(out.status, 200);
    assert.equal(out.body.rows.length, PAGE_SIZE);
    assert.equal(out.body.next, String(PAGE_SIZE), "a full page → cursor for the next");
    assert.equal(out.body.rows[0][0], "2026-11-02T10:00:00.000Z");
    const q = db.calls.at(-1);
    assert.deepEqual(q.params, ["site1", "2026-11-01", "2026-12-01", 0], "inclusive end date");
    assert.match(q.sql, /NOT \(is_hosting_ip IS TRUE/, "suspected bots left out by default");

    const last = await exportPage(fakeDb({ rows: [{ id: 1 }] }), member, { domain: "shop.dk", from: "2026-11-01", to: "2026-11-30", dataset: "events", after: "5000" });
    assert.equal(last.body.next, null);
    assert.equal((await exportPage(fakeDb(), { ...member, organisationId: 8 }, { domain: "shop.dk", from: "2026-11-01", to: "2026-11-02", dataset: "pageviews" })).status, 404);
});

test("export: never sends full URLs, ad click ids or network data; bad input refused", async () => {
    const columns = DATASETS.pageviews.columns.map(([, expr]) => expr).join(" ");
    for (const banned of ["url", "gclid", "fbclid", "msclkid", "asn", "as_org", "user_agent"]) {
        assert.ok(!new RegExp(`\\b${banned}\\b`).test(columns), banned);
    }
    const db = fakeDb();
    const q = (extra) => exportPage(db, member, { domain: "shop.dk", from: "2026-11-01", to: "2026-11-30", dataset: "pageviews", ...extra });
    assert.equal((await q({ dataset: "users" })).status, 400);
    assert.equal((await q({ from: "2024-01-01" })).status, 400, "over a year");
    assert.equal((await q({ after: "1; DROP TABLE x" })).status, 400);
});
