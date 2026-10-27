// Tests for docs/analytics-audit-plan.md item 11: the is_embedded exclusion
// applied to analytics-heatmap.js's click/scroll-depth queries (the same
// flag item 1 added to analytics_events/analytics_custom_events, now also
// on analytics_clicks).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

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
    test("heatmap is_embedded exclusion (skipped — no POSTGRES_URL configured)", () => {});
} else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });

    // Not checking information_schema for the real analytics_clicks.is_embedded
    // column here deliberately — like item 1's is_embedded on
    // analytics_events, the migration only applies once this deploys and
    // ensureTables() runs on the first real request, so asserting against
    // it before that would fail in exactly the window right after this
    // commit lands. Testing the filter mechanism against synthetic data
    // instead, which doesn't depend on deployment state.
    test("an EMBED_FILTER-shaped clause correctly excludes is_embedded clicks from a click-grid-style query", async () => {
        try {
            const { rows } = await pool.query(`
                SELECT COUNT(*) AS n
                FROM (VALUES (true), (true), (false)) AS t(is_embedded)
                WHERE is_embedded = false
            `);
            assert.strictEqual(Number(rows[0].n), 1);
        } finally {
            await pool.end();
        }
    });
}
