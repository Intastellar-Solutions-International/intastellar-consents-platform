// Tests for docs/analytics-audit-plan.md item 9: resolveRetryStatuses()
// (api/ad-conversion-push.js) and summarizeFailureReasons() (api/analytics-
// attribution.js).
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { resolveRetryStatuses } from "../api/ad-conversion-push.js";
import { summarizeFailureReasons } from "../api/analytics-attribution.js";

test("resolveRetryStatuses defaults to ['pending'] only when nothing is passed — the cron's safety net", () => {
    assert.deepEqual(resolveRetryStatuses(undefined), ["pending"]);
    assert.deepEqual(resolveRetryStatuses(null), ["pending"]);
    assert.deepEqual(resolveRetryStatuses([]), ["pending"]);
});

test("resolveRetryStatuses includes 'failed' only when explicitly requested — the exact bug this item fixes", () => {
    assert.deepEqual(resolveRetryStatuses(["pending", "failed"]), ["pending", "failed"]);
    assert.deepEqual(resolveRetryStatuses(["failed"]), ["failed"]);
});

test("resolveRetryStatuses never allows retrying an already-'sent' row", () => {
    assert.deepEqual(resolveRetryStatuses(["sent"]), ["pending"]);
    assert.deepEqual(resolveRetryStatuses(["sent", "failed"]), ["failed"]);
});

test("resolveRetryStatuses dedupes", () => {
    assert.deepEqual(resolveRetryStatuses(["failed", "failed", "pending"]).sort(), ["failed", "pending"]);
});

test("summarizeFailureReasons groups failed pushes by error_message, sorted by count descending", () => {
    const pushes = [
        { status: "failed", error_message: "No ad platform connection found for this domain" },
        { status: "failed", error_message: "No ad platform connection found for this domain" },
        { status: "failed", error_message: "No Meta Pixel configured" },
        { status: "sent",   error_message: null },
        { status: "pending", error_message: null },
    ];
    assert.deepEqual(summarizeFailureReasons(pushes), [
        { message: "No ad platform connection found for this domain", count: 2 },
        { message: "No Meta Pixel configured", count: 1 },
    ]);
});

test("summarizeFailureReasons caps at the top 5 reasons", () => {
    const pushes = Array.from({ length: 6 }, (_, i) => ({
        status: "failed",
        error_message: `reason-${i}`,
    }));
    assert.strictEqual(summarizeFailureReasons(pushes).length, 5);
});

test("summarizeFailureReasons ignores rows with no error_message or non-failed status", () => {
    assert.deepEqual(summarizeFailureReasons([{ status: "sent" }, { status: "pending" }]), []);
});

test("summarizeFailureReasons groups Google errors that only differ by an embedded requestId", () => {
    const googleError = (requestId) =>
        `There was a problem with the request. — INVALID_ARGUMENT | {"@type":"type.googleapis.com/google.rpc.RequestInfo","requestId":"${requestId}"} | destinations[0].product_destination_id: The conversion action type is not valid.`;
    const pushes = [
        { status: "failed", error_message: googleError("t-aaa") },
        { status: "failed", error_message: googleError("t-bbb") },
        { status: "failed", error_message: googleError("t-ccc") },
    ];
    const result = summarizeFailureReasons(pushes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].count, 3);
    assert.ok(!result[0].message.includes("requestId"));
});
