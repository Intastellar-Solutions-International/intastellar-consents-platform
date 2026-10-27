// Integration test: runs FORM_DEDUP_KEY's actual Postgres SQL over a
// literal VALUES list (no real table touched) to verify the dedup behavior
// end-to-end — a full-consent session double-submitting collapses to 1,
// and two different minimal-consent visitors within the same 2s bucket on
// different pages do NOT collapse into each other. Skips if no DB
// connection is configured. See docs/analytics-audit-plan.md item 7.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { FORM_DEDUP_KEY } from "../api/analytics-forms.js";

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
    test("FORM_DEDUP_KEY SQL (skipped — no POSTGRES_URL configured)", () => {});
} else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });

    async function countDistinctKeys(rowsSql) {
        const { rows } = await pool.query(`
            SELECT COUNT(DISTINCT ${FORM_DEDUP_KEY}) AS n
            FROM (VALUES ${rowsSql}) AS t(session_id, pathname, extra_data, received_at)
        `);
        return Number(rows[0].n);
    }

    test("FORM_DEDUP_KEY collapses a full-consent session's double-submit to one", async () => {
        const n = await countDistinctKeys(`
            ('sess-1'::text, '/book-demo'::text, '{"formId":"book-demo"}'::jsonb, '2026-10-01T10:00:00Z'::timestamptz),
            ('sess-1'::text, '/book-demo'::text, '{"formId":"book-demo"}'::jsonb, '2026-10-01T10:00:05Z'::timestamptz)
        `);
        assert.strictEqual(n, 1);
    });

    test("FORM_DEDUP_KEY does not collapse two different minimal-consent visitors on the same form on different pages", async () => {
        const n = await countDistinctKeys(`
            (NULL::text, '/book-demo'::text, '{"formId":"book-demo"}'::jsonb, '2026-10-01T10:00:00Z'::timestamptz),
            (NULL::text, '/request-free-trial'::text, '{"formId":"book-demo"}'::jsonb, '2026-10-01T10:00:00Z'::timestamptz)
        `);
        assert.strictEqual(n, 2);
    });

    test("FORM_DEDUP_KEY collapses two minimal-consent submits on the same page within the same 2s bucket (a retry/double-click)", async () => {
        try {
            const n = await countDistinctKeys(`
                (NULL::text, '/book-demo'::text, '{"formId":"book-demo"}'::jsonb, '2026-10-01T10:00:00.100Z'::timestamptz),
                (NULL::text, '/book-demo'::text, '{"formId":"book-demo"}'::jsonb, '2026-10-01T10:00:01.900Z'::timestamptz)
            `);
            assert.strictEqual(n, 1);
        } finally {
            await pool.end();
        }
    });
}
