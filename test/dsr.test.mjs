// Data subject requests: deadlines, workflow, retention and who may call the API.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { test } from "./_harness.mjs";
import { dueDate, latestExtension, validateNewRequest, applyAction, requestView, anonymizeExpiredRequests, saveAction, createRequest } from "../api/_dsr.js";
import { requireMember, isMember, signatureValid } from "../api/_member-auth.js";

const day = (d) => d.toISOString().slice(0, 10);
const NOW = Date.parse("2026-11-10T12:00:00Z");
const base = { id: "1", status: "pending", regulation: "GDPR", due_at: "2026-12-10T23:59:59Z", notes: "", requester_email: "a@b.dk" };
const valid = { requester_email: "A@b.dk", type: "access", regulation: "GDPR", received_at: "2026-11-10" };

test("dsr deadline: GDPR is one calendar month, clamped to short months", () => {
    assert.strictEqual(day(dueDate("2026-11-10T00:00:00Z", "GDPR")), "2026-12-10");
    assert.strictEqual(day(dueDate("2026-01-31T00:00:00Z", "GDPR")), "2026-02-28");
    assert.strictEqual(day(dueDate("2026-12-15T00:00:00Z", "GDPR")), "2027-01-15");
});

test("dsr deadline: day-based laws, and the due day still counts", () => {
    assert.strictEqual(day(dueDate("2026-11-10T00:00:00Z", "CCPA")), "2026-12-25");
    assert.strictEqual(day(dueDate("2026-11-10T00:00:00Z", "LGPD")), "2026-11-25");
    assert.strictEqual(requestView({ status: "pending", due_at: "2026-11-10T23:59:59Z" }, NOW).overdue, false);
    assert.strictEqual(requestView({ status: "pending", due_at: "2026-11-09T23:59:59Z" }, NOW).overdue, true);
    assert.strictEqual(requestView({ status: "completed", due_at: "2026-11-09T23:59:59Z" }, NOW).overdue, false);
});

test("dsr deadline: an extension moves the date in force and has a legal limit", () => {
    assert.strictEqual(day(latestExtension("2026-12-10T23:59:59Z", "GDPR")), "2027-02-10");
    assert.strictEqual(latestExtension("2026-12-10T23:59:59Z", "LGPD"), null);
    const view = requestView({ status: "pending", due_at: "2026-11-01T23:59:59Z", extended_until: "2027-01-01T23:59:59Z" }, NOW);
    assert.strictEqual(view.overdue, false);
});

test("dsr create: someone must be identifiable and the fields valid", () => {
    assert.ok(validateNewRequest({ ...valid, requester_email: "" }, NOW).error);
    assert.ok(validateNewRequest({ ...valid, requester_email: "nope" }, NOW).error);
    assert.ok(validateNewRequest({ ...valid, type: "x" }, NOW).error);
    assert.ok(validateNewRequest({ ...valid, regulation: "x" }, NOW).error);
    assert.ok(validateNewRequest({ ...valid, received_at: "2027-01-01" }, NOW).error);
    const ok = validateNewRequest({ ...valid, type: "rectification", received_at: "2026-11-01" }, NOW);
    assert.strictEqual(ok.requester_email, "a@b.dk");
    assert.strictEqual(day(ok.due_at), "2026-12-01");
    assert.ok(!validateNewRequest({ consent_id: "c1", type: "access", regulation: "GDPR", received_at: "2026-11-10" }, NOW).error);
});

test("dsr workflow: closing needs a recorded outcome or reason", () => {
    assert.ok(applyAction(base, { action: "complete" }).error);
    assert.ok(applyAction(base, { action: "reject" }).error);
    assert.strictEqual(applyAction(base, { action: "complete", outcome: "Sent export" }).patch.status, "completed");
    assert.strictEqual(applyAction(base, { action: "reject", reason: "Identity unconfirmed" }).patch.status, "rejected");
});

test("dsr workflow: closed requests must be reopened; anonymised ones are locked", () => {
    const closed = { ...base, status: "completed" };
    assert.ok(applyAction(closed, { action: "start" }).error);
    assert.strictEqual(applyAction(closed, { action: "reopen" }).patch.status, "in_progress");
    assert.ok(applyAction(base, { action: "reopen" }).error);
    assert.ok(applyAction({ ...closed, anonymized_at: "2030-01-01" }, { action: "reopen" }).error);
});

test("dsr workflow: an extension needs a reason, a later date, and stays in the limit", () => {
    const go = (extra) => applyAction(base, { action: "extend", ...extra });
    assert.ok(go({ extended_until: "2027-01-10" }).error);
    assert.ok(go({ reason: "Complex", extended_until: "2026-12-01" }).error);
    assert.ok(go({ reason: "Complex", extended_until: "2027-02-11" }).error);
    assert.ok(!go({ reason: "Complex", extended_until: "2027-02-10" }).error);
    assert.ok(applyAction({ ...base, extended_until: "2027-01-01" }, { action: "extend", reason: "x", extended_until: "2027-02-01" }).error);
    assert.ok(applyAction({ ...base, regulation: "LGPD" }, { action: "extend", reason: "x", extended_until: "2027-01-01" }).error);
});

test("dsr workflow: edits log field names, never the personal values", () => {
    const step = applyAction(base, { action: "update", requester_name: "Maria", assignee: "Jo", notes: "" });
    assert.deepStrictEqual(Object.keys(step.patch).sort(), ["assignee", "requester_name"]);
    assert.deepStrictEqual(step.detail, { changed: Object.keys(step.patch) });
    assert.ok(applyAction(base, { action: "update" }).error);
    assert.ok(applyAction(base, { action: "update", requester_email: "", requester_name: "" }).error);
    assert.ok(applyAction(base, { action: "drop_table" }).error);
});

function fakeDb(rows = []) {
    const calls = [];
    return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows: /UPDATE dsr_requests|WITH /.test(sql) ? rows : [] }; } };
}

test("dsr storage: every write is scoped to the organisation and logged in one statement", async () => {
    const db = fakeDb([{ id: "1", status: "in_progress", due_at: "2026-12-10" }]);
    await saveAction(db, 7, "me@x.dk", base, { patch: { status: "in_progress" }, action: "start", detail: {} });
    assert.match(db.calls[0].sql, /organisation_id = \$2/);
    assert.match(db.calls[0].sql, /INSERT INTO dsr_events/);
    assert.deepStrictEqual(db.calls[0].params.slice(0, 2), ["1", 7]);
    await createRequest(db, 7, "me@x.dk", validateNewRequest(valid, NOW));
    assert.match(db.calls[1].sql, /INSERT INTO dsr_events/);
});

test("dsr storage: unknown columns can't be written", async () => {
    const db = fakeDb([{ id: "1", status: "pending", due_at: "2026-12-10" }]);
    await saveAction(db, 7, "me", base, { patch: { notes: "x", organisation_id: 9 }, action: "update", detail: {} });
    assert.doesNotMatch(db.calls[0].sql.split("WHERE")[0], /organisation_id =/);
});

test("dsr retention: three years after closing, personal details go and the record stays", async () => {
    const db = fakeDb([{ id: "5" }]);
    assert.strictEqual(await anonymizeExpiredRequests(db), 1);
    const update = db.calls.find((c) => /SET requester_name = NULL/.test(c.sql));
    assert.match(update.sql, /closed_at < NOW\(\) - INTERVAL '3 years'/);
    for (const field of ["requester_email", "consent_id", "assignee", "outcome", "rejection_reason", "extension_reason"]) assert.match(update.sql, new RegExp(`${field} = NULL`));
    assert.doesNotMatch(update.sql, /DELETE/);
    assert.ok(db.calls.some((c) => /UPDATE dsr_events SET actor = NULL/.test(c.sql)));
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SECRET = "test-secret";
function token(claims, secret = SECRET) {
    const head = `${b64({ alg: "HS256" })}.${b64(claims)}`;
    return `${head}.${createHmac("sha256", secret).update(head).digest("base64url")}`;
}
const auth = (t, org = "7", email = "me@x.dk") => ({ headers: { authorization: `Bearer ${Buffer.from(t).toString("base64")}`, organisation: org, "x-user-email": email } });
const reply = (body, ok = true) => async () => ({ ok, json: async () => body });
const ORG = [{ id: 7, users: [{ email: "me@x.dk" }] }];
const FUTURE = { exp: 4000000000 };

test("dsr access: a member of the organisation gets in", async () => {
    const out = await requireMember(auth(token({ ...FUTURE, email: "me@x.dk" })), { fetchImpl: reply(ORG), secret: SECRET });
    assert.deepStrictEqual(out, { organisationId: 7, email: "me@x.dk" });
});

test("dsr access: another organisation, forged or expired tokens are refused", async () => {
    const ok = token({ ...FUTURE, email: "b@x.dk" });
    assert.strictEqual((await requireMember(auth(ok, "8", "b@x.dk"), { fetchImpl: reply(ORG), secret: SECRET })).status, 403);
    assert.strictEqual((await requireMember(auth(token({ ...FUTURE, email: "me@x.dk" }, "wrong")), { fetchImpl: reply(ORG), secret: SECRET })).status, 401);
    assert.strictEqual((await requireMember(auth(token({ exp: 1, email: "me@x.dk" })), { fetchImpl: reply(ORG), secret: SECRET })).status, 401);
    assert.strictEqual((await requireMember({ headers: {} }, { fetchImpl: reply(ORG), secret: SECRET })).status, 401);
});

test("dsr access: the claimed email can't differ from the token's", async () => {
    assert.strictEqual((await requireMember(auth(token({ ...FUTURE, email: "c@x.dk" }), "7", "me@x.dk"), { fetchImpl: reply(ORG), secret: SECRET })).status, 401);
});

test("dsr access: it fails closed when membership can't be confirmed", async () => {
    const t = (email) => token({ ...FUTURE, email });
    assert.strictEqual((await requireMember(auth(t("d@x.dk"), "7", "d@x.dk"), { fetchImpl: reply("Err_Token_Not_Found"), secret: SECRET })).status, 403);
    assert.strictEqual((await requireMember(auth(t("e@x.dk"), "7", "e@x.dk"), { fetchImpl: async () => { throw new Error("down"); }, secret: SECRET })).status, 503);
});

test("dsr access: membership and both signature encodings", () => {
    assert.ok(isMember(ORG, 7, "ME@x.dk"));
    assert.ok(!isMember(ORG, 7, "other@x.dk"));
    assert.ok(isMember({ organisations: [{ organisationId: 7 }] }, 7, "a@b"));
    const t = token({ a: 1 });
    assert.ok(signatureValid(t, SECRET));
    const [h, p, s] = t.split(".");
    assert.ok(signatureValid(`${h}.${p}.${Buffer.from(s).toString("base64url")}`, SECRET));
    assert.ok(!signatureValid(`${h}.${p}.AAAA`, SECRET));
});

test("vendor records use the member check, and PDFs pass on who is asking", () => {
    const read = (f) => fs.readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8");
    assert.match(read("vendor-compliance"), /await requireMember\(req\)/);
    assert.doesNotMatch(read("vendor-compliance"), /validateJwt/);
    assert.match(read("report-pdf"), /"X-User-Email": req\.headers\["x-user-email"\]/);
});
