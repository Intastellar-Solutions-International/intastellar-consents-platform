/**
 * GET /api/cron-enrich-discoveries
 *
 * Daily cron job — enriches pending cookie_discoveries rows with vendor,
 * category and description suggestions from two external sources:
 *
 *   1. DuckDuckGo Tracker Radar (TDS) — maps known tracker domains to
 *      categories and owner names. Matched against cookie_domains stored
 *      alongside each discovery.
 *
 *   2. IAB TCF Global Vendor List v3 — maps IAB-registered vendor names to
 *      privacy URLs and declared purposes. Used to enrich vendor metadata
 *      when a vendor name is already known from static patterns.
 *
 * Also runs our static functions (vendorFromCookieName, categoryFromCookieName)
 * to fill enriched_vendor / enriched_category for any row that was inserted
 * before those patterns existed.
 *
 * Secured via CRON_SECRET (same pattern as cron-scan-domains).
 */

import pkg from "pg";
const { Pool } = pkg;
import {
    vendorFromCookieName,
    categoryFromCookieName,
    VENDOR_META,
} from "./_scan-core.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
        });
    }
    return pool;
}

// DDG category → our banner category
const DDG_CATEGORY_MAP = {
    "Advertising Networks":          "marketing",
    "Action Pixels":                 "marketing",
    "Analytics":                     "analytics",
    "Audience Measurement":          "analytics",
    "Third-Party Analytics Scripts": "analytics",
    "Social Network":                "marketing",
    "Federated Login":               "functional",
    "Tag Manager":                   "functional",
    "Non-Tracking":                  "functional",
    "Badge":                         "functional",
    "CDN":                           "functional",
    "Embedded Content":              "functional",
    "Session Replay":                "analytics",
    "Online Payment":                "necessary",
};

// IAB purpose IDs → our category (primary purpose wins)
function iabPurposesToCategory(purposes = [], legIntPurposes = []) {
    const all = [...purposes, ...legIntPurposes];
    if (all.includes(2) || all.includes(3) || all.includes(4)) return "marketing";
    if (all.includes(7) || all.includes(8) || all.includes(9)) return "analytics";
    return "functional";
}

async function fetchDDGTrackers() {
    try {
        const res = await fetch(
            "https://raw.githubusercontent.com/duckduckgo/tracker-radar/main/build-data/generated/tds.json",
            { signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchIABVendorList() {
    try {
        const res = await fetch(
            "https://vendor-list.consensu.org/v3/vendor-list.json",
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Build domain → {vendor, category} map from DDG TDS
function buildDDGMap(tds) {
    if (!tds?.trackers) return new Map();
    const map = new Map();
    for (const [domain, data] of Object.entries(tds.trackers)) {
        const rootDomain = domain.split(".").slice(-2).join(".");
        const category = DDG_CATEGORY_MAP[data.category] ?? null;
        const vendor   = data.owner?.name ?? null;
        if (category || vendor) map.set(rootDomain, { vendor, category });
    }
    return map;
}

// Build vendor name (lowercased) → {privacyUrl, legalBasis} map from IAB GVL
function buildIABMap(gvl) {
    if (!gvl?.vendors) return new Map();
    const map = new Map();
    for (const v of Object.values(gvl.vendors)) {
        if (!v.name) continue;
        const category = iabPurposesToCategory(v.purposes, v.legIntPurposes);
        map.set(v.name.toLowerCase(), {
            privacyUrl: v.policyUrl ?? null,
            legalBasis: (v.purposes?.includes(1) && !v.legIntPurposes?.length) ? "consent" : "legitimate_interest",
            category,
        });
    }
    return map;
}

export default async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const db = getPool();

    // Ensure schema is up to date
    await db.query(`
        ALTER TABLE cookie_discoveries
            ADD COLUMN IF NOT EXISTS status             TEXT    DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS cookie_domains     TEXT[]  DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS enriched_vendor    TEXT,
            ADD COLUMN IF NOT EXISTS enriched_category  TEXT,
            ADD COLUMN IF NOT EXISTS enriched_description TEXT,
            ADD COLUMN IF NOT EXISTS enriched_source    TEXT
    `).catch(() => {});

    const { rows: pending } = await db.query(`
        SELECT name, cookie_domains, has_vendor, has_category
          FROM cookie_discoveries
         WHERE status = 'pending' OR enriched_vendor IS NULL
         LIMIT 500
    `);

    if (!pending.length) {
        return res.json({ enriched: 0, message: "No pending discoveries" });
    }

    console.log(`[cron-enrich] fetching external sources for ${pending.length} entries`);
    const [tdsData, gvlData] = await Promise.all([fetchDDGTrackers(), fetchIABVendorList()]);

    const ddgMap = buildDDGMap(tdsData);
    const iabMap = buildIABMap(gvlData);

    let enriched = 0;
    for (const row of pending) {
        let vendor    = vendorFromCookieName(row.name);
        let category  = categoryFromCookieName(row.name);
        let source    = vendor || category ? "static_patterns" : null;

        // Try DDG Tracker Radar via cookie_domains
        if ((!vendor || !category) && row.cookie_domains?.length) {
            for (const cd of row.cookie_domains) {
                const root = cd.replace(/^\./, "").split(".").slice(-2).join(".");
                const match = ddgMap.get(root);
                if (match) {
                    vendor   = vendor   || match.vendor;
                    category = category || match.category;
                    source   = "ddg_tracker_radar";
                    break;
                }
            }
        }

        // Enrich with IAB GVL metadata for the vendor
        let iabMeta = null;
        if (vendor) {
            iabMeta = iabMap.get(vendor.toLowerCase()) ?? null;
            if (!iabMeta) {
                // Fuzzy: check if any IAB vendor name contains our vendor string
                for (const [key, val] of iabMap) {
                    if (key.includes(vendor.toLowerCase()) || vendor.toLowerCase().includes(key)) {
                        iabMeta = val;
                        break;
                    }
                }
            }
            if (iabMeta) {
                category = category || iabMeta.category;
                source   = source ?? "iab_gvl";
            }
        }

        // Heuristic keyword detection for truly unknown cookies
        if (!category) {
            const n = row.name.toLowerCase();
            if (/consent|gdpr|cookie|privacy|policy|ccpa|optanon/.test(n)) category = "necessary";
            else if (/session|sess|auth|login|csrf|xsrf|token/.test(n))    category = "necessary";
            else if (/track|pixel|click|ad_|advert|retarget/.test(n))      category = "marketing";
            else if (/analytics|stat|metric|measure|beacon/.test(n))       category = "analytics";
            else if (/lang|locale|currency|region|country|pref/.test(n))   category = "functional";
            if (category) source = source ?? "heuristic";
        }

        // Vendor metadata description hint
        const vmeta = vendor ? VENDOR_META[vendor] : null;
        const description = vmeta ? `${vendor} — ${vmeta.description}.` : null;

        if (vendor || category) {
            await db.query(`
                UPDATE cookie_discoveries SET
                    enriched_vendor      = $1,
                    enriched_category    = $2,
                    enriched_description = $3,
                    enriched_source      = $4
                WHERE name = $5
            `, [vendor || null, category || null, description, source, row.name]);
            enriched++;
        }
    }

    console.log(`[cron-enrich] enriched ${enriched}/${pending.length} discoveries`);
    return res.json({ enriched, total: pending.length });
}
