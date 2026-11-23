// Push to the mobile app (api/_mobile-push.js): token checks, per-language
// wording, batching, removing uninstalled phones, and the alert list.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { EXPO_TOKEN_RE, MAX_DEVICES_PER_USER, analyticsAlertMessage, registerDevice, sendMobilePush, listAlerts } from "../api/_mobile-push.js";

const member = { organisationId: 7, email: "felix@example.com" };
const token = (n) => `ExponentPushToken[device${String(n).padStart(6, "0")}xx]`;

function fakeDb(devices = []) {
    const deleted = [];
    return {
        devices, deleted,
        async query(sql, params = []) {
            if (/CREATE TABLE/.test(sql)) return { rows: [] };
            if (/SELECT COUNT\(\*\)::int AS n FROM mobile_push_devices/.test(sql)) return { rows: [{ n: devices.filter((d) => d.email === params[0] && d.expo_token !== params[1]).length }] };
            if (/INSERT INTO mobile_push_devices/.test(sql)) { devices.push({ expo_token: params[0], organisation_id: params[1], email: params[2], language: params[4] }); return { rows: [] }; }
            if (/SELECT expo_token, language FROM mobile_push_devices/.test(sql)) return { rows: devices.filter((d) => d.organisation_id === params[0]) };
            if (/DELETE FROM mobile_push_devices WHERE expo_token = ANY/.test(sql)) { deleted.push(...params[0]); return { rows: [] }; }
            if (/FROM analytics_alert_history/.test(sql)) return { rows: [{ id: 1, at: "2026-11-20T07:00:00Z", value: "34.5", metric: "traffic_drop", label: null, threshold: "30", operator: "gt", period_days: 7, domain: "a.test" }] };
            if (/FROM ad_notifications/.test(sql)) return { rows: [{ id: "x", at: "2026-11-22T07:00:00Z", domain: "a.test", severity: "warning", title: "Cost high", body: "CPC up" }] };
            throw new Error(`unexpected: ${sql.slice(0, 50)}`);
        },
    };
}

test("mobile push: only real Expo tokens register; devices per account are capped", async () => {
    assert.ok(EXPO_TOKEN_RE.test(token(1)));
    assert.ok(!EXPO_TOKEN_RE.test("https://evil.test"));
    const db = fakeDb();
    assert.equal((await registerDevice(db, { member, token: "nope" })).status, 400);
    assert.ok((await registerDevice(db, { member, token: token(1), platform: "ios", language: "de" })).ok);
    assert.equal(db.devices[0].language, "de");
    for (let i = 2; i <= MAX_DEVICES_PER_USER; i++) await registerDevice(db, { member, token: token(i) });
    assert.equal((await registerDevice(db, { member, token: token(99) })).status, 429);
});

test("mobile push: analytics alerts are worded in each phone's language", () => {
    const alert = { metric: "traffic_drop", domain: "a.test", value: 34.56, threshold: 30 };
    assert.deepEqual(analyticsAlertMessage(alert, "en"), { title: "Traffic drop · a.test", body: "Now 34.6 % — your alert is set at 30 %." });
    assert.equal(analyticsAlertMessage(alert, "de").title, "Traffic-Rückgang · a.test");
    assert.match(analyticsAlertMessage(alert, "de").body, /34,6 %/);
    assert.equal(analyticsAlertMessage({ ...alert, label: "My rule" }, "fr").title, "My rule · a.test");
    assert.equal(analyticsAlertMessage({ ...alert, metric: "zero_conversions", value: 0, threshold: 1 }, "xx").body, "Now 0 — your alert is set at 1.");
});

test("mobile push: sends in batches of 100 and drops uninstalled phones", async () => {
    const devices = Array.from({ length: 150 }, (_, i) => ({ expo_token: token(i), organisation_id: 7, language: i % 2 ? "de" : "en" }));
    const db = fakeDb(devices);
    const calls = [];
    const fetchImpl = async (url, opts) => {
        const batch = JSON.parse(opts.body);
        calls.push(batch);
        return { json: async () => ({ data: batch.map((m) => (m.to === token(3) ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" })) }) };
    };
    const result = await sendMobilePush(db, 7, { analytics: { metric: "traffic_drop", domain: "a.test", value: 40, threshold: 30 } }, { fetchImpl, data: { type: "alert" } });
    assert.deepEqual(calls.map((c) => c.length), [100, 50]);
    assert.equal(calls[0][1].title, "Traffic-Rückgang · a.test", "German phone gets German");
    assert.equal(calls[0][0].channelId, "alerts");
    assert.equal(result.sent, 149);
    assert.deepEqual(db.deleted, [token(3)]);
});

test("mobile push: no phones, or a failing push service, never throws", async () => {
    assert.deepEqual(await sendMobilePush(fakeDb([]), 7, { title: "t", body: "b" }), { sent: 0, removed: 0 });
    const db = fakeDb([{ expo_token: token(1), organisation_id: 7, language: "en" }]);
    const out = await sendMobilePush(db, 7, { title: "t", body: "b" }, { fetchImpl: async () => { throw new Error("down"); } });
    assert.deepEqual(out, { sent: 0, removed: 0 });
});

test("mobile push: alert list merges analytics and ad alerts, newest first", async () => {
    const items = await listAlerts(fakeDb(), 7);
    assert.deepEqual(items.map((i) => i.id), ["ads:x", "analytics:1"]);
    assert.equal(items[1].value, 34.5);
    assert.equal(items[1].threshold, 30);
});
