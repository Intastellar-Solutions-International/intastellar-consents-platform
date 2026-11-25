import { REGION_SHAPES } from "./_region-shapes.js";
import { regionName } from "./_locations.js";

/**
 * GET /api/geo-regions?country=DK — the region (admin-1) outlines of one
 * country for the Locations map, keyed by the same codes the tracker stores
 * (analytics_events.region). Public map data, no visitor data, so no sign-in;
 * cached hard because it only changes with a new deploy.
 *
 *   → { country, regions: [{ code, name, coordinates }] }   (MultiPolygon lon/lat)
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

export function countryRegions(country) {
    const cc = /^[A-Za-z]{2}$/.test(String(country || "")) ? String(country).toUpperCase() : null;
    const shapes = cc && REGION_SHAPES[cc];
    if (!shapes) return null;
    return {
        country: cc,
        regions: Object.entries(shapes).map(([code, coordinates]) => ({ code, name: regionName(cc, code), coordinates })),
    };
}

export default function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const out = countryRegions(req.query?.country);
    if (!out) return res.status(404).json({ error: "No region outlines for this country" });
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=2592000");
    return res.status(200).json(out);
}
