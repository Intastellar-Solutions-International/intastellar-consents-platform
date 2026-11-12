// Audit log table formatting (src/Pages/UserConsents/auditLogFormat.js).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { test } from "./_harness.mjs";

const ctx = vm.createContext({ Intl, Date, JSON, Number, String, Array, Object, Map, Set, Math });
vm.runInContext(
    fs.readFileSync(new URL("../src/Pages/UserConsents/auditLogFormat.js", import.meta.url), "utf8").replace(/^export /gm, "")
        + "\n;this.api = { consentChoices, formatAuditTime, transferSummary, comparableUrl, pageLabel, methodLabel, decisionSplit, dailySeries, summarizeRows, groupRepeats, findBursts, botCheck, exportRecord, toCsv };",
    ctx
);
const { consentChoices, formatAuditTime, transferSummary, comparableUrl, pageLabel, methodLabel, decisionSplit, dailySeries, summarizeRows, groupRepeats, findBursts, botCheck, exportRecord, toCsv } = ctx.api;
const states = (c) => Object.fromEntries(consentChoices(c).map((x) => [x.type, x.state]));

test("audit log: four choices in a fixed order, necessary always on, missing ones marked", () => {
    assert.deepEqual(states([{ type: "marketing", checked: "" }, { type: "statics", checked: "checked" }]), { necessary: "accepted", functional: "missing", statics: "accepted", marketing: "declined" });
    assert.deepEqual(states('[{"type":"functional","checked":"1"}]').functional, "accepted");
    assert.deepEqual(states({ consent_type: "marketing", consent_value: "1" }).marketing, "accepted");
    assert.deepEqual(states("not json").marketing, "missing");
});

test("audit log: times use a day-month-name format with the zone, and ISO UTC for hover", () => {
    const t = formatAuditTime(new Date("2026-11-10T19:00:40Z"), "en-GB", "Europe/Copenhagen");
    assert.equal(t.date, "10 Nov 2026");
    assert.equal(t.time, "20:00:40");
    assert.match(t.zone, /CET|GMT\+1/);
    assert.equal(t.iso, "2026-11-10T19:00:40Z");
    assert.equal(formatAuditTime(new Date("nope")), null);
});

test("audit log: the transfer basis is a short badge with the full wording kept", () => {
    const t = transferSummary({ transfer_basis: "sccs", transfer_destination: "EU", transfer_instrument: "EU SCCs 2021/914 (Module 2)", transfer_data_importer: "Intastellar Solutions, International" });
    assert.equal(t.short, "SCCs → EU");
    assert.equal(t.full, "SCCs → EU · EU SCCs 2021/914 (Module 2) · Intastellar Solutions, International");
    assert.equal(transferSummary({}), null);
});

test("audit log: page and referrer compare without www, scheme, query or trailing slash", () => {
    assert.equal(comparableUrl("https://www.Shop.dk/integrations/?utm=x"), comparableUrl("http://shop.dk/integrations#top"));
    assert.equal(pageLabel("https://www.shop.dk/integrations?x=1", "shop.dk"), "/integrations");
    assert.equal(pageLabel("https://other.dk/", "shop.dk"), "other.dk");
});

test("audit log: method names read as the button the visitor pressed", () => {
    assert.equal(methodLabel("banner_granular"), "Custom");
    assert.equal(methodLabel("some_new_method"), "some new method");
    assert.equal(methodLabel(""), null);
});

test("audit summary: methods group into accept, reject, custom and other", () => {
    assert.deepEqual({ ...decisionSplit({ banner_accept_all: 7, banner_reject_all: 2, banner_essential_only: 1, banner_granular: 3, "": 4, withdrawal: 1 }) }, { accept: 7, reject: 3, custom: 3, other: 5 });
});

test("audit summary: the trend has a point for every day in the range", () => {
    const s = dailySeries({ "2026-10-31": 2, "2026-11-02": 5 }, "2026-10-30", "2026-11-02");
    assert.deepEqual(JSON.parse(JSON.stringify(s.map((p) => p.n))), [0, 2, 0, 5]);
    assert.equal(s[3].day, "2026-11-02");
});

test("audit summary: demo rows summarise like the server does", () => {
    const s = summarizeRows([{ consent_method: "banner_accept_all", country_code: "DK", consents_timestamp: "2026-11-01 10:00:00" }, { consent_method: "", country_code: "-", consents_timestamp: "2026-11-01 11:00:00" }]);
    assert.equal(s.total, 2);
    assert.equal(s.otherCountries, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(s.countries)), [{ code: "DK", n: 1 }]);
});

const rec = (uid, ts, extra = {}) => ({ uid, consents_timestamp: ts, country_code: "US", state_code: "Virginia", url: "https://shop.dk/integrations", consent_method: "banner_accept_all", ...extra });

test("audit repeats: one visitor's records seconds apart collapse, others stay separate", () => {
    const rows = [rec("dk1", "2026-11-06 15:32:54"), rec("x", "2026-11-06 15:32:50"), rec("dk1", "2026-11-06 15:32:48"), rec("dk1", "2026-11-06 15:20:00")];
    const g = groupRepeats(rows);
    assert.equal(g.length, 3);
    assert.equal(g[0].items.length, 2);
    assert.equal(g[0].spanSeconds, 6);
    assert.equal(g[2].items.length, 1, "13 minutes later is a new decision");
});

test("audit bursts: four visitors, same place, page and choice within a minute", () => {
    const rows = [0, 10, 20, 30, 50].map((s, i) => rec(`v${i}`, `2026-10-19 14:00:${String(s).padStart(2, "0")}`));
    const quiet = rec("other", "2026-10-19 14:00:10", { country_code: "DK", state_code: "" });
    const hits = findBursts([...rows, quiet]);
    assert.equal(hits.get(rows[0]).count, 5);
    assert.equal(hits.get(rows[0]).seconds, 50);
    assert.equal(hits.get(rows[0]).where, "US · Virginia");
    assert.equal(hits.has(quiet), false);
    assert.equal(findBursts(rows.slice(0, 3)).size, 0, "three visitors is not a burst");
    assert.equal(findBursts([rec("same", "2026-10-19 14:00:00"), rec("same", "2026-10-19 14:00:05"), rec("same", "2026-10-19 14:00:09"), rec("same", "2026-10-19 14:00:12")]).size, 0, "one visitor repeating is a repeat, not a burst");
});

test("audit bot check: flagged, passed, or never checked", () => {
    assert.equal(botCheck({ is_suspected_bot: true, bot_reason: "datacenter_ip" }).label, "Sent from a datacenter IP address");
    assert.equal(botCheck({ is_suspected_bot: false, bot_reason: "" }).status, "passed");
    assert.equal(botCheck({ is_suspected_bot: false, bot_reason: null }).status, "unchecked");
});

test("audit export: flat UTC record, and CSV that a spreadsheet can't run as a formula", () => {
    const r = exportRecord({ ...rec("=HYPERLINK(1)", "2026-11-10 19:00:40"), consent: [{ type: "marketing", checked: "" }], referrer: "https://a.dk/?q=1", bot_reason: "" });
    assert.equal(r.time_utc, "2026-11-10T19:00:40Z");
    assert.equal(r.marketing, "declined");
    assert.equal(r.necessary, "accepted");
    assert.equal(r.referrer, "https://a.dk/");
    assert.equal(r.bot_check, "passed");
    const csv = toCsv([r, { ...r, uid: 'a "b", c' }]).split("\r\n");
    assert.match(csv[0], /^time_utc,uid,domain/);
    assert.match(csv[1], /,'=HYPERLINK\(1\),/);
    assert.match(csv[2], /,"a ""b"", c",/);
});

const printCtx = vm.createContext({ String, Object, Date });
vm.runInContext(fs.readFileSync(new URL("../src/Pages/UserConsents/auditPrint.js", import.meta.url), "utf8").replace(/^export /gm, "") + "\n;this.api = { receiptHtml, reportHtml };", printCtx);

test("audit print: recorded values are escaped in the receipt and report", () => {
    const record = { time_utc: "2026-11-10T19:00:40Z", uid: "<img src=x onerror=alert(1)>", domain: "shop.dk", page: "https://shop.dk/?a=\"b\"", bot_check: "passed", marketing: "" };
    const receipt = printCtx.api.receiptHtml(record, { fingerprint: "abc" });
    assert.doesNotMatch(receipt, /<img/);
    assert.match(receipt, /&lt;img src=x/);
    assert.doesNotMatch(receipt, /<dt>Marketing<\/dt>/, "empty fields are left out");
    const report = printCtx.api.reportHtml([record], { scope: "<b>DK</b>", total: 3 });
    assert.match(report, /&lt;b&gt;DK&lt;\/b&gt;/);
    assert.match(report, /the first 1 of 3/);
});
