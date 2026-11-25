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

    // [name, kind, extra_data, expectedTier]
    const cases = [
        ["form_submit", "custom", { formId: "contact" }, "lead"],
        ["form_submit", null, null, "lead"],
        ["booked", "lead", null, "lead"],
        ["purchase", "purchase", null, "sale"],
        ["add_to_cart_event", "add_to_cart", null, "sale"],
        ["clicked_book_demo", "click", null, "intent"],
        ["scroll_depth", null, null, "micro"],
        ["something_custom", "custom", null, "micro"],
        // Forms marked "not a lead" in analytics_form_goals — by id, and by
        // action when the id is a placeholder (same as the Forms report)
        ["form_submit", "custom", { formId: "newsletter" }, "micro"],
        ["form_submit", null, { formId: "form", action: "/subscribe" }, "micro"],
        ["form_submit", null, { formId: "book-demo" }, "lead"],
    ];

    test("tierCaseSql's Postgres SQL matches every expected case", async () => {
        try {
            const values = cases.map((_, i) => `($${i * 3 + 1}::text, $${i * 3 + 2}::text, $${i * 3 + 3}::jsonb, ${i})`).join(", ");
            // The CTE stands in for the real analytics_form_goals table (a CTE
            // name shadows a table of the same name), so nothing is written.
            const sql = `
                WITH analytics_form_goals(site_id, form_id, lead_type, counts) AS (
                    VALUES ('s1', 'newsletter', NULL::text, false), ('s1', '/subscribe', NULL, false), ('s1', 'book-demo', 'Demo', true)
                )
                SELECT ace.i, ${tierCaseSql("ace", "ace")} AS tier
                FROM (SELECT 's1'::text AS site_id, v.* FROM (VALUES ${values}) AS v(name, kind, extra_data, i)) AS ace`;
            const params = cases.flatMap(([name, kind, extra]) => [name, kind, extra ? JSON.stringify(extra) : null]);
            const { rows } = await pool.query(sql, params);

            cases.forEach(([name, kind, extra, expected], i) => {
                const row = rows.find(r => r.i === i);
                assert.ok(row, `no row returned for ${name}/${kind}`);
                assert.strictEqual(row.tier, expected, `expected tier=${expected} for ${name}/${kind}/${JSON.stringify(extra)}, got ${row.tier}`);
            });
        } finally {
            await pool.end();
        }
    });
}
