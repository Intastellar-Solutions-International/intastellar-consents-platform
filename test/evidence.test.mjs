import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import {
    validateUpload, documentPath, saveDocument, validateInvite, maskEmail, fileHeaders, redeemLoginCode, createLoginCode, sha, LOGIN_LINKS_PER_HOUR,
} from "../api/_evidence.js";
import { inviteEmail, loginEmail } from "../api/_evidence-mail.js";

const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(20)]).toString("base64");
const upload = (extra) => ({ vendor: "HubSpot", doc_type: "dpa", filename: "HubSpot DPA.pdf", content_type: "application/pdf", data: pdf, ...extra });

test("evidence upload: type, content, size and document type are checked", () => {
    assert.ok(validateUpload(upload({ content_type: "text/html" })).error);
    assert.ok(validateUpload(upload({ data: "" })).error);
    assert.ok(validateUpload(upload({ data: Buffer.from("<script>alert(1)</script>").toString("base64") })).error, "content must match the claimed type");
    assert.ok(validateUpload(upload({ data: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(3 * 1024 * 1024)]).toString("base64") })).error);
    assert.ok(validateUpload(upload({ doc_type: "privacy_policy" })).error, "organisation types aren't vendor types");
    assert.ok(validateUpload(upload({ vendor: "", doc_type: "dpa" })).error, "a DPA belongs to a vendor");
    assert.ok(!validateUpload(upload({ vendor: "", doc_type: "dpia" })).error);
    const ok = validateUpload(upload({ filename: "../../signed DPA.pdf" }));
    assert.strictEqual(ok.filename.includes("/"), false);
    assert.strictEqual(ok.title, "DPA");
});

test("evidence upload: stored under the organisation, organisation documents in their own folder", () => {
    assert.match(documentPath(7, "HubSpot", "a.pdf", 1), /^evidence\/7\/[0-9a-f]{32}\/1-[0-9a-f]{8}-a\.pdf$/);
    assert.match(documentPath(7, null, "a.pdf", 1), /^evidence\/7\/organisation\//);
});

function fakeDb(rows = []) {
    const calls = [];
    const query = async (sql, params) => { calls.push({ sql: sql.trim(), params }); return { rows }; };
    return { calls, query, connect: async () => ({ query, release() {} }) };
}

test("evidence upload: a new DPA supersedes the vendor's current one in the same transaction", async () => {
    const db = fakeDb([{ id: 1 }]);
    const stored = [];
    await saveDocument(db, 7, validateUpload(upload()), "a@b.c", async (path, data, options) => stored.push({ path, options }));
    assert.strictEqual(stored[0].options.access, "private");
    const sql = db.calls.map((c) => c.sql);
    assert.deepStrictEqual([sql[0], sql.at(-1)], ["BEGIN", "COMMIT"]);
    assert.match(sql[1], /^UPDATE compliance_documents SET superseded_at = NOW\(\)/);
    assert.deepStrictEqual(db.calls[1].params, [7, "HubSpot"]);
    assert.match(sql[2], /^INSERT INTO compliance_documents/);
});

test("evidence upload: other evidence doesn't touch the DPA", async () => {
    const db = fakeDb([{ id: 2 }]);
    await saveDocument(db, 7, validateUpload(upload({ doc_type: "sccs" })), "a@b.c", async () => {});
    assert.ok(!db.calls.some((c) => c.sql.startsWith("UPDATE")));
});

test("evidence files: inline for the preview, attachment for a download, never sniffed", () => {
    const doc = { filename: 'DPA "v2".pdf', content_type: "application/pdf" };
    assert.match(fileHeaders(doc, false)["Content-Disposition"], /^inline; filename="DPA v2\.pdf"/);
    assert.match(fileHeaders(doc, true)["Content-Disposition"], /^attachment;/);
    assert.strictEqual(fileHeaders(doc, false)["X-Content-Type-Options"], "nosniff");
});

test("invites: valid email and an end date in the next 180 days", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    assert.ok(validateInvite({ email: "nope", expires_on: "2026-12-01" }, now).error);
    assert.ok(validateInvite({ email: "a@firm.com", expires_on: "2026-11-01" }, now).error);
    assert.ok(validateInvite({ email: "a@firm.com", expires_on: "2027-12-01" }, now).error);
    assert.ok(validateInvite({ email: "a@firm.com", expires_on: "next week" }, now).error);
    const ok = validateInvite({ email: " Auditor@Firm.com ", expires_on: "2026-12-11", name: "Jane" }, now);
    assert.strictEqual(ok.email, "auditor@firm.com");
    assert.strictEqual(ok.expiresAt.toISOString(), "2026-12-11T23:59:59.000Z");
});

test("room: the address is masked and links carry the secrets only in the email", () => {
    assert.strictEqual(maskEmail("jane.doe@firm.com"), "ja•••@firm.com");
    const invite = { organisation_name: "Acme <b>", email: "a@firm.com", expires_at: "2026-12-11T23:59:59Z", created_by: "me@acme.com", note: "" };
    const mail = inviteEmail(invite, "TOKEN");
    assert.match(mail.html, /evidence-room\/TOKEN/);
    assert.ok(!mail.html.includes("<b>"), "organisation name is escaped");
    assert.match(loginEmail(invite, "TOKEN", "CODE").html, /evidence-room\/TOKEN\/login\/CODE/);
});

test("room sign-in: codes are stored hashed, limited per hour and spent once", async () => {
    const limited = fakeDb([{ n: LOGIN_LINKS_PER_HOUR }]);
    assert.strictEqual(await createLoginCode(limited, { id: 3 }), null);

    const db = fakeDb([{ n: 0 }]);
    const code = await createLoginCode(db, { id: 3 });
    assert.strictEqual(db.calls[1].params[0], sha(code));
    assert.ok(!db.calls.some((c) => c.params?.includes(code)), "the plain code is never stored");

    const spent = fakeDb([]);
    assert.strictEqual(await redeemLoginCode(spent, { id: 3 }, code), null);
    assert.match(spent.calls[0].sql, /used_at IS NULL AND expires_at > NOW\(\)/);
});
