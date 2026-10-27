// Tests for docs/analytics-audit-plan.md item 10: winsorization, the CLS
// zero-guard parity bug between api/analytics-performance.js and
// api/analytics-page-weight.js, and the third-party resource filter.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { Pn as PerfPn, MIN_BUSINESS_IMPACT_SAMPLE, MIN_BUSINESS_IMPACT_CONVERSIONS } from "../api/analytics-performance.js";
import { Pn as PageWeightPn } from "../api/analytics-page-weight.js";

test("MIN_BUSINESS_IMPACT_SAMPLE and MIN_BUSINESS_IMPACT_CONVERSIONS are sane positive thresholds", () => {
    assert.ok(MIN_BUSINESS_IMPACT_SAMPLE > 0);
    assert.ok(MIN_BUSINESS_IMPACT_CONVERSIONS > 0);
});

test("lowSample logic catches a large-session/tiny-conversion bucket, not just a tiny-session bucket — the real asasoftware.aero case (351 sessions, 2 conversions)", () => {
    const sessions = 351, conversions = 2;
    const lowSample = sessions < MIN_BUSINESS_IMPACT_SAMPLE || conversions < MIN_BUSINESS_IMPACT_CONVERSIONS;
    assert.strictEqual(lowSample, true, "a session-count-only floor would have missed this — the bug the original guard almost shipped with");
});

test("lowSample logic does not flag a bucket with both plenty of sessions and plenty of conversions", () => {
    const sessions = 351, conversions = 40;
    const lowSample = sessions < MIN_BUSINESS_IMPACT_SAMPLE || conversions < MIN_BUSINESS_IMPACT_CONVERSIONS;
    assert.strictEqual(lowSample, false);
});

test("Pn's SQL caps lcp/inp/load/tbt with LEAST(), but not cls", () => {
    assert.match(PerfPn("lcp", 0.75), /LEAST\(\(extra_data->>'lcp'\)::numeric, 60000\)/);
    assert.match(PerfPn("inp", 0.75), /LEAST\(\(extra_data->>'inp'\)::numeric, 10000\)/);
    assert.doesNotMatch(PerfPn("cls", 0.75), /LEAST/);
});

test("Pn's SQL keeps CLS=0 in the distribution (no zero-guard for cls)", () => {
    assert.doesNotMatch(PerfPn("cls", 0.75), /> 0/);
});

test("Pn's SQL excludes zero for every other metric", () => {
    assert.match(PerfPn("lcp", 0.75), /> 0/);
    assert.match(PerfPn("inp", 0.75), /> 0/);
});

test("analytics-page-weight.js's Pn now matches analytics-performance.js's Pn exactly for CLS — the exact bug fixed", () => {
    assert.strictEqual(PageWeightPn("cls", 0.75), PerfPn("cls", 0.75));
});

// ── Live-DB checks ──────────────────────────────────────────────────────────
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
    test("performance SQL (skipped — no POSTGRES_URL configured)", () => {});
} else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });

    test("winsorization caps a 217-second LCP outlier so it can't drag the P75 past the cap", async () => {
        try {
            const { rows } = await pool.query(`
                SELECT ${PerfPn("lcp", 0.99)} AS p99
                FROM (VALUES
                    ('{"lcp": 1000}'::jsonb), ('{"lcp": 1200}'::jsonb), ('{"lcp": 1500}'::jsonb),
                    ('{"lcp": 217000}'::jsonb)
                ) AS t(extra_data)
            `);
            assert.ok(Number(rows[0].p99) <= 60000, `expected capped P99 <= 60000, got ${rows[0].p99}`);
        } finally {
            await pool.end();
        }
    });

    test("the CLS 0.000-vs-0.499 bug: both files now agree on the same mixed zero/non-zero dataset", async () => {
        const pool2 = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
        try {
            const values = `
                ('{"cls": 0}'::jsonb), ('{"cls": 0}'::jsonb), ('{"cls": 0}'::jsonb),
                ('{"cls": 0}'::jsonb), ('{"cls": 0}'::jsonb), ('{"cls": 0}'::jsonb),
                ('{"cls": 0}'::jsonb), ('{"cls": 0}'::jsonb),
                ('{"cls": 0.5}'::jsonb), ('{"cls": 0.6}'::jsonb)
            `;
            const perfResult = await pool2.query(`SELECT ${PerfPn("cls", 0.75)} AS p75 FROM (VALUES ${values}) AS t(extra_data)`);
            const pwResult   = await pool2.query(`SELECT ${PageWeightPn("cls", 0.75)} AS p75 FROM (VALUES ${values}) AS t(extra_data)`);
            assert.strictEqual(Number(pwResult.rows[0].p75), Number(perfResult.rows[0].p75));
            // Mostly-zero data should produce a low (not inflated) P75.
            assert.ok(Number(perfResult.rows[0].p75) < 0.5, `expected a low P75, got ${perfResult.rows[0].p75}`);
        } finally {
            await pool2.end();
        }
    });
}
