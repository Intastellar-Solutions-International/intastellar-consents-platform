// GDPR Chapter V per vendor: transfer mechanism and DPA.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { validateRecord, validateEvidence, evidencePath, saveRecord, listRecords } from "../api/vendor-compliance.js";
import { vendorChapterV, chapterVSummary, chapterVLabels } from "../api/_transfer-compliance.js";

const us = (mechanism) => ({ vendor: "V", region: "non-eu", transferMechanism: mechanism });

test("chapter V: a catalogue mechanism is only a suggestion until confirmed", () => {
    const c = vendorChapterV(us("EU-US Data Privacy Framework"), undefined);
    assert.strictEqual(c.status, "unconfirmed");
    assert.strictEqual(c.mechanism.id, "dpf");
    assert.strictEqual(c.needsAction, true);
});

test("chapter V: the organisation's record overrides the catalogue", () => {
    const c = vendorChapterV(us("EU-US Data Privacy Framework"), { mechanism: "sccs", mechanism_confirmed_at: "2026-11-01", dpa_status: "signed" });
    assert.strictEqual(c.status, "ok");
    assert.strictEqual(c.mechanism.id, "sccs");
    assert.strictEqual(c.needsAction, false);
});

test("chapter V: a transfer with nothing documented or marked None is a problem", () => {
    assert.strictEqual(vendorChapterV(us(null), undefined).status, "problem");
    assert.strictEqual(vendorChapterV(us("Standard Contractual Clauses"), { mechanism: "none" }).status, "problem");
});

test("chapter V: a vendor catalogued as EEA but seen outside the EU still needs a basis", () => {
    assert.strictEqual(vendorChapterV(us("EEA"), undefined).status, "problem");
});

test("chapter V: EU vendors need no transfer mechanism but still need a DPA", () => {
    const c = vendorChapterV({ vendor: "E", region: "eu", transferMechanism: "EEA" }, undefined);
    assert.strictEqual(c.status, "not_required");
    assert.strictEqual(c.needsDpa, true);
});

test("chapter V: a DPA is never assumed", () => {
    assert.strictEqual(vendorChapterV(us("Standard Contractual Clauses"), { mechanism: "sccs" }).dpa, null);
    assert.strictEqual(chapterVLabels(us("Standard Contractual Clauses"), undefined).dpa, "Unknown");
});

test("chapter V: the summary counts each state", () => {
    const vendors = [{ ...us(null), vendor: "A" }, { ...us("Standard Contractual Clauses"), vendor: "B" }, { vendor: "C", region: "eu" }];
    const s = chapterVSummary(vendors, { B: { mechanism: "sccs", mechanism_confirmed_at: "2026-11-01", dpa_status: "signed" } });
    assert.deepStrictEqual({ ...s }, { problem: 1, unconfirmed: 0, withoutDpa: 2 });
});

test("chapter V: the CSV says when a value is unconfirmed", () => {
    assert.strictEqual(chapterVLabels(us("Standard Contractual Clauses"), undefined).transfer, "Standard Contractual Clauses (unconfirmed)");
    assert.strictEqual(chapterVLabels(us(null), undefined).transfer, "None documented");
});

test("vendor records: only known values are accepted", () => {
    assert.ok(validateRecord({ vendor: "V", mechanism: "made-up" }).error);
    assert.ok(validateRecord({ vendor: "V", dpa_status: "maybe" }).error);
    assert.ok(validateRecord({ mechanism: "dpf" }).error);
    assert.deepStrictEqual(validateRecord({ vendor: " V ", mechanism: "dpf", dpa_status: "", notes: " ref " }), { vendor: "V", mechanism: "dpf", mechanism_confirmed_at: null, dpa_status: null, evidence_url: null, owner: "", notes: "ref" });
});

test("worklist: a confirmed mechanism still needs its date; requested DPAs stay open", () => {
    const noDate = vendorChapterV(us(null), { mechanism: "dpf", dpa_status: "signed" });
    assert.strictEqual(noDate.dateMissing, true);
    assert.strictEqual(noDate.needsAction, true);
    assert.strictEqual(vendorChapterV(us(null), { mechanism: "dpf", mechanism_confirmed_at: "2026-11-01", dpa_status: "requested" }).needsDpa, true);
    const eu = vendorChapterV({ vendor: "E", region: "eu" }, { dpa_status: "not_required" });
    assert.strictEqual(eu.needsDpa, false);
    assert.strictEqual(eu.needsAction, false);
});

test("worklist: dates and evidence links are validated", () => {
    assert.ok(validateRecord({ vendor: "V", mechanism_confirmed_at: "soon" }).error);
    assert.ok(validateRecord({ vendor: "V", evidence_url: "javascript:alert(1)" }).error);
    assert.ok(!validateRecord({ vendor: "V", dpa_status: "requested", evidence_url: "https://drive.example/dpa", mechanism_confirmed_at: "2026-11-01" }).error);
});

test("worklist: evidence uploads are limited and scoped to the organisation", () => {
    const data = Buffer.from("x").toString("base64");
    assert.ok(validateEvidence({ vendor: "V", content_type: "text/html", data }).error);
    assert.ok(validateEvidence({ vendor: "V", content_type: "application/pdf", data: "" }).error);
    assert.ok(validateEvidence({ vendor: "V", content_type: "application/pdf", data: Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64") }).error);
    const ok = validateEvidence({ vendor: "V", content_type: "application/pdf", filename: "../../DPA signed.pdf", data });
    assert.strictEqual(ok.filename.includes("/"), false);
    assert.ok(evidencePath(7, "V", ok.filename, 1).startsWith("vendor-evidence/7/"));
});

function fakeDb(rows = []) {
    const calls = [];
    return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
}

test("vendor records: reads and writes are scoped to the organisation", async () => {
    const db = fakeDb([{ vendor: "V", mechanism: "dpf" }]);
    assert.deepStrictEqual(await listRecords(db, 7), { V: { mechanism: "dpf" } });
    await saveRecord(db, 7, { vendor: "V", mechanism: "dpf", dpa_status: null, notes: "" });
    for (const c of db.calls) assert.strictEqual(c.params[0], 7);
    assert.match(db.calls[1].sql, /ON CONFLICT \(organisation_id, vendor\)/);
});

test("vendor records: clearing every field removes the record", async () => {
    const db = fakeDb();
    assert.strictEqual(await saveRecord(db, 7, { vendor: "V", mechanism: null, dpa_status: null, notes: "" }), null);
    assert.match(db.calls[0].sql, /^DELETE/);
});

test("chapter V: an EU vendor stays Not required even with a saved mechanism", () => {
    const c = vendorChapterV({ vendor: "E", region: "eu", transferMechanism: "EEA" }, { mechanism: "sccs", dpa_status: "signed" });
    assert.strictEqual(c.status, "not_required");
    assert.strictEqual(c.mechanism, null);
    assert.strictEqual(c.needsAction, false);
    assert.strictEqual(chapterVLabels({ vendor: "E", region: "eu" }, { mechanism: "sccs" }).transfer, "Not required (EU)");
});
