// Integration test: runs the actual noiseReferralClause() SQL text against
// Postgres (not just checks the JS string) — the whole point of this clause
// is Postgres regex/LIKE semantics, which a pure string-content assertion
// can't catch a mistake in. Reads no real table; evaluates the boolean
// expression over a literal VALUES list. Skips (not fails) if no DB
// connection is configured, so `npm test` stays runnable without one.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { noiseReferralClause } from "../api/_self-referral.js";

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
    test("noiseReferralClause SQL (skipped — no POSTGRES_URL configured)", () => {});
} else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });

    const cases = [
        ["localhost", true],
        ["0.0.0.0", true],
        ["::1", true],
        ["dev.local", true],
        ["127.0.0.1", true],
        ["10.1.2.3", true],
        ["192.168.1.1", true],
        ["172.20.0.5", true],
        ["172.15.0.5", false], // just outside the 16-31 private range
        ["172.32.0.5", false], // just outside the 16-31 private range
        ["www.everydaydealsnow.com", true],
        ["everydaydealsnow.com", true],
        ["www.google.com", false],
        ["de.search.yahoo.com", false],
        [null, false],
    ];

    test("noiseReferralClause's Postgres SQL matches every expected case", async () => {
        try {
            const values = cases
                .map((_, i) => `($${i + 1}::text)`)
                .join(", ");
            const sql = `
                SELECT referrer_host, ${noiseReferralClause()} AS is_noise
                FROM (VALUES ${values}) AS t(referrer_host)`;
            const params = cases.map(([host]) => host);
            const { rows } = await pool.query(sql, params);

            for (const [host, expected] of cases) {
                const row = rows.find(r => r.referrer_host === host);
                assert.ok(row, `no row returned for ${host}`);
                assert.strictEqual(row.is_noise, expected, `expected is_noise=${expected} for referrer_host=${host}`);
            }
        } finally {
            await pool.end();
        }
    });
}
