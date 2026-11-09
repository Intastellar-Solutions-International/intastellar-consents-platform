// PDF reports: what the findings claim, and that scan strings cannot inject HTML.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { buildReportHtml, dailySeries, summarizeScan, scanFindings, auditFindings } from "../api/_report-html.js";

const NOW = new Date("2026-11-09T12:00:00Z");
const scan = (over = {}) => ({
    scanned_at: "2026-11-08T12:00:00Z", consent_phase_known: true,
    pre_consent_transfers: [
        { service: "Meta Pixel", host: "a.net", category: "advertising", dataRegion: "us", consentPhase: "pre" },
        { service: "Late Ads", host: "b.net", category: "advertising", dataRegion: "eu", consentPhase: "post" },
    ],
    pre_consent_cookies: [], ...over,
});
const base = { domain: "a.com", fromDate: "2026-11-01", toDate: "2026-11-03", generatedAt: NOW, excludeBots: true, countries: [] };

test("report: a day without records is 0 decisions and has no rate", () => {
    const s = dailySeries([{ date: "2026-11-01", num: 4, accepted: 50 }], "2026-11-01", "2026-11-02");
    assert.deepStrictEqual(s.map((d) => [d.num, d.rate]), [[4, 50], [0, null]]);
});

test("report: only what loaded before consent counts when the phase is known", () => {
    const s = summarizeScan(scan(), NOW.getTime());
    assert.deepStrictEqual(s.trackers, ["Meta Pixel"]);
    assert.strictEqual(s.transfers.length, 1);
    assert.strictEqual(scanFindings(s)[0].severity, "danger");
});

test("report: an older scan without phases is not called a before-consent finding", () => {
    const f = scanFindings(summarizeScan(scan({ consent_phase_known: false }), NOW.getTime()));
    assert.strictEqual(f[0].severity, "warning");
    assert.match(f[0].title, /found in the latest scan/);
});

test("report: a stale or missing scan is flagged", () => {
    const stale = scanFindings(summarizeScan(scan({ scanned_at: "2026-10-01T12:00:00Z" }), NOW.getTime()));
    assert.ok(stale.some((f) => /out of date/.test(f.title)));
    assert.match(scanFindings(null)[0].title, /No completed cookie scan/);
});

test("report: audit findings report gaps in the records", () => {
    const f = auditFindings({ ...base, scan: null, consent: { dailyNum: [{ date: "2026-11-01", num: 2 }], interactions_number: { decline: 1 } } });
    assert.match(f[0].title, /2 days/);
});

test("report: every report renders with no scan and with empty consent data", () => {
    for (const type of ["audit", "summary", "snapshot"]) {
        assert.match(buildReportHtml(type, { ...base, scan: null, consent: { dailyNum: 0 } }), /<!doctype html>/);
    }
});

test("report: strings from a scan are escaped", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const html = buildReportHtml("snapshot", { ...base, scan: scan({ pre_consent_transfers: [{ service: evil, host: evil, category: "advertising", consentPhase: "pre" }] }) });
    assert.ok(!html.includes(evil));
    assert.ok(html.includes("&lt;img"));
});

test("report: every report carries the embedded logo", () => {
    for (const type of ["audit", "summary", "snapshot"]) {
        assert.match(buildReportHtml(type, { ...base, scan: null, consent: { dailyNum: 0 } }), /<img class="brand" src="data:image\/svg\+xml;base64,/);
    }
});
