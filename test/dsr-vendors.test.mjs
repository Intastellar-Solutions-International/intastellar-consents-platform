// Data subject requests: telling vendors, deleting through their APIs, and the public form.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { vendorsFromTransfers, needsVendorNotice, validateVendorUpdate, vendorMessage, validatePublicSubmission, seedVendorNotifications, validateLogo, requestView, consentExclusion, canPauseClock, applyAction } from "../api/_dsr.js";
import { hashEmail, encryptCredentials, decryptCredentials, deletionStatus, runDeletion } from "../api/_dsr-deletion.js";
import { formPage, esc, confirmationEmail, newRequestEmail } from "../api/dsr-public.js";
import fs from "node:fs";
import { summarizeConsentRows, fetchConsentRecord } from "../api/_dsr-consent.js";
import { notifyNewRequest, newRequestNotification } from "../api/_dsr-notify.js";
import { FORM_LANGUAGES, FORM_TEXT, formT, pickFormLanguage } from "../api/_dsr-public-i18n.js";

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

test("vendors: CDNs and CMPs are listed as having no record, not left out", () => {
    const out = vendorsFromTransfers([{ service: "HubSpot", category: "advertising" }, { service: "HubSpot", category: "functional", privacyUrl: "https://h" }, { service: "Fonts", category: "cdn" }, { service: "Own", category: "cmp" }, { host: "x.example", category: "third-party" }]);
    assert.deepStrictEqual(out.map((v) => `${v.vendor}:${v.no_record}`), ["HubSpot:false", "Fonts:true", "Own:true", "x.example:false"]);
    assert.strictEqual(out[0].privacy_url, "https://h");
});

test("checklists: own systems on every request, vendors only where Art. 19 applies, each filled once", async () => {
    const run = async (request, kinds = []) => {
        const inserts = [];
        const db = { query: async (sql, params) => {
            if (/INSERT/.test(sql)) inserts.push(params);
            return { rows: /SELECT DISTINCT kind/.test(sql) ? kinds.map((kind) => ({ kind })) : [] };
        } };
        await seedVendorNotifications(db, 7, request, async () => (t) => t);
        return inserts;
    };
    const access = await run({ ...erasure, type: "access" });
    assert.ok(access.length >= 4 && access.every((p) => p[4] === "system"));
    assert.strictEqual((await run(erasure, ["system", "vendor"])).length, 0);
    assert.strictEqual((await run({ ...erasure, anonymized_at: "2030" })).length, 0);
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

test("public form: shows both logos, and the company's only if it was given", () => {
    const logo = "data:image/png;base64,AAAA";
    const html = formPage({ ...form, logo_data: logo });
    assert.ok(html.includes(`class="co" src="${logo}"`));
    assert.match(html, /class="ics" src="data:image/);
    assert.doesNotMatch(formPage(form), /class="co"/);
});

test("public form: only small image data URIs are accepted as logos", () => {
    const ok = "data:image/svg+xml;base64,AAAA";
    assert.strictEqual(validateLogo(ok), ok);
    assert.ok(validateLogo("https://evil.example/x.png").error);
    assert.ok(validateLogo("data:text/html;base64,AAAA").error);
    assert.ok(validateLogo('data:image/png;base64,AA"onerror="x').error);
    assert.ok(validateLogo(`data:image/png;base64,${"A".repeat(280001)}`).error);
});

test("public form: request types are in plain language, with a hint for the region", () => {
    const html = formPage(form);
    assert.match(html, /Correct data that&#39;s wrong \(rectification\)/);
    assert.match(html, /Limit how my data is used \(restriction\)/);
    assert.match(html, /decides which privacy law applies/);
    assert.match(html, /placeholder="name@example\.com"/);
    assert.match(html, /<span class="opt">\(optional\)<\/span>/);
});

test("public form: every language has every wording", () => {
    const keys = Object.keys(FORM_TEXT.en);
    for (const { id } of FORM_LANGUAGES) {
        assert.deepStrictEqual(keys.filter((k) => !FORM_TEXT[id][k]), [], id);
        assert.deepStrictEqual(Object.keys(FORM_TEXT[id]).filter((k) => !(k in FORM_TEXT.en)), [], id);
        for (const key of ["intro", "received_text", "mail_subject", "mail_intro"]) assert.match(FORM_TEXT[id][key], /\{company\}/, `${id}.${key}`);
    }
});

test("public form: the visitor's choice wins, then the browser, then English", () => {
    assert.strictEqual(pickFormLanguage("da", "de"), "da");
    assert.strictEqual(pickFormLanguage(undefined, "fr-CA,en;q=0.5"), "fr");
    assert.strictEqual(pickFormLanguage(undefined, "ja,de;q=0.8,sv;q=0.9"), "sv");
    assert.strictEqual(pickFormLanguage(undefined, "nn-NO"), "nb");
    assert.strictEqual(pickFormLanguage("xx", "ja"), "en");
    assert.strictEqual(pickFormLanguage(undefined, undefined), "en");
    assert.strictEqual(pickFormLanguage("<script>", ""), "en");
});

test("public form: a translated page marks its language and offers all the others", () => {
    const html = formPage({ ...form, company_name: "A & B" }, "", {}, "da");
    assert.match(html, /<html lang="da">/);
    assert.match(html, /Slet mine oplysninger/);
    assert.match(html, /Bed A &amp; B om/);
    assert.match(html, /name="lang" value="da"/);
    for (const { id } of FORM_LANGUAGES) assert.ok(html.includes(`?lang=${id}"`), id);
    assert.doesNotMatch(html, /<script/);
});

test("public form: a validation error is a wording key every language can show", () => {
    const { error } = validatePublicSubmission({ ...good, email: "nope" }, form, NOW);
    assert.strictEqual(formT("da", error), "Indtast en gyldig e-mailadresse.");
    assert.strictEqual(formT("en", validatePublicSubmission({ ...good, type: "x" }, form, NOW).error), "Please choose what you'd like us to do.");
});

test("confirmation email: carries the form's logo inline, in the visitor's language", () => {
    const mail = confirmationEmail({ company_name: "ASA", logo_data: "data:image/png;base64,AAAA" }, "da", "https://x/confirm/abc?lang=da");
    assert.match(mail.subject, /ASA/);
    assert.match(mail.html, /src="cid:company-logo"/);
    assert.match(mail.html, /Bekræft min anmodning/);
    assert.deepStrictEqual(mail.attachments, [{ filename: "logo.png", content: "AAAA", content_id: "company-logo" }]);
    assert.doesNotMatch(mail.html, /data:image/);
});

test("confirmation email: without a mail-safe logo it shows the company name", () => {
    for (const logo_data of [undefined, "data:image/svg+xml;base64,AAAA"]) {
        const mail = confirmationEmail({ company_name: "A & B", logo_data }, "en", "https://x");
        assert.deepStrictEqual(mail.attachments, []);
        assert.doesNotMatch(mail.html, /cid:/);
        assert.match(mail.html, /A &amp; B/);
    }
});

test("new request email: tells the team what's due, with no personal details", () => {
    const mail = newRequestEmail({ company_name: "A & B" }, { id: "7", type: "erasure", regulation: "GDPR", received_at: "2026-11-10T00:00:00Z", due_at: "2026-12-10T23:59:59Z", requester_email: "secret@x.dk", requester_name: "Maria" });
    assert.match(mail.subject, /A & B/);
    assert.match(mail.html, /A &amp; B/);
    assert.match(mail.html, /10 December 2026/);
    assert.match(mail.html, /reports\/dsr\/7/);
    assert.doesNotMatch(mail.html, /secret@x\.dk|Maria/);
    assert.match(mail.html, /src="cid:intastellar-logo"/);
    assert.strictEqual(mail.attachments[0].content_id, "intastellar-logo");
});

test("new requests: new until someone opens them, and not once closed", () => {
    assert.strictEqual(requestView({ status: "pending", due_at: "2030-01-01" }, NOW).is_new, true);
    assert.strictEqual(requestView({ status: "pending", due_at: "2030-01-01", first_opened_at: "2026-11-10" }, NOW).is_new, false);
    assert.strictEqual(requestView({ status: "completed", due_at: "2030-01-01" }, NOW).is_new, false);
});

const notifyForm = { organisation_id: 7, company_name: "Shop A/S", domain: null };
const notifyRequest = { id: "12", due_at: "2026-12-10T23:59:59Z", requester_email: "secret@x.dk", requester_name: "Maria" };

test("bell: one notification per request, linked to it, with no personal details", async () => {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    assert.strictEqual(await notifyNewRequest(db, notifyForm, notifyRequest, "Erasure"), true);
    const insert = calls.find((c) => /INSERT INTO ad_notifications/.test(c.sql));
    assert.match(insert.sql, /ON CONFLICT/);
    assert.ok(insert.params.includes("dsr:12") && insert.params.includes("12"));
    assert.ok(insert.params.includes("Shop A/S"), "a form without a domain still has a value for the required column");
    assert.doesNotMatch(JSON.stringify(insert.params), /secret@x|Maria/);
    assert.match(newRequestNotification(notifyForm, notifyRequest, "Erasure").body, /10 December 2026/);
});

test("bell: respects the organisation's setting, and a failure can't break confirmation", async () => {
    const off = { query: async () => ({ rows: [{ enabled: false }] }) };
    assert.strictEqual(await notifyNewRequest(off, notifyForm, notifyRequest, "Erasure"), false);
    const broken = { query: async (sql) => { if (/INSERT/.test(sql)) throw new Error("down"); return { rows: [] }; } };
    assert.strictEqual(await notifyNewRequest(broken, notifyForm, notifyRequest, "Erasure"), false);
});

const consentRow = (consent, at = "2026-11-01 10:00:00") => ({ consent: JSON.stringify(consent), consents_timestamp: at });

test("consent record: full choices are exact, and an accept anywhere counts", () => {
    const out = summarizeConsentRows([
        consentRow([{ type: "marketing", checked: false }, { type: "statistics", checked: true }, { type: "functional", checked: false }]),
        consentRow([{ type: "functional", checked: true }], "2026-10-01 10:00:00"),
    ]);
    assert.deepStrictEqual(out.accepted, ["functional", "statistics"]);
    assert.deepStrictEqual(out.declined, ["marketing"]);
    assert.strictEqual(out.last_at, "2026-11-01 10:00:00");
});

test("consent record: accept and reject all; a single custom row leaves others unknown", () => {
    assert.deepStrictEqual(summarizeConsentRows([consentRow([{ consent_type: "all", consent_value: "1" }])]).accepted, ["functional", "statistics", "marketing"]);
    assert.deepStrictEqual(summarizeConsentRows([consentRow([{ consent_type: "all", consent_value: "declined" }])]).declined, ["functional", "statistics", "marketing"]);
    const custom = summarizeConsentRows([consentRow([{ consent_type: "statics", consent_value: "1" }])]);
    assert.deepStrictEqual(custom.accepted, ["statistics"]);
    assert.deepStrictEqual(custom.declined, []);
    assert.strictEqual(custom.partial, true);
    assert.strictEqual(summarizeConsentRows([]).found, false);
});

test("consent record: only a vendor that loads after consent, in a declined category, is excluded", () => {
    const consent = { found: true, declined: ["marketing"] };
    assert.ok(consentExclusion({ category: "advertising", before_consent: false }, consent));
    assert.strictEqual(consentExclusion({ category: "advertising", before_consent: true }, consent), null, "loaded regardless of the choice");
    assert.strictEqual(consentExclusion({ category: "analytics", before_consent: false }, consent), null, "that category wasn't declined");
    assert.strictEqual(consentExclusion({ category: "third-party", before_consent: false }, consent), null, "unknown purpose");
    assert.strictEqual(consentExclusion({ category: "advertising", before_consent: false }, { found: false, declined: [] }), null);
});

test("consent record: a lookup failure is reported, never thrown, and sends the caller's login", async () => {
    const req = { headers: { authorization: "Bearer x", organisation: "7" } };
    const seen = [];
    const ok = await fetchConsentRecord(req, { consent_id: "c-unique-1", domain: "a.dk" }, { fetchImpl: async (u, o) => { seen.push(o.headers); return reply([consentRow([{ consent_type: "all", consent_value: "1" }])]); } });
    assert.strictEqual(ok.found, true);
    assert.strictEqual(seen[0].UID, "c-unique-1");
    assert.strictEqual(seen[0].Authorization, "Bearer x");
    assert.deepStrictEqual(await fetchConsentRecord(req, { consent_id: "c-unique-2" }, { fetchImpl: async () => { throw new Error("down"); } }), { available: false });
    assert.strictEqual(await fetchConsentRecord(req, { consent_id: null }), null);
});
const reply = (data) => ({ ok: true, status: 200, json: async () => data });

test("public form: carries a valid consent ID through, and ignores anything else", () => {
    assert.strictEqual(validatePublicSubmission({ ...good, consent_id: "cns_8f3a-1" }, form, NOW).consent_id, "cns_8f3a-1");
    assert.strictEqual(validatePublicSubmission({ ...good, consent_id: "<script>" }, form, NOW).consent_id, null);
    assert.match(formPage(form, "", { consent_id: "cns_1" }), /name="consent_id" value="cns_1"/);
    assert.doesNotMatch(formPage(form), /name="consent_id"/);
});

const pausable = { id: "1", status: "pending", regulation: "GDPR", due_at: "2026-12-10T23:59:59Z" };
const later = new Date("2026-11-20T12:00:00Z");

test("deadline pause: GDPR and UK GDPR only, with a record of what was asked", () => {
    assert.ok(canPauseClock(pausable) && canPauseClock({ ...pausable, regulation: "UK_GDPR" }));
    assert.ok(!canPauseClock({ ...pausable, regulation: "CCPA" }));
    assert.ok(!canPauseClock({ ...pausable, identity_verified_at: "x" }));
    assert.ok(!canPauseClock({ ...pausable, paused_at: "x" }));
    assert.ok(applyAction(pausable, { action: "pause_clock" }, later).error);
    assert.ok(applyAction({ ...pausable, regulation: "CCPA" }, { action: "pause_clock", reason: "ID", notified_on: "2026-11-10" }, later).error);
    assert.strictEqual(applyAction(pausable, { action: "pause_clock", reason: "ID", notified_on: "2026-11-10" }, later).patch.paused_reason, "ID");
});

test("deadline pause: resuming moves the deadline by the days paused", () => {
    const paused = { ...pausable, paused_at: "2026-11-10T00:00:00Z", paused_days: 2 };
    const step = applyAction(paused, { action: "resume_clock" }, later);
    assert.strictEqual(step.patch.due_at.toISOString(), "2026-12-20T23:59:59.000Z");
    assert.strictEqual(step.patch.paused_at, null);
    assert.strictEqual(step.patch.paused_days, 12);
    assert.deepStrictEqual(step.detail, { days_added: 10 });
});

test("deadline pause: verifying identity restarts it; a paused request isn't overdue", () => {
    const paused = { ...pausable, paused_at: "2026-11-10T00:00:00Z" };
    const step = applyAction(paused, { action: "verify_identity", method: "email", note: "Replied from address" }, later);
    assert.strictEqual(step.patch.paused_at, null);
    assert.strictEqual(step.patch.due_at.toISOString(), "2026-12-20T23:59:59.000Z");
    const view = requestView({ ...paused, due_at: "2020-01-01" }, NOW);
    assert.strictEqual(view.overdue, false);
    assert.strictEqual(view.paused, true);
});

test("deadline pause: closing a paused request leaves the deadline alone", () => {
    const paused = { ...pausable, paused_at: "2026-11-10T00:00:00Z" };
    const step = applyAction(paused, { action: "reject", reason: "No reply", notified_on: "2026-11-15", complaint_notice: true }, later);
    assert.strictEqual(step.patch.paused_at, null);
    assert.strictEqual(step.patch.due_at, undefined);
});
