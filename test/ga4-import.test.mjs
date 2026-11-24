// Google Analytics 4 history import (api/_ga4-import.js).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { gaDate, parseReport, chunkStart, monthsBetween, importStep, importedHistory, GA4_EARLIEST } from "../api/_ga4-import.js";

test("ga4 import: GA4 dates and report rows parse", () => {
    assert.equal(gaDate("20261105"), "2026-11-05");
    assert.equal(gaDate("202611"), "2026-11-01");
    assert.equal(gaDate("(other)"), null);
    const rows = parseReport("channel", { rows: [{ dimensionValues: [{ value: "20261105" }, { value: "Organic Search" }], metricValues: ["12", "10", "30", "8", "2", "99.5"].map((value) => ({ value })) }] });
    assert.deepEqual(rows[0], { report: "channel", day: "2026-11-05", dim: "Organic Search", sessions: 12, users: 10, pageviews: 30, engaged_sessions: 8, key_events: 2, revenue: 99.5 });
});

test("ga4 import: chunks are whole calendar months, never before GA4's first day", () => {
    assert.equal(chunkStart("2026-11-23"), "2026-09-01");
    assert.equal(chunkStart("2026-02-28"), "2025-12-01", "across a year boundary");
    assert.equal(chunkStart("2015-09-30"), GA4_EARLIEST);
    assert.deepEqual(monthsBetween("2026-09-01", "2026-11-23").map((m) => `${m.start}..${m.end}`),
        ["2026-09-01..2026-09-30", "2026-10-01..2026-10-31", "2026-11-01..2026-11-23"]);
});

// Fake GA4: data on every day from 2026-03-10 to 2026-10-15.
const FIRST = "2026-03-10", LAST = "2026-10-15";
function fakeGa4() {
    const calls = [];
    const fetchImpl = async (url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push(body);
        const { startDate, endDate } = body.dateRanges[0];
        const rows = [];
        const monthly = body.dimensions[0].name === "yearMonth";
        for (let d = new Date(startDate); d.toISOString().slice(0, 10) <= endDate; d = new Date(d.getTime() + 864e5)) {
            const iso = d.toISOString().slice(0, 10);
            if (iso < FIRST || iso > LAST) continue;
            const key = monthly ? iso.slice(0, 7).replace("-", "") : iso.replace(/-/g, "");
            if (monthly && rows.some((r) => r.dimensionValues[0].value === key)) continue;
            rows.push({ dimensionValues: [{ value: key }, ...(body.dimensions[1] ? [{ value: monthly ? "/" : "x" }] : [])], metricValues: ["5", "4", "9", "3", "0", "0"].map((value) => ({ value })) });
        }
        return { ok: true, text: async () => JSON.stringify({ rows, rowCount: rows.length }) };
    };
    return { calls, fetchImpl };
}
// Fake database holding one import state row and counting saved rows.
function fakeDb({ leaseTaken = false } = {}) {
    let state = null;
    const saved = [];
    return {
        saved, get state() { return state; },
        async query(sql, params = []) {
            if (/CREATE TABLE/.test(sql)) return { rows: [] };
            if (/MIN\(received_at\)/.test(sql)) return { rows: [{ d: "2026-09-01" }] };
            if (/INSERT INTO analytics_imports/.test(sql)) {
                state = { status: "running", cursor_day: params[4], tracking_start: params[5], first_day: params[6], rows_imported: 0, oldest_day: null, newest_day: null };
                return { rows: [] };
            }
            if (/SET lease_until = NOW\(\) \+/.test(sql)) return { rows: state?.status === "running" && !leaseTaken ? [state] : [] };
            if (/INSERT INTO analytics_imported/.test(sql)) { saved.push(...params[3]); return { rows: [] }; }
            if (/SET\s+status = \$3, cursor_day/.test(sql)) {
                state = { ...state, status: params[2], cursor_day: params[3], rows_imported: state.rows_imported + params[4],
                    oldest_day: [state.oldest_day, params[5]].filter(Boolean).sort()[0] || null,
                    newest_day: [state.newest_day, params[6]].filter(Boolean).sort().at(-1) || null };
                return { rows: [state] };
            }
            if (/SELECT \* FROM analytics_imports/.test(sql)) return { rows: state ? [state] : [] };
            throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
        },
    };
}
const site = { id: "s1", organisationId: 7, domain: "shop.dk" };
const conn = { account_id: "123", access_token: "t" };

test("ga4 import: walks back month-aligned from the last day with data and stops at the first", async () => {
    const ga = fakeGa4();
    const db = fakeDb();
    let s = await importStep(db, site, conn, { restart: true, today: "2026-11-24", fetchImpl: ga.fetchImpl });
    assert.equal(s.status, "running");
    assert.equal(s.firstDay, FIRST);
    assert.equal(s.trackingStart, "2026-09-01");
    let steps = 1;
    while (s.status === "running") { s = await importStep(db, site, conn, { today: "2026-11-24", fetchImpl: ga.fetchImpl }); steps++; }
    assert.equal(s.status, "done");
    assert.equal(s.oldest, FIRST);
    assert.equal(s.newest, LAST);
    assert.equal(steps, 3, "Aug–Oct, May–Jul, Mar–Apr");
    const totals = db.saved.length; // report names of saved rows
    assert.ok(totals > 0);
    const chunkRanges = ga.calls.filter((c) => c.dimensions.length === 1 && c.dimensions[0].name === "date" && c.metrics.length === 6).map((c) => `${c.dateRanges[0].startDate}..${c.dateRanges[0].endDate}`);
    assert.deepEqual(chunkRanges, ["2026-08-01..2026-10-15", "2026-05-01..2026-07-31", "2026-02-01..2026-04-30"]);
});

test("ga4 import: a property without data, or another tab holding the lease", async () => {
    const empty = { fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ rows: [] }) }) };
    assert.equal((await importStep(fakeDb(), site, conn, { restart: true, today: "2026-11-24", ...empty })).status, "empty");

    const ga = fakeGa4();
    const db = fakeDb();
    await importStep(db, site, conn, { restart: true, today: "2026-11-24", fetchImpl: ga.fetchImpl });
    const busy = await importStep(fakeDbWithState(db.state, true), site, conn, { today: "2026-11-24", fetchImpl: ga.fetchImpl });
    assert.equal(busy.busy, true);
});
function fakeDbWithState(state, leaseTaken) {
    const db = fakeDb({ leaseTaken });
    return { ...db, async query(sql, params) { if (/SELECT \* FROM analytics_imports/.test(sql)) return { rows: [state] }; return db.query(sql, params); } };
}

test("ga4 import: history covers only days before tracking began; tables only for a whole earlier period", async () => {
    const state = { status: "done", oldest_day: "2026-03-10", newest_day: "2026-10-15", tracking_start: "2026-09-01" };
    const db = {
        async query(sql, params) {
            if (/FROM analytics_imports/.test(sql)) return { rows: [state] };
            if (/report = 'total'/.test(sql)) return { rows: [{ date: params[2], sessions: 5, users: 4, pageviews: 9, engaged_sessions: 3, key_events: 0, revenue: 0 }] };
            return { rows: [{ dim: "Organic Search", sessions: 5, users: 4, pageviews: 9 }] };
        },
    };
    const spanning = await importedHistory(db, "s1", "2026-08-01", "2026-09-30");
    assert.equal(spanning.to, "2026-08-31", "stops the day before tracking began");
    assert.equal(spanning.wholePeriod, false);
    assert.equal(spanning.channels, undefined, "no mixed tables");

    const before = await importedHistory(db, "s1", "2026-05-01", "2026-05-31");
    assert.equal(before.wholePeriod, true);
    assert.equal(before.channels[0].dim, "Organic Search");

    assert.equal(await importedHistory(db, "s1", "2026-10-01", "2026-10-31"), null, "after tracking began");
});
