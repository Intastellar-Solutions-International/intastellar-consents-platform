/**
 * GET /api/cookie-lookup?name=<cookie_name>
 *
 * Public cookie database endpoint — no authentication required.
 * Returns vendor, category, description and privacy metadata for a given
 * cookie name. Designed to be called from intastellar.eu's cookie database page.
 *
 *   GET /api/cookie-lookup          → { total, cookies: [...] } — all known + discovered entries
 *   GET /api/cookie-lookup?name=_ga → single cookie object
 *
 * The list merges two sources:
 *   "verified"   — static entries from _scan-core.js (COOKIE_META, COOKIE_NAME_PATTERNS, COOKIE_VENDOR_HINTS)
 *   "discovered" — cookies seen in scans but not yet in the static DB (cookie_discoveries table)
 *
 * CORS: wildcard — safe to call from any website.
 */

import pkg from "pg";
const { Pool } = pkg;
import {
    describeCookie,
    categoryFromCookieName,
    vendorFromCookieName,
    VENDOR_META,
    COOKIE_META,
    COOKIE_NAME_PATTERNS,
    COOKIE_VENDOR_HINTS,
    DATA_COUNTRIES,
    DATA_REGIONS,
} from "./_scan-core.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return pool;
}

function buildVerifiedEntry(key, isPrefix, description) {
    const vendor     = vendorFromCookieName(key);
    const category   = categoryFromCookieName(key);
    const vendorInfo = vendor ? VENDOR_META[vendor] : null;
    return {
        name:              isPrefix ? key + "*" : key,
        isPrefix,
        source:            "verified",
        vendor:            vendor    ?? null,
        category:          category  ?? null,
        description:       description ?? null,
        dataCountry:       vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
        dataRegion:        vendor ? (DATA_REGIONS[vendor]   ?? null) : null,
        privacyUrl:        vendorInfo?.privacyUrl        ?? null,
        legalBasis:        vendorInfo?.legalBasis        ?? null,
        transferMechanism: vendorInfo?.transferMechanism ?? null,
    };
}

// Build the static verified list from all three _scan-core.js arrays
function buildVerifiedList() {
    const map = new Map();
    for (const p of COOKIE_META) {
        if (p.exact)  map.set("e:" + p.exact,  buildVerifiedEntry(p.exact,  false, p.description));
        if (p.prefix) map.set("p:" + p.prefix, buildVerifiedEntry(p.prefix, true,  p.description));
    }
    for (const p of COOKIE_NAME_PATTERNS) {
        const k = p.exact ? "e:" + p.exact : p.prefix ? "p:" + p.prefix : null;
        if (!k || map.has(k)) continue;
        map.set(k, buildVerifiedEntry(p.exact ?? p.prefix, !!p.prefix, null));
    }
    for (const p of COOKIE_VENDOR_HINTS) {
        const k = p.exact ? "e:" + p.exact : p.prefix ? "p:" + p.prefix : null;
        if (!k || map.has(k)) continue;
        map.set(k, buildVerifiedEntry(p.exact ?? p.prefix, !!p.prefix, null));
    }
    return map;
}

// Build the set of exact names + prefixes already covered by static data
function buildVerifiedNameSet(verifiedMap) {
    const names = new Set();
    for (const [k] of verifiedMap) {
        // k is "e:name" or "p:prefix"
        names.add(k.slice(2));
    }
    return names;
}

async function loadDefinitions(db) {
    try {
        const { rows } = await db.query(
            `SELECT name, is_prefix, vendor, category, description,
                    privacy_url, legal_basis, transfer_mechanism
               FROM cookie_definitions
              ORDER BY name`
        );
        return rows.map(r => ({
            name:              r.is_prefix ? r.name + "*" : r.name,
            isPrefix:          r.is_prefix,
            source:            "promoted",
            vendor:            r.vendor            ?? null,
            category:          r.category          ?? null,
            description:       r.description       ?? null,
            dataCountry:       r.vendor ? (DATA_COUNTRIES[r.vendor] ?? null) : null,
            dataRegion:        r.vendor ? (DATA_REGIONS[r.vendor]   ?? null) : null,
            privacyUrl:        r.privacy_url        ?? null,
            legalBasis:        r.legal_basis        ?? null,
            transferMechanism: r.transfer_mechanism ?? null,
        }));
    } catch (_) {
        return [];
    }
}

async function loadDiscoveries(db, excludeNames) {
    try {
        const { rows } = await db.query(
            `SELECT name, times_seen, first_seen_at, last_seen_at,
                    example_sites, has_vendor, has_category
               FROM cookie_discoveries
              ORDER BY times_seen DESC`
        );
        return rows
            .filter(r => !excludeNames.has(r.name))
            .map(r => {
                const vendor   = vendorFromCookieName(r.name);
                const category = categoryFromCookieName(r.name);
                const vendorInfo = vendor ? VENDOR_META[vendor] : null;
                return {
                    name:             r.name,
                    isPrefix:         false,
                    source:           "discovered",
                    vendor:           vendor   ?? null,
                    category:         category ?? null,
                    description:      null,
                    dataCountry:      vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
                    dataRegion:       vendor ? (DATA_REGIONS[vendor]   ?? null) : null,
                    privacyUrl:       vendorInfo?.privacyUrl        ?? null,
                    legalBasis:       vendorInfo?.legalBasis        ?? null,
                    transferMechanism: vendorInfo?.transferMechanism ?? null,
                    timesSeen:        r.times_seen,
                    firstSeenAt:      r.first_seen_at,
                    lastSeenAt:       r.last_seen_at,
                    exampleSites:     r.example_sites ?? [],
                };
            });
    } catch (_) {
        // Table may not exist yet on first deploy
        return [];
    }
}

function lookupByName(rawName) {
    const vendor      = vendorFromCookieName(rawName);
    const category    = categoryFromCookieName(rawName);
    const description = describeCookie(rawName);
    const vendorInfo  = vendor ? VENDOR_META[vendor] : null;
    return {
        name:              rawName,
        isPrefix:          false,
        source:            description ? "verified" : "unknown",
        vendor:            vendor    ?? null,
        category:          category  ?? null,
        description:       description ?? null,
        dataCountry:       vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
        dataRegion:        vendor ? (DATA_REGIONS[vendor]   ?? null) : null,
        privacyUrl:        vendorInfo?.privacyUrl        ?? null,
        legalBasis:        vendorInfo?.legalBasis        ?? null,
        transferMechanism: vendorInfo?.transferMechanism ?? null,
    };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { name } = req.query ?? {};

    // Single cookie lookup — static only (fast, no DB)
    if (name && typeof name === "string") {
        const clean = name.trim();
        if (!clean || clean.length > 200) {
            return res.status(400).json({ error: "Invalid cookie name" });
        }
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        return res.json(lookupByName(clean));
    }

    // Full list — static verified + DB promoted definitions + DB discovered
    const verifiedMap  = buildVerifiedList();
    const verifiedList = [...verifiedMap.values()];
    const excludeNames = buildVerifiedNameSet(verifiedMap);

    const db          = getPool();
    const [definitions, discovered] = await Promise.all([
        loadDefinitions(db),
        loadDiscoveries(db, excludeNames),
    ]);

    // Promoted definitions also excluded from discovered list
    const promotedNames = new Set(definitions.map(d => d.isPrefix ? d.name.slice(0, -1) : d.name));
    const filteredDiscovered = discovered.filter(d => !promotedNames.has(d.name));

    const cookies = [...verifiedList, ...definitions, ...filteredDiscovered];

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.json({
        total:      cookies.length,
        verified:   verifiedList.length,
        promoted:   definitions.length,
        discovered: filteredDiscovered.length,
        cookies,
    });
}
