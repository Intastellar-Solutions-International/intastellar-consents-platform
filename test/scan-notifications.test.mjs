// Notifications raised from cookie scans: what triggers them and what repeats.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { buildScanNotifications, selectNotifications, groupScans, syncScanNotifications, getNotificationPreferences, setNotificationPreference, NOTIFICATION_TYPES } from "../api/_scan-notifications.js";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const t = (service, category, phase = "pre", host = `${service.toLowerCase().replace(/\s/g, "")}.example`) => ({ service, host, category, dataRegion: "non-eu", consentPhase: phase });
const scan = (id, transfers, over = {}) => ({ id, scanned_at: "2026-11-08T12:00:00Z", status: "completed", transfers, cookies: [], ...over });
const build = (args) => buildScanNotifications({ domain: "a.com", ...args }, NOW);
const types = (list) => list.map((n) => n.rule_type);

test("notifications: the first scan raises every tracker found before consent", () => {
    const [n] = build({ latest: scan(1, [t("Google Analytics", "analytics"), t("Meta", "advertising")]) });
    assert.strictEqual(n.rule_type, "trackers_before_consent");
    assert.strictEqual(n.severity, "critical");
    assert.match(n.body, /Meta, Google Analytics/);
    assert.strictEqual(n.scan_id, 1);
});

test("notifications: only vendors new since the previous scan are raised", () => {
    const previous = scan(1, [t("Meta", "advertising")]);
    assert.deepStrictEqual(build({ latest: scan(2, [t("Meta", "advertising")]), previous }), []);
    const [n] = build({ latest: scan(2, [t("Meta", "advertising"), t("Clarity", "analytics")]), previous });
    assert.strictEqual(n.body, "Clarity");
});

test("notifications: vendors after consent or on older scans are not called pre-consent", () => {
    assert.deepStrictEqual(build({ latest: scan(1, [t("Meta", "advertising", "post")]) }), []);
    assert.deepStrictEqual(build({ latest: scan(1, [{ service: "Meta", host: "m.example", category: "advertising" }]) }), []);
});

test("notifications: reject, second banner, stale and failed scans each raise their type", () => {
    const pass = { available: true, transfers: [t("Clarity", "analytics")], cookies: [] };
    const latest = scan(5, [t("HubSpot Cookie Banner", "cmp", "pre", "js-eu1.hs-banner.com")], { reject_pass: pass, scanned_at: "2026-10-01T12:00:00Z" });
    const failed = { id: 9, scanned_at: "2026-11-08T12:00:00Z", status: "failed" };
    assert.deepStrictEqual(types(build({ latest, failed })).sort(), ["scan_failed", "scan_out_of_date", "second_consent_banner", "vendors_after_reject"]);
});

test("notifications: our own CMP is not a second banner", () => {
    assert.deepStrictEqual(build({ latest: scan(1, [t("Intastellar Consents", "cmp", "pre", "cdn.intastellar.eu")]) }), []);
});

test("notifications: a failure older than the latest good scan is ignored", () => {
    assert.deepStrictEqual(build({ latest: scan(1, []), failed: { id: 2, scanned_at: "2026-11-01T12:00:00Z" } }), []);
});

test("notifications: turned-off types are dropped and the most serious come first", () => {
    const items = [{ rule_type: "scan_out_of_date", severity: "info" }, { rule_type: "trackers_before_consent", severity: "critical" }, { rule_type: "scan_failed", severity: "warning" }];
    assert.deepStrictEqual(types(selectNotifications(items, new Set(["scan_failed"]))), ["trackers_before_consent", "scan_out_of_date"]);
});

test("notifications: www and bare scans of a domain are one domain, newest first", () => {
    const [g] = groupScans([scan(1, [], { domain: "www.a.com", scanned_at: "2026-11-01T00:00:00Z" }), scan(2, [], { domain: "a.com", scanned_at: "2026-11-05T00:00:00Z" })]);
    assert.strictEqual(g.domain, "a.com");
    assert.deepStrictEqual([g.latest.id, g.previous.id], [2, 1]);
});

function fakeDb({ due = true, scans = [], prefs = [] } = {}) {
    const calls = [];
    return { calls, query: async (sql, params) => {
        calls.push({ sql, params });
        if (/INSERT INTO notification_sync/.test(sql)) return { rows: due ? [{ organisation_id: 7 }] : [] };
        if (/FROM pre_consent_scans/.test(sql)) return { rows: scans };
        if (/SELECT type, enabled/.test(sql)) return { rows: prefs };
        return { rows: [], rowCount: 1 };
    } };
}

test("notifications: sync is throttled, so polling does not rescan the database", async () => {
    const db = fakeDb({ due: false });
    assert.strictEqual(await syncScanNotifications(db, 7, ["a.com"], NOW), 0);
    assert.ok(!db.calls.some((c) => /FROM pre_consent_scans/.test(c.sql)));
});

test("notifications: sync inserts idempotently and respects the organisation scope", async () => {
    const db = fakeDb({ scans: [scan(1, [t("Meta", "advertising")], { domain: "a.com" })] });
    assert.strictEqual(await syncScanNotifications(db, 7, ["a.com"], NOW), 1);
    const read = db.calls.find((c) => /FROM pre_consent_scans/.test(c.sql));
    assert.match(read.sql, /organisation_id = \$2 OR organisation_id IS NULL/);
    assert.match(db.calls.find((c) => /INSERT INTO ad_notifications/.test(c.sql)).sql, /DO NOTHING/);
});

test("notifications: everything is on by default and a type can be turned off", async () => {
    assert.ok((await getNotificationPreferences(fakeDb(), 7)).every((p) => p.enabled));
    assert.strictEqual((await getNotificationPreferences(fakeDb({ prefs: [{ type: "scan_failed", enabled: false }] }), 7)).find((p) => p.id === "scan_failed").enabled, false);
    assert.strictEqual(NOTIFICATION_TYPES.length, 5);
    assert.strictEqual(await setNotificationPreference(fakeDb(), 7, "made_up", false), false);
});
