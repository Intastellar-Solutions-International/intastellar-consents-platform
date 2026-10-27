// Tests api/analytics-forms.js's humanizeFormLabel() and the FORM_DEDUP_KEY/
// FORM_ID_CASE SQL fragments (docs/analytics-audit-plan.md item 7).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { humanizeFormLabel, FORM_DEDUP_KEY, FORM_ID_CASE } from "../api/analytics-forms.js";

test("humanizeFormLabel title-cases a slug-style formId", () => {
    assert.strictEqual(humanizeFormLabel("book-demo-request-form", null), "Book Demo Request Form");
    assert.strictEqual(humanizeFormLabel("free-trial-request-form", null), "Free Trial Request Form");
    assert.strictEqual(humanizeFormLabel("hubspot-newsletter", null), "Hubspot Newsletter");
});

test("humanizeFormLabel prefers the provider name over a GUID-like widget formId", () => {
    assert.strictEqual(
        humanizeFormLabel("hs-85f3a603-46b0-4e64-8338-1e4dae0aecf8", "hubspot"),
        "HubSpot form"
    );
    assert.strictEqual(humanizeFormLabel("tf-abc123", "typeform"), "Typeform form");
});

test("humanizeFormLabel falls back to 'Unnamed form' for the placeholder ids", () => {
    assert.strictEqual(humanizeFormLabel("unknown", null), "Unnamed form");
    assert.strictEqual(humanizeFormLabel("form", null), "Unnamed form");
    assert.strictEqual(humanizeFormLabel(null, null), "Unnamed form");
});

test("humanizeFormLabel is no longer a no-op (the bug this item fixes)", () => {
    assert.notStrictEqual(humanizeFormLabel("book-demo-request-form", null), "book-demo-request-form");
});

test("FORM_DEDUP_KEY and FORM_ID_CASE are valid-looking SQL fragments", () => {
    assert.match(FORM_DEDUP_KEY, /session_id/);
    assert.match(FORM_DEDUP_KEY, /FLOOR\(EXTRACT\(EPOCH FROM received_at\) \/ 2\)/);
    assert.match(FORM_ID_CASE, /extra_data->>'formId'/);
    assert.match(FORM_ID_CASE, /extra_data->>'action'/);
});
