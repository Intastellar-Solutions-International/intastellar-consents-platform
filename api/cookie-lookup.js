/**
 * GET /api/cookie-lookup?name=<cookie_name>
 *
 * Public cookie database endpoint — no authentication required.
 * Returns vendor, category, description and privacy metadata for a given
 * cookie name. Designed to be called from intastellar.eu's cookie database page.
 *
 * Also supports listing all known cookies:
 *   GET /api/cookie-lookup          → returns { cookies: [...] } (all known entries)
 *   GET /api/cookie-lookup?name=_ga → returns a single cookie object
 *
 * CORS: wildcard — safe to call from any website.
 */

import {
    describeCookie,
    categoryFromCookieName,
    vendorFromCookieName,
    VENDOR_META,
    COOKIE_META,
    DATA_COUNTRIES,
    DATA_REGIONS,
} from "./_scan-core.js";

function enrichCookiePattern(pattern) {
    const name = pattern.exact ?? (pattern.prefix ? pattern.prefix + "*" : null);
    if (!name) return null;

    const lookupName = pattern.exact ?? pattern.prefix;
    const vendor = vendorFromCookieName(lookupName);
    const category = categoryFromCookieName(lookupName);
    const vendorInfo = vendor ? VENDOR_META[vendor] : null;

    return {
        name,
        isPrefix:        !!pattern.prefix,
        vendor:          vendor ?? null,
        category:        category ?? null,
        description:     pattern.description ?? null,
        dataCountry:     vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
        dataRegion:      vendor ? (DATA_REGIONS[vendor] ?? null) : null,
        privacyUrl:      vendorInfo?.privacyUrl ?? null,
        legalBasis:      vendorInfo?.legalBasis ?? null,
        transferMechanism: vendorInfo?.transferMechanism ?? null,
    };
}

function lookupByName(rawName) {
    const vendor = vendorFromCookieName(rawName);
    const category = categoryFromCookieName(rawName);
    const description = describeCookie(rawName);
    const vendorInfo = vendor ? VENDOR_META[vendor] : null;

    return {
        name:            rawName,
        isPrefix:        false,
        vendor:          vendor ?? null,
        category:        category ?? null,
        description:     description ?? null,
        dataCountry:     vendor ? (DATA_COUNTRIES[vendor] ?? null) : null,
        dataRegion:      vendor ? (DATA_REGIONS[vendor] ?? null) : null,
        privacyUrl:      vendorInfo?.privacyUrl ?? null,
        legalBasis:      vendorInfo?.legalBasis ?? null,
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

    // Full list — build from COOKIE_META (deduplicated, enriched)
    const cookies = [];
    for (const pattern of COOKIE_META) {
        const entry = enrichCookiePattern(pattern);
        if (entry) cookies.push(entry);
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.json({ total: cookies.length, cookies });
}
