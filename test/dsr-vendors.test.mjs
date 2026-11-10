// Data subject requests: telling vendors, deleting through their APIs, and the public form.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { vendorsFromTransfers, needsVendorNotice, validateVendorUpdate, vendorMessage, validatePublicSubmission, seedVendorNotifications } from "../api/_dsr.js";
import { hashEmail, encryptCredentials, decryptCredentials, deletionStatus, runDeletion } from "../api/_dsr-deletion.js";
import { formPage, esc } from "../api/dsr-public.js";
import fs from "node:fs";

const NOW = 1_800_000_000_000;
const form = { token: "t1", company_name: "Shop A/S", default_regulation: "GDPR" };
const good = { email: "A@B.dk", type: "erasure", region: "GDPR", started: NOW - 10000 };
const erasure = { id: "1", type: "erasure", regulation: "GDPR", requester_email: "person@example.dk", domain: "shop.example" };
const ok = (data = {}, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });

function recorder(replies = []) {
    const calls = [];
    const fetchImpl = async (url, options) => { calls.push({ url, ...options, parsed: typeof options?.body === "string" ? JSON.parse(options.body) : options?.body }); return replies.shift() || ok(); };
    return { calls, fetchImpl };
}

test("vendors: only erasure, rectification and restriction need notices", () => {
    assert.deepStrictEqual(["erasure", "rectification", "restriction", "access", "opt_out"].map(needsVendorNotice), [true, true, true, false, false]);
});

test("vendors: the checklist groups hosts and skips CDNs and CMPs", () => {
    const out = vendorsFromTransfers([{ service: "HubSpot", category: "advertising" }, { service: "HubSpot", category: "functional", privacyUrl: "https://h" }, { service: "Fonts", category: "cdn" }, { service: "Own", category: "cmp" }, { host: "x.example", category: "third-party" }]);
    assert.deepStrictEqual(out.map((v) => v.vendor), ["HubSpot", "x.example"]);
    assert.strictEqual(out[0].privacy_url, "https://h");
});

test("vendors: the checklist is filled once and not for access requests", async () => {
    const calls = [];
    const db = { query: async (sql) => { calls.push(sql); return { rows: /SELECT 1 FROM dsr_vendor/.test(sql) ? [{}] : [] }; } };
    await seedVendorNotifications(db, 7, erasure);
    assert.strictEqual(calls.filter((s) => /INSERT/.test(s)).length, 0);
    const none = []; await seedVendorNotifications({ query: async (s) => { none.push(s); return { rows: [] }; } }, 7, { ...erasure, type: "access" });
    assert.strictEqual(none.length, 0);
});

test("vendors: marking notified stamps the date once; other statuses clear it", () => {
    const now = new Date("2026-11-10");
    assert.strictEqual(validateVendorUpdate({ status: "notified" }, {}, now).notified_at, now);
    assert.strictEqual(validateVendorUpdate({ status: "confirmed" }, { notified_at: "earlier" }, now).notified_at, "earlier");
    assert.strictEqual(validateVendorUpdate({ status: "to_notify" }, { notified_at: "earlier" }, now).notified_at, null);
    assert.ok(validateVendorUpdate({ status: "x" }, {}).error);
});

test("vendors: the message names only what's needed to find the person", () => {
    const m = vendorMessage({ ...erasure, requester_name: "Maria Secret", notes: "private note" }, "HubSpot", "Shop A/S");
    assert.match(m.subject, /erasure/);
    assert.match(m.body, /person@example\.dk/);
    assert.match(m.body, /Art\. 17/);
    assert.doesNotMatch(m.body, /Maria Secret|private note/);
});

test("deletion: emails are normalised and hashed for each platform", () => {
    assert.strictEqual(hashEmail(" A@B.dk "), hashEmail("a@b.dk"));
    assert.strictEqual(hashEmail("j.o.n@gmail.com", { google: true }), hashEmail("jon@gmail.com"));
    assert.notStrictEqual(hashEmail("j.o.n@gmail.com"), hashEmail("jon@gmail.com"));
    assert.match(hashEmail("a@b.dk"), /^[0-9a-f]{64}$/);
});

test("deletion: vendor keys are encrypted and tamper-proof", () => {
    const sealed = encryptCredentials({ token: "secret-value" }, "key");
    assert.doesNotMatch(sealed, /secret-value/);
    assert.deepStrictEqual(decryptCredentials(sealed, "key"), { token: "secret-value" });
    assert.throws(() => decryptCredentials(sealed, "other"));
});

test("deletion: only for erasure, and says what is missing", () => {
    assert.strictEqual(deletionStatus("HubSpot", { ...erasure, type: "access" }), null);
    assert.strictEqual(deletionStatus("Hotjar", erasure), null);
    assert.match(deletionStatus("HubSpot", erasure).reason, /Connect/);
    assert.strictEqual(deletionStatus("HubSpot", erasure, { credentials: { hubspot: {} } }).ready, true);
    assert.match(deletionStatus("HubSpot", { ...erasure, requester_email: null }, { credentials: { hubspot: {} } }).reason, /email/);
    assert.match(deletionStatus("Google Ads", { ...erasure, domain: null }).reason, /domain/);
});

test("deletion: Analytics needs the extra permission, so existing connections ask to reconnect", () => {
    const old = deletionStatus("Google Analytics", erasure, { connections: { google_analytics: { access_token: "t", scopes: "analytics.readonly" } } });
    assert.strictEqual(old.ready, false);
    assert.strictEqual(old.reconnect, "google_analytics");
    assert.strictEqual(deletionStatus("Google Analytics", erasure, { connections: { google_analytics: { access_token: "t", scopes: "x/analytics.user.deletion" } } }).ready, true);
});

test("deletion: Google Analytics sends the client ID for the property", async () => {
    const { calls, fetchImpl } = recorder();
    const r = await runDeletion("google_analytics", { conn: { access_token: "t", account_id: "123" }, identifier: " 1.2 ", fetchImpl });
    assert.ok(r.ok);
    assert.match(calls[0].url, /userDeletionRequests:upsert/);
    assert.deepStrictEqual(calls[0].parsed, { kind: "analytics#userDeletionRequest", id: { type: "CLIENT_ID", userId: "1.2" }, propertyId: "123" });
    assert.ok(!(await runDeletion("google_analytics", { conn: {}, identifier: "", fetchImpl })).ok);
});

test("deletion: Google Ads removes the hashed email from each customer list", async () => {
    const { calls, fetchImpl } = recorder([ok({ results: [{ userList: { id: "11" } }, { userList: { id: "22" } }] })]);
    const r = await runDeletion("google_ads", { conn: { access_token: "t", account_id: "123-456" }, email: "p@x.dk", fetchImpl });
    assert.ok(r.ok);
    assert.strictEqual(calls.length, 3);
    assert.strictEqual(calls[1].parsed.destinations[0].productDestinationId, "11");
    assert.strictEqual(calls[1].parsed.destinations[0].operatingAccount.accountId, "123456");
    assert.strictEqual(calls[1].parsed.audienceMembers[0].userData.userIdentifiers[0].emailAddress, hashEmail("p@x.dk", { google: true }));
    assert.doesNotMatch(JSON.stringify(calls), /p@x\.dk/);
});

test("deletion: Meta only touches customer-list audiences, hashed", async () => {
    const { calls, fetchImpl } = recorder([ok({ data: [{ id: "1", subtype: "CUSTOM" }, { id: "2", subtype: "LOOKALIKE" }] })]);
    const r = await runDeletion("meta_ads", { conn: { access_token: "t", account_id: "act_9" }, email: "p@x.dk", fetchImpl });
    assert.ok(r.ok);
    assert.strictEqual(calls.length, 2);
    assert.match(calls[1].url, /\/1\/users$/);
    assert.strictEqual(calls[1].method, "DELETE");
    assert.strictEqual(JSON.parse(calls[1].body.get("payload")).data[0], hashEmail("p@x.dk"));
});

test("deletion: a partial failure is not reported as done", async () => {
    const { fetchImpl } = recorder([ok({ data: [{ id: "1", subtype: "CUSTOM" }, { id: "2", subtype: "CUSTOM" }] }), ok(), ok({}, 500)]);
    const r = await runDeletion("meta_ads", { conn: { access_token: "t", account_id: "9" }, email: "p@x.dk", fetchImpl });
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /1 of 2/);
});

test("deletion: HubSpot, Mixpanel, Amplitude and Segment send the documented requests", async () => {
    const h = recorder();
    await runDeletion("hubspot", { credentials: { token: "k" }, email: "p@x.dk", fetchImpl: h.fetchImpl });
    assert.deepStrictEqual(h.calls[0].parsed, { objectId: "p@x.dk", idProperty: "email" });
    const notFound = recorder([ok({}, 404)]);
    assert.strictEqual((await runDeletion("hubspot", { credentials: { token: "k" }, email: "p@x.dk", fetchImpl: notFound.fetchImpl })).nothingFound, true);
    const m = recorder([ok({ results: { task_id: "T1" } })]);
    const mr = await runDeletion("mixpanel", { credentials: { oauth_token: "o", project_token: "p t" }, identifier: "d1", request: erasure, fetchImpl: m.fetchImpl });
    assert.strictEqual(mr.ref, "T1");
    assert.match(m.calls[0].url, /token=p%20t/);
    assert.deepStrictEqual(m.calls[0].parsed, { distinct_ids: ["d1"], compliance_type: "GDPR" });
    const a = recorder();
    await runDeletion("amplitude", { credentials: { api_key: "a", secret_key: "b" }, identifier: "u1", actor: "me", config: { region: "eu" }, fetchImpl: a.fetchImpl });
    assert.match(a.calls[0].url, /analytics\.eu\.amplitude\.com/);
    assert.strictEqual(a.calls[0].headers.Authorization, `Basic ${Buffer.from("a:b").toString("base64")}`);
    const s = recorder();
    await runDeletion("segment", { credentials: { token: "t" }, identifier: "u1", config: {}, fetchImpl: s.fetchImpl });
    assert.deepStrictEqual(s.calls[0].parsed, { regulationType: "SUPPRESS_WITH_DELETE", subjectType: "USER_ID", subjectIds: ["u1"] });
});

test("public form: bots are discarded quietly, people get a clear error", () => {
    assert.ok(validatePublicSubmission({ ...good, website: "spam" }, form, NOW).spam);
    assert.ok(validatePublicSubmission({ ...good, started: NOW - 500 }, form, NOW).spam);
    assert.ok(validatePublicSubmission({ ...good, started: undefined }, form, NOW).spam);
    assert.ok(validatePublicSubmission({ ...good, email: "nope" }, form, NOW).error);
    assert.ok(validatePublicSubmission({ ...good, type: "x" }, form, NOW).error);
    const v = validatePublicSubmission(good, form, NOW);
    assert.strictEqual(v.requester_email, "a@b.dk");
    assert.strictEqual(v.regulation, "GDPR");
});

test("public form: 'somewhere else' uses the form's default regulation", () => {
    assert.strictEqual(validatePublicSubmission({ ...good, region: "default" }, { ...form, default_regulation: "LGPD" }, NOW).regulation, "LGPD");
    assert.strictEqual(validatePublicSubmission({ ...good, region: "CCPA" }, form, NOW).regulation, "CCPA");
});

test("public form: everything shown back is escaped", () => {
    assert.strictEqual(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    const html = formPage({ ...form, company_name: "<script>alert(1)</script>" }, "<b>", { email: `"><script>` });
    assert.doesNotMatch(html, /<script>/);
});

test("the rules shared with the browser don't pull in server-only code", () => {
    assert.doesNotMatch(fs.readFileSync(new URL("../api/_dsr.js", import.meta.url), "utf8"), /^\s*(import .* from|.*await import\()/m);
});
