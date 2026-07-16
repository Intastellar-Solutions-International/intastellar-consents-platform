/**
 * GET /api/cookie-lookup?name=<cookie_name>
 *
 * Public cookie database endpoint — no authentication required.
 * Returns vendor, category, description and privacy metadata for a given
 * cookie name. Designed to be called from intastellar.eu's cookie database page.
 *
 *   GET /api/cookie-lookup          → { total, cookies: [...] } — all known entries
 *   GET /api/cookie-lookup?name=_ga → single cookie object
 *
 * The list merges all three knowledge sources from _scan-core.js:
 *   COOKIE_META          (descriptions)
 *   COOKIE_NAME_PATTERNS (category rules)
 *   COOKIE_VENDOR_HINTS  (vendor rules)
 * Each unique name/prefix appears once, enriched with all available data.
 *
 * CORS: wildcard — safe to call from any website.
 */

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

function buildEntry(key, isPrefix, description) {
    const lookupName = isPrefix ? key : key;
    const vendor     = vendorFromCookieName(lookupName);
    const category   = categoryFromCookieName(lookupName);
    const vendorInfo = vendor ? VENDOR_META[vendor] : null;

    return {
        name:              isPrefix ? key + "*" : key,
        isPrefix,
        vendor:            vendor ?? null,
        category:          category ?? null,
        description:       description ?? null,
        dataCountry:       vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
        dataRegion:        vendor ? (DATA_REGIONS[vendor]   ?? null) : null,
        privacyUrl:        vendorInfo?.privacyUrl        ?? null,
        legalBasis:        vendorInfo?.legalBasis        ?? null,
        transferMechanism: vendorInfo?.transferMechanism ?? null,
    };
}

function buildFullList() {
    // Map key: "e:<name>" or "p:<prefix>" → entry object
    const map = new Map();

    // 1. Seed from COOKIE_META (has descriptions — highest quality source)
    for (const p of COOKIE_META) {
        if (p.exact)  map.set("e:" + p.exact,  buildEntry(p.exact,  false, p.description));
        if (p.prefix) map.set("p:" + p.prefix, buildEntry(p.prefix, true,  p.description));
    }

    // 2. Fill gaps from COOKIE_NAME_PATTERNS (adds category-only entries)
    for (const p of COOKIE_NAME_PATTERNS) {
        const k = p.exact ? "e:" + p.exact : p.prefix ? "p:" + p.prefix : null;
        if (!k || map.has(k)) continue;
        const name = p.exact ?? p.prefix;
        map.set(k, buildEntry(name, !!p.prefix, null));
    }

    // 3. Fill gaps from COOKIE_VENDOR_HINTS (adds vendor-only entries)
    for (const p of COOKIE_VENDOR_HINTS) {
        const k = p.exact ? "e:" + p.exact : p.prefix ? "p:" + p.prefix : null;
        if (!k || map.has(k)) continue;
        const name = p.exact ?? p.prefix;
        map.set(k, buildEntry(name, !!p.prefix, null));
    }

    return [...map.values()];
}

function lookupByName(rawName) {
    const vendor     = vendorFromCookieName(rawName);
    const category   = categoryFromCookieName(rawName);
    const description = describeCookie(rawName);
    const vendorInfo = vendor ? VENDOR_META[vendor] : null;

    return {
        name:              rawName,
        isPrefix:          false,
        vendor:            vendor ?? null,
        category:          category ?? null,
        description:       description ?? null,
        dataCountry:       vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
        dataRegion:        vendor ? (DATA_REGIONS[vendor]   ?? null) : null,
        privacyUrl:        vendorInfo?.privacyUrl        ?? null,
        legalBasis:        vendorInfo?.legalBasis        ?? null,
        transferMechanism: vendorInfo?.transferMechanism ?? null,
    };
}

export default function handler(req, res) {
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

    // Single cookie lookup
    if (name && typeof name === "string") {
        const clean = name.trim();
        if (!clean || clean.length > 200) {
            return res.status(400).json({ error: "Invalid cookie name" });
        }
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        return res.json(lookupByName(clean));
    }

    // Full list — merged from all three knowledge sources
    const cookies = buildFullList();
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.json({ total: cookies.length, cookies });
}
