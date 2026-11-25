// Visitor locations (api/_locations.js, api/analytics-locations.js) and the
// city capture in the tracker (api/a.js).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "./_harness.mjs";
import { regionName, cleanCity, locationQuery, shapeLocations, OTHER_KEY, MIN_CITY_SESSIONS } from "../api/_locations.js";
import { locationsReport } from "../api/analytics-locations.js";

test("locations: region codes become names; unknown codes stay codes", () => {
    assert.equal(regionName("DK", "83"), "Syddanmark");
    assert.equal(regionName("de", "SH"), "Schleswig-Holstein");
    assert.equal(regionName("GB", "ENG"), "England");
    assert.equal(regionName("ES", "MD"), "Madrid");
    assert.equal(regionName("XX", "Q1"), "Q1");
    assert.equal(regionName("DK", null), null);
});

test("locations: the city header is URL-decoded, trimmed and capped", () => {
    assert.equal(cleanCity("K%C3%B8benhavn"), "København");
    assert.equal(cleanCity("San%20Jos%C3%A9"), "San José");
    assert.equal(cleanCity("%E0%A4%A"), "%E0%A4%A", "malformed encoding is kept as sent");
    assert.equal(cleanCity("  "), null);
    assert.equal(cleanCity(undefined), null);
    assert.equal(cleanCity("x".repeat(300)).length, 100);
});

test("locations: region and city levels need a country", () => {
    assert.deepEqual(locationQuery({}), { level: "country", country: null, region: null });
    assert.ok(locationQuery({ level: "region" }).error);
    assert.deepEqual(locationQuery({ level: "region", country: "dk", region: "84" }), { level: "region", country: "DK", region: null });
    assert.deepEqual(locationQuery({ level: "city", country: "DK", region: "84" }), { level: "city", country: "DK", region: "84" });
    assert.equal(locationQuery({ level: "nope", country: "DKK" }).country, null);
});

test("locations: regions get names, conversions and products land on their place", () => {
    const r = shapeLocations({
        level: "region", country: "DK",
        pv: [{ k: "84", pageviews: "300", sessions: "40" }, { k: "83", pageviews: "500", sessions: "60" }, { k: null, pageviews: "10", sessions: "0" }],
        conv: [{ k: "84", conversions: "3", revenue_cents: "29700", currency: "DKK" }],
        products: [
            { k: "84", product_id: "A", product_name: "Mug", units: "2", revenue: "60" },
            { k: "84", product_id: "B", product_name: "Shirt", units: "1", revenue: "199" },
            { k: "83", product_id: "A", product_name: "Mug", units: "5", revenue: "150" },
        ],
    });
    assert.deepEqual(r.rows.map((x) => [x.key, x.label]), [["83", "Syddanmark"], ["84", "Hovedstaden"], ["", null]], "biggest first, unknown last");
    const hovedstaden = r.rows[1];
    assert.equal(hovedstaden.conversions, 3);
    assert.equal(hovedstaden.revenue, 297);
    assert.equal(hovedstaden.topProduct.name, "Shirt", "best seller by revenue");
    assert.equal(r.currency, "DKK");
    assert.deepEqual(r.products.map((p) => [p.name, p.revenue]), [["Mug", 210], ["Shirt", 199]]);
    assert.deepEqual(r.products[0].places.map((p) => p.label), ["Syddanmark", "Hovedstaden"]);
});

test(`locations: cities under ${MIN_CITY_SESSIONS} sessions are merged into Other, with their sales`, () => {
    const r = shapeLocations({
        level: "city", country: "DK",
        pv: [{ k: "Aarhus", pageviews: "90", sessions: "20" }, { k: "Tinyby", pageviews: "6", sessions: "2" }, { k: "Hamlet", pageviews: "3", sessions: "1" }],
        conv: [{ k: "Tinyby", conversions: "1", revenue_cents: "5000" }, { k: "Nowhere", conversions: "1", revenue_cents: "1000" }],
        products: [{ k: "Hamlet", product_id: "A", product_name: "Mug", units: "1", revenue: "30" }],
    });
    assert.deepEqual(r.rows.map((x) => x.key), ["Aarhus", OTHER_KEY]);
    const other = r.rows[1];
    assert.equal(other.sessions, 3);
    assert.equal(other.conversions, 2, "a converting city without page views in range is hidden too");
    assert.equal(other.revenue, 60);
    assert.equal(r.hiddenCities, 2);
    assert.deepEqual(r.products[0].places.map((p) => p.key), [OTHER_KEY], "no small town named via the products list");
    assert.ok(!JSON.stringify(r).includes("Tinyby") && !JSON.stringify(r).includes("Hamlet"));
});

test("locations: the endpoint filters by place, and the city level counts consented rows only", async () => {
    const calls = [];
    const db = {
        query: async (sql, params) => {
            calls.push({ sql, params });
            if (/FROM analytics_sites/.test(sql)) return { rows: [{ id: "site1" }] };
            return { rows: [] };
        },
    };
    const member = { organisationId: 7 };
    const bad = await locationsReport(db, member, { domain: "a.dk", from: "2026-11-01", to: "2026-11-30", level: "city" });
    assert.equal(bad.status, 400);

    calls.length = 0;
    const ok = await locationsReport(db, member, { domain: "a.dk", from: "2026-11-01", to: "2026-11-30", level: "city", country: "DK", region: "84" });
    assert.equal(ok.status, 200);
    const [, pv, conv, products] = calls;
    assert.deepEqual(pv.params, ["site1", "2026-11-01", "2026-12-01", "DK", "84"]);
    assert.match(pv.sql, /SELECT city AS k/);
    assert.match(pv.sql, /consent_level = 'full'/);
    assert.match(conv.sql, /ace\.consent_level = 'full'/);
    assert.match(conv.sql, /COALESCE\(ace\.region, s\.region\) = \$5/);
    assert.match(products.sql, /jsonb_array_elements/);
    assert.equal(ok.body.minCitySessions, MIN_CITY_SESSIONS);
});

test("locations: the tracker stores city only for consented visitors", () => {
    const src = readFileSync(new URL("../api/a.js", import.meta.url), "utf8");
    assert.match(src, /const city\s+= cleanCity\(req\.headers\["x-vercel-ip-city"\]\)/);
    assert.match(src, /region, isMinimal \? null : city,/, "events: city only with consent");
    const minimalInsert = src.slice(src.indexOf("if (isMinimal) {\n        const minSessionId"), src.indexOf("} else {\n        // Full: enriched event"));
    assert.ok(minimalInsert.length > 0 && !/\bcity\b/.test(minimalInsert), "minimal page views never get a city");
});

test("pins: only known fields are kept; region/city pins need a country", async () => {
    const { cleanPin } = await import("../api/analytics-pins.js");
    assert.deepEqual(cleanPin({ kind: "locations", title: " Mugs by region ", config: { level: "region", country: "dk", region: "84", metric: "units", product: "A", extra: 1 } }), {
        kind: "locations", title: "Mugs by region",
        config: { level: "region", country: "DK", region: null, metric: "units", product: "A" },
    });
    assert.equal(cleanPin({ kind: "locations", title: "x", config: { level: "country", country: "DK", metric: "nope" } }).config.metric, "sessions");
    assert.equal(cleanPin({ kind: "locations", title: "x", config: { level: "country", country: "DK" } }).config.country, null);
    assert.ok(cleanPin({ kind: "locations", title: "x", config: { level: "city" } }).error);
    assert.ok(cleanPin({ kind: "sql", title: "x", config: {} }).error);
    assert.ok(cleanPin({ kind: "locations", title: "  ", config: {} }).error);
});

test("pins: scoped to the member's organisation and capped per site", async () => {
    const { handlePins, MAX_PINS } = await import("../api/analytics-pins.js");
    let count = MAX_PINS;
    const calls = [];
    const db = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM analytics_sites/.test(sql)) return { rows: params[0] === 7 ? [{ id: "site1" }] : [] };
        if (/COUNT\(\*\)/.test(sql)) return { rows: [{ n: count }] };
        if (/^\s*DELETE/.test(sql)) return { rowCount: 0 };
        return { rows: [] };
    } };
    const body = { kind: "locations", title: "By country", config: {} };
    assert.equal((await handlePins(db, { organisationId: 8 }, "GET", { domain: "a.dk" })).status, 404, "another org's site");
    assert.equal((await handlePins(db, { organisationId: 7 }, "POST", { domain: "a.dk" }, body)).status, 409);
    const del = await handlePins(db, { organisationId: 7 }, "DELETE", { domain: "a.dk", id: "5" });
    assert.equal(del.status, 404);
    assert.deepEqual(calls.at(-1).params, [5, "site1", 7], "delete only within the site and organisation");
});

test("locations: consented events carry their page view; recordings store region and city", () => {
    const tracker = readFileSync(new URL("../api/a.js", import.meta.url), "utf8");
    assert.match(tracker, /pv:full\?pvid:undefined,/, "the page-view id is only sent with consent");
    assert.match(tracker, /!isMinimal && pageviewId \? String\(pageviewId\)\.slice\(0, 40\) : null,/);
    const rec = readFileSync(new URL("../api/analytics-recording-ingest.js", import.meta.url), "utf8");
    assert.match(rec, /os_family, country_code,[\s\S]*?last_event_ts, region, city\)/);
    assert.match(rec, /const city\s+= cleanCity\(req\.headers\["x-vercel-ip-city"\]\)/);
});

test("locations: a conversion's place prefers its own page view over the session's latest", async () => {
    const calls = [];
    const db = { query: async (sql) => { calls.push(sql); return /FROM analytics_sites/.test(sql) ? { rows: [{ id: "s" }] } : { rows: [] }; } };
    await locationsReport(db, { organisationId: 1 }, { domain: "a.dk", from: "2026-11-01", to: "2026-11-30", level: "region", country: "DK" });
    assert.match(calls[2], /ORDER BY \(ace\.pageview_id IS NOT NULL AND e\.pageview_id = ace\.pageview_id\) DESC, e\.received_at DESC/);
});

test("live drawer: city comes only from full-consent page views", () => {
    const src = readFileSync(new URL("../api/analytics-live.js", import.meta.url), "utf8");
    const detail = src.slice(src.indexOf("async function sessionDetail"), src.indexOf("const pvs = pvRes.rows;"));
    assert.match(detail, /country_code, region, city,/);
    assert.match(detail, /AND consent_level = 'full'/);
    assert.match(src, /city: last\.city \|\| null,/);
});

test("map: city positions are rounded to 0.1° and only stored for consented page views", async () => {
    const { coarsePoint } = await import("../api/_locations.js");
    assert.deepEqual(coarsePoint("55.6761", "12.5683"), { lat: 55.7, lon: 12.6 });
    assert.deepEqual(coarsePoint("", "12"), { lat: null, lon: null });
    assert.deepEqual(coarsePoint("91", "0"), { lat: null, lon: null });
    assert.deepEqual(coarsePoint(undefined, undefined), { lat: null, lon: null });
    const src = readFileSync(new URL("../api/a.js", import.meta.url), "utf8");
    assert.match(src, /point\.lat, point\.lon,\s+\/\/ \$45 \$46/);
    const minimalInsert = src.slice(src.indexOf("if (isMinimal) {\n        const minSessionId"), src.indexOf("} else {\n        // Full: enriched event"));
    assert.ok(!/point\./.test(minimalInsert), "no position on cookieless page views");
});

test("map: named cities carry a position, Other cities never does", () => {
    const r = shapeLocations({
        level: "city", country: "DK",
        pv: [{ k: "Copenhagen", pageviews: "50", sessions: "9", lat: "55.68", lon: "12.57" }, { k: "Tiny", pageviews: "2", sessions: "1", lat: "56.1", lon: "9.5" }],
    });
    assert.deepEqual([r.rows[0].lat, r.rows[0].lon], [55.7, 12.6]);
    assert.equal(r.rows[1].key, OTHER_KEY);
    assert.equal(r.rows[1].lat, undefined);
});

test("map: region outlines use the tracker's region codes", async () => {
    const { countryRegions } = await import("../api/geo-regions.js");
    const dk = countryRegions("dk");
    assert.deepEqual(dk.regions.map((r) => r.code).sort(), ["81", "82", "83", "84", "85"]);
    assert.equal(dk.regions.find((r) => r.code === "84").name, "Hovedstaden");
    const gb = countryRegions("GB").regions.map((r) => r.code).sort();
    assert.deepEqual(gb, ["ENG", "NIR", "SCT", "WLS"], "UK by nation, as Vercel sends it");
    for (const [cc, code] of [["ES", "MD"], ["FR", "IDF"], ["IE", "L"], ["PL", "14"], ["ZA", "GP"], ["DE", "HB"]]) {
        assert.ok(countryRegions(cc).regions.some((r) => r.code === code), `${cc}-${code}`);
    }
    assert.equal(countryRegions("XX"), null);
    assert.equal(countryRegions("<script>"), null);
});

test("revenue dashboards: the server and dashboard lists agree", async () => {
    const { REVENUE_DASHBOARDS } = await import("../api/_conversions.js");
    const shared = readFileSync(new URL("../src/Pages/Analytics/_shared.js", import.meta.url), "utf8");
    const list = JSON.parse(shared.match(/export const REVENUE_DASHBOARDS = (\[[^\]]*\]);/)[1]);
    assert.deepEqual(list, REVENUE_DASHBOARDS);
    assert.deepEqual(REVENUE_DASHBOARDS, ["ecommerce", "aviation", "tourism", "hospitality"]);
    const report = readFileSync(new URL("../api/_scheduled-report.js", import.meta.url), "utf8");
    assert.match(report, /revenueCents > 0 && siteDomainRows\.some\(r => REVENUE_DASHBOARDS\.includes\(r\.business_type\)\)/);
});
