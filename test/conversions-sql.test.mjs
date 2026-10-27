// Integration test: runs tierCaseSql()'s actual SQL against Postgres over a
// literal VALUES list (no real table touched), same reasoning as
// test/noise-referral-sql.test.mjs. Skips if no DB connection is configured.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { tierCaseSql } from "../api/_conversions.js";

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
    test("tierCaseSql SQL (skipped — no POSTGRES_URL configured)", () => {});
} else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });

    // [name, kind, expectedTier]
    const cases = [
        ["form_submit", "custom", "lead"],
        ["form_submit", null, "lead"],
        ["booked", "lead", "lead"],
        ["purchase", "purchase", "sale"],
        ["add_to_cart_event", "add_to_cart", "sale"],
        ["clicked_book_demo", "click", "intent"],
        ["scroll_depth", null, "micro"],
        ["something_custom", "custom", "micro"],
    ];

    test("tierCaseSql's Postgres SQL matches every expected case", async () => {
        try {
            const values = cases.map((_, i) => `($${i * 2 + 1}::text, $${i * 2 + 2}::text)`).join(", ");
            const sql = `
                SELECT ace.name, ace.kind, ${tierCaseSql("ace", "ace")} AS tier
                FROM (VALUES ${values}) AS ace(name, kind)`;
            const params = cases.flatMap(([name, kind]) => [name, kind]);
            const { rows } = await pool.query(sql, params);

            for (const [name, kind, expected] of cases) {
                const row = rows.find(r => r.name === name && r.kind === kind);
                assert.ok(row, `no row returned for ${name}/${kind}`);
                assert.strictEqual(row.tier, expected, `expected tier=${expected} for ${name}/${kind}, got ${row.tier}`);
            }
        } finally {
            await pool.end();
        }
    });
}
