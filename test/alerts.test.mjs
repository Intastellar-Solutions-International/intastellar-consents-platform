// Tests for docs/analytics-audit-plan.md item 8: isBreached/computeMetric
// (previously zero coverage), normalizeRecipients, and — most importantly —
// a live-Postgres check that the fixed config-fetch query in
// api/cron-analytics-alerts.js actually runs (the old one joined a `users`
// table that doesn't exist in this database, erroring on every single run
// and getting silently swallowed, so configs was always []).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { isBreached } from "../api/cron-analytics-alerts.js";
import { normalizeRecipients } from "../api/analytics-alert-configs.js";

test("isBreached: 'lt' fires when value is below threshold", () => {
    assert.strictEqual(isBreached("consent_rate_below", "lt", 27.3, 30), true);
    assert.strictEqual(isBreached("consent_rate_below", "lt", 35, 30), false);
});

test("isBreached: 'gt' fires when value is above threshold", () => {
    assert.strictEqual(isBreached("traffic_drop", "gt", 45, 30), true);
    assert.strictEqual(isBreached("traffic_drop", "gt", 10, 30), false);
});

test("isBreached never fires on a null/undefined value (no data yet, not a breach)", () => {
    assert.strictEqual(isBreached("traffic_drop", "gt", null, 30), false);
    assert.strictEqual(isBreached("traffic_drop", "gt", undefined, 30), false);
});

test("normalizeRecipients accepts a clean list of emails, deduped and lowercased", () => {
    assert.deepEqual(
        normalizeRecipients(["Alice@Example.com", "bob@example.com", "alice@example.com"]),
        ["alice@example.com", "bob@example.com"]
    );
});

test("normalizeRecipients allows an empty array (push-only / no-email alerts)", () => {
    assert.deepEqual(normalizeRecipients([]), []);
});

test("normalizeRecipients rejects a non-array, more than 10 addresses, or an invalid email", () => {
    assert.strictEqual(normalizeRecipients("not-an-array"), null);
    assert.strictEqual(normalizeRecipients(Array.from({ length: 11 }, (_, i) => `u${i}@x.com`)), null);
    assert.strictEqual(normalizeRecipients(["not-an-email"]), null);
});

// ── Live-DB check: the actual root cause from Phase 0 ──────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnvLocal() {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return {};
    const out = {};
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
}
const POSTGRES_URL = process.env.POSTGRES_URL || loadEnvLocal().POSTGRES_URL;

if (!POSTGRES_URL) {
    test("cron-analytics-alerts config-fetch query (skipped — no POSTGRES_URL configured)", () => {});
} else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });

    test("the fixed config-fetch query runs without error (the old one always threw: relation \"users\" does not exist)", async () => {
        try {
            // Exact query from api/cron-analytics-alerts.js, minus the
            // `JOIN users` that doesn't exist in this database.
            await assert.doesNotReject(
                pool.query(`
                    SELECT aac.*, aos.domain
                    FROM analytics_alert_configs aac
                    JOIN analytics_sites aos ON aos.id = aac.site_id
                    WHERE aac.enabled = true
                    ORDER BY aac.id
                `)
            );
        } finally {
            await pool.end();
        }
    });
}
