// Visitor locations: country → region → city, with page views, sessions,
// lead/sale conversions, revenue and products sold per place. Pure helpers
// for api/analytics-locations.js (SQL there, shaping here).
import { REGION_NAMES } from "./_region-names.js";

export const LEVELS = ["country", "region", "city"];
// A city with fewer consented sessions than this is shown as "Other cities":
// a small town plus a date range can point at a single visitor.
export const MIN_CITY_SESSIONS = 5;
export const OTHER_KEY = "__other";
const MAX_PRODUCTS = 20;

/** "83" in DK → "Syddanmark"; unknown codes come back as the code. */
export function regionName(country, code) {
    if (!code) return null;
    return REGION_NAMES[String(country || "").toUpperCase()]?.[code] || code;
}

/** x-vercel-ip-city is URL-encoded ("K%C3%B8benhavn") — decode, trim, cap. */
export function cleanCity(header) {
    if (!header) return null;
    let s = String(header);
    try { s = decodeURIComponent(s); } catch { /* keep the raw value */ }
    s = s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100);
    return s || null;
}

/** x-vercel-ip-latitude/-longitude → a 0.1° (~10 km) point, or nulls. */
export function coarsePoint(lat, lon) {
    const a = Number(lat), b = Number(lon);
    if (lat == null || lon == null || lat === "" || lon === "" || !Number.isFinite(a) || !Number.isFinite(b)
        || Math.abs(a) > 90 || Math.abs(b) > 180) return { lat: null, lon: null };
    return { lat: Math.round(a * 10) / 10, lon: Math.round(b * 10) / 10 };
}

/** Validated query → the filter the SQL needs, or an error. */
export function locationQuery(query) {
    const level = LEVELS.includes(query.level) ? query.level : "country";
    const country = /^[A-Za-z]{2}$/.test(String(query.country || "")) ? String(query.country).toUpperCase() : null;
    const region = query.region ? String(query.region).slice(0, 64) : null;
    if (level !== "country" && !country) return { error: "country is required for the region and city levels" };
    return { level, country, region: level === "city" ? region : null };
}

const num = (v) => Number(v) || 0;

function labelFor(level, key, country) {
    if (!key) return null;
    if (level === "region") return regionName(country, key);
    return key;
}

/**
 * Rows from the three queries (each keyed by `k`, the place at this level)
 * → one row per place, biggest first, plus products with their best places.
 * At city level, places under MIN_CITY_SESSIONS (and conversions or sales
 * there) are merged into one "Other cities" row.
 */
export function shapeLocations({ level, country, pv = [], conv = [], products = [] }) {
    const small = new Set(level === "city"
        ? pv.filter((r) => r.k && num(r.sessions) < MIN_CITY_SESSIONS).map((r) => r.k)
        : []);
    const known = new Set(pv.map((r) => r.k || ""));
    const keyOf = (k) => {
        if (level !== "city") return k || "";
        if (!k) return "";
        // A converting city with no consented page views in range is hidden too.
        return small.has(k) || !known.has(k) ? OTHER_KEY : k;
    };

    const rows = new Map();
    const row = (key) => {
        if (!rows.has(key)) {
            rows.set(key, {
                key,
                label: key === OTHER_KEY ? null : labelFor(level, key, country),
                pageviews: 0, sessions: 0, conversions: 0, revenue: 0,
            });
        }
        return rows.get(key);
    };
    for (const r of pv) {
        const key = keyOf(r.k);
        const x = row(key);
        x.pageviews += num(r.pageviews);
        x.sessions += num(r.sessions);
        // Map position of a named city (never of "Other cities")
        if (level === "city" && key && key !== OTHER_KEY && r.lat != null && r.lon != null) {
            x.lat = Math.round(Number(r.lat) * 10) / 10;
            x.lon = Math.round(Number(r.lon) * 10) / 10;
        }
    }
    let currency = null;
    for (const r of conv) {
        const x = row(keyOf(r.k));
        x.conversions += num(r.conversions);
        x.revenue += num(r.revenue_cents) / 100;
        currency = currency || r.currency || null;
    }

    const byProduct = new Map();
    for (const r of products) {
        const id = r.product_id || r.product_name;
        if (!id) continue;
        if (!byProduct.has(id)) byProduct.set(id, { id, name: r.product_name || r.product_id, units: 0, revenue: 0, places: new Map() });
        const p = byProduct.get(id);
        const key = keyOf(r.k);
        const units = num(r.units), revenue = num(r.revenue);
        p.units += units;
        p.revenue += revenue;
        const place = p.places.get(key) || { key, units: 0, revenue: 0 };
        place.units += units;
        place.revenue += revenue;
        p.places.set(key, place);
        const x = row(key);
        x.units = (x.units || 0) + units;
    }
    const placeLabel = (key) => (key === OTHER_KEY ? null : labelFor(level, key, country));
    const productList = [...byProduct.values()]
        .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
        .slice(0, MAX_PRODUCTS)
        .map(({ places, ...p }) => ({
            ...p,
            places: [...places.values()]
                .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
                .map((pl) => ({ ...pl, label: placeLabel(pl.key) })),
        }));

    // Best seller per place, for the "what sells where" column.
    for (const p of productList) {
        for (const pl of p.places) {
            const x = rows.get(pl.key);
            if (x && (!x.topProduct || pl.revenue > x.topProduct.revenue)) {
                x.topProduct = { id: p.id, name: p.name, units: pl.units, revenue: pl.revenue };
            }
        }
    }

    const list = [...rows.values()].sort((a, b) => {
        // Unknown and Other always last
        const rank = (x) => (x.key === OTHER_KEY ? 2 : x.key === "" ? 1 : 0);
        return rank(a) - rank(b) || b.sessions - a.sessions || b.pageviews - a.pageviews || b.revenue - a.revenue;
    });
    return {
        rows: list,
        products: productList,
        currency,
        hiddenCities: small.size,
    };
}
