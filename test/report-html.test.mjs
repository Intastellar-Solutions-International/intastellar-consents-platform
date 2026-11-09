// PDF reports: what the findings claim, and that scan strings cannot inject HTML.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { buildReportHtml, dailySeries, summarizeScan, scanFindings, auditFindings, decisionMix, regionTotals, dataChecks, chapterVReport } from "../api/_report-html.js";

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

const consentFixture = () => ({
    Total: 100, Accepted: 70, Declined: 20, Marketing: 75, Functional: 72, Statics: 71, activeUsers: 40,
    interactions_number: { accept: 70, decline: 20, partial: 10, marketing: 75, functional: 72, statics: 71 },
    dailyNum: [{ date: "2026-11-01", num: 40 }, { date: "2026-11-02", num: 35 }, { date: "2026-11-03", num: 25 }],
});
const rows = (list) => list.map(([country, total, accept]) => ({ country, num: { total, accept } }));
const reconciled = () => ({ ...base, scan: null, consent: consentFixture(), countries: rows([["Denmark", 60, 50], ["Norway", 10, 10], ["South Africa", 20, 8], ["Unknown", 10, 2]]) });
const check = (data, label) => dataChecks(data).find((c) => c.label === label).ok;

test("invariant: accepted + essential-only + custom = 100%", () => {
    const m = decisionMix(consentFixture());
    assert.strictEqual(m.partial, 10);
    assert.ok(Math.abs(m.acceptPct + m.essentialPct + m.partialPct - 100) < 1e-9);
});

test("invariant: decision counts are never negative", () => {
    const m = decisionMix({ Total: 5, interactions_number: { accept: 4, decline: 4 } });
    assert.ok(m.partial >= 0 && m.accept >= 0 && m.essential >= 0);
});

test("invariant: daily, country and region sums are checked against the total", () => {
    const good = reconciled();
    for (const label of ["Daily records match the total", "Countries match the total", "Regions match the total", "Decision types cover 100%"]) {
        assert.strictEqual(check(good, label), true, label);
    }
    const r = regionTotals(good.countries);
    assert.strictEqual(r.eea.count + r.nonEea.count + r.unknown.count, good.consent.Total);
});

test("invariant: a mismatch fails the check and becomes a finding", () => {
    const bad = reconciled();
    bad.countries = rows([["Denmark", 968, 700]]);
    assert.strictEqual(check(bad, "Countries match the total"), false);
    assert.ok(auditFindings(bad).some((f) => f.severity === "danger" && /did not reconcile/.test(f.title)));
    bad.countries = reconciled().countries;
    bad.consent.dailyNum.pop();
    assert.strictEqual(check(bad, "Daily records match the total"), false);
});

test("invariant: the outside-EEA rate is computed from its countries", () => {
    const r = regionTotals(rows([["South Africa", 9, 7], ["Singapore", 3, 1], ["Nigeria", 2, 0], ["United Kingdom", 6, 6]]));
    assert.strictEqual(r.nonEea.count, 20);
    assert.strictEqual(r.nonEea.rate, 70);
    assert.strictEqual(regionTotals(rows([["Norway", 4, 3]])).eea.count, 4);
    assert.strictEqual(regionTotals([]).nonEea.rate, null);
});

test("presentation: empty data says so instead of drawing an empty bar", () => {
    const html = buildReportHtml("audit", { ...base, scan: null, countries: [], consent: { Total: 0, dailyNum: 0 } });
    assert.match(html, /No data recorded for this period/);
    assert.doesNotMatch(html, /class="bar"/);
});

test("presentation: methodology, data checks and existing sections are in the audit", () => {
    const html = buildReportHtml("audit", reconciled());
    for (const text of ["Methodology and definitions", "Data checks.", "Bot exclusion: on", "<h2>Scope</h2>", "<h2>Evidence</h2>", "<h2>Limitations</h2>", "Custom choice"]) {
        assert.ok(html.includes(text), text);
    }
});

const pre = (over) => ({ dataRegion: "non-eu", consentPhase: "pre", ...over });
const scanOf = (transfers, cookies = [], extra = {}) => summarizeScan({ scanned_at: "2026-11-08T12:00:00Z", consent_phase_known: true, pre_consent_transfers: transfers, pre_consent_cookies: cookies, ...extra }, NOW.getTime());
const titled = (findings, re) => findings.find((f) => re.test(f.title));

test("findings: analytics before consent is its own Action needed", () => {
    const s = scanOf([pre({ service: "Google Analytics", host: "google-analytics.com", category: "analytics" })], [{ name: "_ga", bannerCategory: "analytics", consentPhase: "pre" }]);
    const f = titled(scanFindings(s), /^Analytics vendors or cookies loaded before consent/);
    assert.strictEqual(f.severity, "danger");
    assert.match(f.detail, /Google Analytics/);
    assert.match(f.detail, /_ga/);
    assert.strictEqual(titled(scanFindings(s), /^No advertising/).severity, "ok");
});

test("findings: any non-necessary cookie before consent is Action needed", () => {
    const s = scanOf([], [{ name: "chat_state", bannerCategory: "functional", consentPhase: "pre" }, { name: "sid", bannerCategory: "necessary", consentPhase: "pre" }]);
    const f = titled(scanFindings(s), /not strictly necessary/);
    assert.strictEqual(f.severity, "danger");
    assert.doesNotMatch(f.detail, /sid/);
});

test("findings: fonts and CDNs, a second CMP and dead tags are flagged as Check", () => {
    const s = scanOf([pre({ service: "Google Fonts", host: "fonts.googleapis.com", category: "cdn" }), pre({ service: "HubSpot Cookie Banner", host: "js-eu1.hs-banner.com", category: "cmp" })], [{ name: "_gat_UA-76750007-4", bannerCategory: "analytics", consentPhase: "pre" }]);
    const f = scanFindings(s);
    assert.strictEqual(titled(f, /IP addresses/).severity, "warning");
    assert.match(titled(f, /second consent banner/).detail, /HubSpot/);
    assert.match(titled(f, /Outdated tracking/).detail, /_gat_UA-76750007-4/);
});

test("scan: our own CMP hosts are not counted as transfers", () => {
    const s = scanOf([pre({ service: "Intastellar Consents", host: "cdn.intastellar.eu", category: "cmp" }), pre({ service: "Intastellar Consents", host: "consents.cdn.intastellarsolutions.com", category: "cmp" }), pre({ service: "Google Ads", host: "ads.example", category: "advertising" })]);
    assert.strictEqual(s.transfers.length, 1);
    assert.strictEqual(s.cmpInfrastructure.length, 2);
    assert.strictEqual(titled(scanFindings(s), /second consent banner/), undefined);
});

test("scan: EU-hosted services of US companies are not called outside the EU", () => {
    const s = scanOf([pre({ service: "HubSpot", host: "api-eu1.hubspot.com", category: "advertising", hostedInEU: true }), pre({ service: "Google Ads", host: "x.example", category: "advertising" })]);
    assert.strictEqual(s.nonEU, 1);
    assert.strictEqual(s.euHosted, 1);
});

test("scan: a scan older than the period end by more than a week is flagged", () => {
    const s = scanOf([], [], { scanned_at: "2026-11-01T12:00:00Z" });
    assert.ok(titled(scanFindings(s, "2026-11-09"), /older than the end/));
    assert.strictEqual(titled(scanFindings(s, "2026-11-05"), /older than the end/), undefined);
});

test("reject pass: untested, failing and passing results are each reported", () => {
    assert.match(titled(scanFindings(scanOf([])), /Reject behaviour/).title, /not been tested/);
    const bad = scanOf([], [], { reject_pass: { available: true, firstLayerReject: false, bannerShownAgain: true, transfers: [{ service: "Clarity", category: "analytics" }], cookies: [{ name: "_uetsid", bannerCategory: "marketing" }] } });
    const f = scanFindings(bad);
    assert.strictEqual(titled(f, /No reject option/).severity, "danger");
    assert.match(titled(f, /present after reject/).detail, /Clarity.*_uetsid/);
    assert.ok(titled(f, /appeared again/));
    const good = scanFindings(scanOf([], [], { reject_pass: { available: true, firstLayerReject: true, rejectAsProminent: true, bannerShownAgain: false, transfers: [], cookies: [] } }));
    assert.strictEqual(titled(good, /first layer/).severity, "ok");
    assert.strictEqual(titled(good, /after reject/).severity, "ok");
});

const titledIn = (list, re) => list.find((f) => re.test(f.title));

test("chapter V report: hosts of one vendor are one row and our own CMP is left out", () => {
    const s = scanOf([pre({ service: "Meta", host: "a.net", category: "advertising" }), pre({ service: "Meta", host: "b.net", category: "advertising" }), pre({ service: "Intastellar Consents", host: "cdn.intastellar.eu", category: "cmp" })]);
    assert.deepStrictEqual(s.chapterV.rows.map((r) => r.vendor), ["Meta"]);
});

test("chapter V report: vendors loaded only after consent are still included", () => {
    const s = scanOf([pre({ service: "Late", host: "l.net", category: "analytics", consentPhase: "post" })]);
    assert.strictEqual(s.chapterV.rows.length, 1);
    assert.strictEqual(s.transfers.length, 0);
});

test("chapter V report: no mechanism is Action needed, naming the vendor", () => {
    const f = titledIn(scanFindings(scanOf([pre({ service: "Unknown Co", host: "u.net", category: "third-party" })])), /no transfer mechanism/);
    assert.strictEqual(f.severity, "danger");
    assert.match(f.detail, /Unknown Co/);
});

test("chapter V report: a catalogue value is reported as unconfirmed and DPAs are not assumed", () => {
    const list = scanFindings(scanOf([pre({ service: "Meta", host: "m.net", category: "advertising", transferMechanism: "EU-US Data Privacy Framework" })]));
    assert.strictEqual(titledIn(list, /not yet confirmed/).severity, "warning");
    assert.match(titledIn(list, /confirmed data processing agreement/).detail, /Meta/);
});

test("chapter V report: recorded answers clear the findings", () => {
    const s = scanOf([pre({ service: "Meta", host: "m.net", category: "advertising" })], [], { vendor_records: { Meta: { mechanism: "sccs", dpa_status: "signed" } } });
    assert.strictEqual(titledIn(scanFindings(s), /documented transfer basis/).severity, "ok");
    assert.strictEqual(s.chapterV.rows[0].labels.transfer, "Standard Contractual Clauses");
});

test("chapter V report: the table is in both scan reports, and absent without a scan", () => {
    const data = { ...base, consent: { dailyNum: 0 }, scan: scan() };
    for (const type of ["audit", "snapshot"]) assert.match(buildReportHtml(type, data), /International transfers \(GDPR Chapter V\)/);
    assert.doesNotMatch(buildReportHtml("snapshot", { ...base, consent: null, scan: null }), /International transfers/);
    assert.strictEqual(chapterVReport([]).rows.length, 0);
});
