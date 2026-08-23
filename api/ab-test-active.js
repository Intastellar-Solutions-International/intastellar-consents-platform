/**
 * GET /api/ab-test-active?site=<siteKey>&path=<pathname>
 *
 * Public, unauthenticated — same trust model as GET /api/a and
 * analytics-site-config.js (the site key is already embeddable/public).
 * Read by the embed script UNCONDITIONALLY on every pageload, regardless of
 * consent tier — variant application is rendering, not tracking, so it has
 * to work for every visitor. The exposure record (POST /api/a, t:'ab') is
 * also sent unconditionally, since assignment data is needed for valid test
 * results even from visitors who declined statistics cookies. This is why
 * this is a separate endpoint rather than an extension of
 * analytics-site-config.js, which is only ever fetched for full-consent
 * visitors (via bootstrapSiteFeatures()).
 *
 * Degrades to `{ test: null }` on any bad input or DB error — this fires on
 * every pageload across every customer site, so it must never surface as a
 * client-visible failure.
 */

import pkg from "pg";
const { Pool } = pkg;

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

// Strips a single trailing slash (but never the bare root) so a test saved
// as "/pricing" still matches a visit to "/pricing/" — same normalization
// applied to targetPath on write in api/ab-tests.js.
function normalizePath(p) {
    if (typeof p !== "string" || !p.startsWith("/")) return "/";
    if (p.length > 2000) return "/";
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

// A target_path ending in "/*" (e.g. "/*" for the whole site, "/blog/*" for
// that path and everything under it) matches any visited path sharing that
// prefix. Returns null for a plain, non-wildcard target_path.
function wildcardBase(targetPath) {
    return targetPath.endsWith("/*") ? targetPath.slice(0, -1) : null; // keeps the trailing "/"
}

// Higher = more specific. An exact match always outranks a wildcard, and
// among overlapping wildcards ("/*" vs "/blog/*") the longer, more specific
// one wins — so an org can run a whole-site split while still carving out
// one path for its own separate test. Returns -1 for no match.
function matchSpecificity(path, targetPath) {
    if (targetPath === path) return Infinity;
    const base = wildcardBase(targetPath);
    if (base === null) return -1;
    // "/blog/*" matches "/blog" itself as well as anything under it.
    if (path === base.slice(0, -1) || path.startsWith(base)) return base.length;
    return -1;
}

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_tests (
            id               BIGSERIAL    PRIMARY KEY,
            organisation_id  INTEGER      NOT NULL,
            domain           TEXT         NOT NULL,
            name             VARCHAR(120) NOT NULL,
            target_path      TEXT         NOT NULL DEFAULT '/',
            status           VARCHAR(16)  NOT NULL DEFAULT 'draft',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS traffic_split JSONB NOT NULL DEFAULT '{}'`).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS test_type VARCHAR(16) NOT NULL DEFAULT 'visual'`).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_test_variants (
            id               BIGSERIAL    PRIMARY KEY,
            test_id          BIGINT       NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_key      VARCHAR(64)  NOT NULL,
            label            VARCHAR(120),
            is_control       BOOLEAN      NOT NULL DEFAULT false,
            changes          JSONB        NOT NULL DEFAULT '[]',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (test_id, variant_key)
        )
    `).catch(() => {});
    await db.query(`ALTER TABLE ab_test_variants ADD COLUMN IF NOT EXISTS redirect_url TEXT`).catch(() => {});
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const siteId = String(req.query.site || "").slice(0, 32);
    if (!siteId) return res.status(400).end();

    const path = normalizePath(String(req.query.path || "/"));
    const host = String(req.query.host || "").trim().toLowerCase().slice(0, 255);

    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    const db = getPool();
    await ensureTables(db);

    try {
        const { rows: siteRows } = await db.query(
            `SELECT domain FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
            [siteId]
        ).catch(() => ({ rows: [] }));
        if (!siteRows.length) return res.status(200).json({ test: null });

        const domain = siteRows[0].domain;

        // Not filtered by target_path in SQL — a wildcard test's target_path
        // ("/*", "/blog/*") can't be matched with a plain equality check, and
        // a domain's running-test count is small enough that fetching them
        // all and matching in JS is cheap (this response is itself cached
        // for 60s, see Cache-Control above).
        const { rows } = await db.query(
            `SELECT t.id, t.target_path, t.traffic_split, t.test_type, t.updated_at,
                    v.id AS variant_id, v.variant_key, v.is_control, v.changes, v.redirect_url
             FROM ab_tests t
             JOIN ab_test_variants v ON v.test_id = t.id
             WHERE t.domain = $1 AND t.status = 'running'
               AND (t.ends_at IS NULL OR t.ends_at > NOW())
             ORDER BY t.updated_at DESC, v.is_control DESC, v.id ASC`,
            [domain]
        ).catch(() => ({ rows: [] }));

        if (!rows.length) return res.status(200).json({ test: null });

        // A test only applies on the exact host it was made for — including
        // url_split tests. Their cross-subdomain behaviour comes entirely
        // from redirect_url (e.g. an apex test's variant redirecting to
        // new.<domain>); it's not a reason to widen which hosts the test
        // itself is *eligible* on. Without this, a site key shared across
        // subdomains (e.g. a booking portal on book.<domain> using the same
        // key as the main site, sharing the root-domain session cookie —
        // see rootDomain()'s doc comment in the embed script) would apply a
        // test meant only for the main site/apex to every other subdomain
        // running that key too. `host` is only sent by embed scripts that
        // have picked up this fix, so an empty value (older cached script)
        // falls back to the pre-fix behaviour rather than silently dropping
        // every test.
        const hostMatchesSiteDomain = !host || host === domain;
        const scopedRows = hostMatchesSiteDomain ? rows : [];
        if (!scopedRows.length) return res.status(200).json({ test: null });

        // Pick the best-matching running test for this path: highest
        // specificity wins (exact > longest wildcard prefix), ties broken by
        // most-recently-updated.
        const byTest = new Map();
        for (const r of scopedRows) {
            if (!byTest.has(r.id)) byTest.set(r.id, { targetPath: r.target_path, updatedAt: r.updated_at });
        }
        let testId = null, bestSpecificity = -1, bestUpdatedAt = null;
        for (const [id, info] of byTest) {
            const spec = matchSpecificity(path, info.targetPath);
            if (spec < 0) continue;
            if (spec > bestSpecificity || (spec === bestSpecificity && (!bestUpdatedAt || info.updatedAt > bestUpdatedAt))) {
                bestSpecificity = spec; testId = id; bestUpdatedAt = info.updatedAt;
            }
        }
        if (testId === null) return res.status(200).json({ test: null });

        const variantRows = rows.filter(r => r.id === testId);

        const split = variantRows[0].traffic_split || {};
        const hasValidSplit = variantRows.every(r => {
            const w = split[r.variant_key];
            return typeof w === "number" && isFinite(w) && w >= 0;
        }) && variantRows.some(r => Number(split[r.variant_key]) > 0);

        let variants;
        const testType = variantRows[0].test_type || "visual";

        if (hasValidSplit) {
            const total = variantRows.reduce((s, r) => s + Number(split[r.variant_key]), 0);
            variants = variantRows.map(r => ({
                id: r.variant_id, variantKey: r.variant_key, isControl: r.is_control,
                changes: r.changes, redirectUrl: r.redirect_url || null,
                weight: Number(split[r.variant_key]) / total,
            }));
        } else {
            const equal = 1 / variantRows.length;
            variants = variantRows.map(r => ({
                id: r.variant_id, variantKey: r.variant_key, isControl: r.is_control,
                changes: r.changes, redirectUrl: r.redirect_url || null,
                weight: equal,
            }));
        }

        return res.status(200).json({
            test: { id: testId, targetPath: variantRows[0].target_path, testType, variants },
        });
    } catch {
        return res.status(200).json({ test: null });
    }
}
