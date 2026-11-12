// Audit log table formatting (src/Pages/UserConsents/auditLogFormat.js).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { test } from "./_harness.mjs";

const ctx = vm.createContext({ Intl, Date, JSON, Number, String, Array, Object });
vm.runInContext(
    fs.readFileSync(new URL("../src/Pages/UserConsents/auditLogFormat.js", import.meta.url), "utf8").replace(/^export /gm, "")
        + "\n;this.api = { consentChoices, formatAuditTime, transferSummary, comparableUrl, pageLabel, methodLabel };",
    ctx
);
const { consentChoices, formatAuditTime, transferSummary, comparableUrl, pageLabel, methodLabel } = ctx.api;
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
