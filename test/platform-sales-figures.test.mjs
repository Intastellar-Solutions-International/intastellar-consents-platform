// Sales figures on the admin Platform page and the public copy the website reads.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { MIN_RECORDS, MIN_SITES, SITE_KEY_SQL, TREND_KEYS, calculateFigures, latestScansSql, publicFigures, setVisibility, summarizeBannerCompliance, summarizeConsents, summarizeFirstVisits, summarizeInstalls, summarizeScans } from "../api/_platform-stats.js";
import { requirePlatformAdmin } from "../api/_member-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "platformStats.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({ Intl, Date, String, Number, Math });
vm.runInContext(SRC + "\nthis.out = { SALES_FIGURES, figureChange, missingFigureReason, salesSheetHtml, sameFigures };", ctx);
const { SALES_FIGURES, figureChange, missingFigureReason, salesSheetHtml, sameFigures } = ctx.out;

const NOW = Date.UTC(2026, 10, 10);
const ga = { service: "Google Analytics", host: "www.google-analytics.com", category: "analytics", dataCountry: "US" };
const ads = { service: "Meta Pixel", host: "connect.facebook.net", category: "advertising", dataCountry: "US" };
const banner = { service: "Intastellar", host: "cdn.example", category: "cmp", dataCountry: "US" };
const sites = (n, transfers, prefix = "site") => Array.from({ length: n }, (_, i) => ({ domain: `${prefix}${i}.dk`, transfers, cookies: [] }));

test("sales figures: percentages come from sites with results", () => {
    const out = summarizeScans([...sites(15, [ga, ads], "a"), ...sites(15, [banner], "b"), ...sites(20, [], "blocked")]);
    assert.strictEqual(out.sites_scanned, 30);
    assert.strictEqual(out.us_transfer_pct, 50);
    assert.strictEqual(out.advertising_pct, 50);
    assert.strictEqual(out.tracking_services_found, 2);
});

test("sales figures: a percentage needs the minimum number of sites", () => {
    assert.strictEqual(summarizeScans(sites(MIN_SITES - 1, [ga])).us_transfer_pct, null);
    assert.strictEqual(summarizeScans(sites(MIN_SITES, [ga])).us_transfer_pct, 100);
    const visits = summarizeFirstVisits(sites(4, [ga]));
    assert.deepStrictEqual({ ...visits }, { pre_consent_sites: 4, pre_consent_pct: null });
});

test("sales figures: the banner and CDNs don't count as trackers before consent", () => {
    const out = summarizeFirstVisits([...sites(10, [ga], "a"), ...sites(30, [banner, { host: "x", category: "cdn" }], "b")]);
    assert.strictEqual(out.pre_consent_pct, 25);
});

test("sales figures: own and test domains are left out", () => {
    const rows = ["localhost", "127.0.0.1", "www.intastellarsolutions.com", "demo.vercel.app", "shop.test", "shop.dk"].map((domain) => ({ domain, transfers: [ga], cookies: [] }));
    assert.strictEqual(summarizeScans(rows).sites_scanned, 1);
});

test("sales figures: www, case and trailing-dot variants of a site are counted once", () => {
    const sql = latestScansSql("TRUE");
    assert.match(sql, new RegExp(`DISTINCT ON \\(${SITE_KEY_SQL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
    // Same steps as the SQL key, so the figures agree with normalizeBannerDomain().
    const key = (d) => d.trim().toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
    assert.deepStrictEqual(["www.Example.com.", "example.com", "EXAMPLE.COM"].map(key), ["example.com", "example.com", "example.com"]);
    assert.match(SITE_KEY_SQL, /rtrim\(lower\(btrim\(domain\)\), '\.'\), '\^www\\\.'/);
});

test("sales figures: installs count each domain once and read getDomains dates", () => {
    const out = summarizeInstalls([
        { domain: "a.dk", lastedVisited: "09. 11 2026" },
        { domain: "a.dk", lastedVisited: "01. 01 2020" },
        { domain: "b.dk", lastedVisited: "01. 01 2026" },
        { domain: "c.dk", lastedVisited: "01. 01 1970" },
    ], NOW);
    assert.deepStrictEqual({ ...out }, { sites_installed: 3, sites_active: 1 });
});

test("sales figures: a failed site list is unknown rather than zero", () => {
    assert.deepStrictEqual({ ...summarizeInstalls([], NOW) }, { sites_installed: null, sites_active: null });
});

test("sales figures: consent totals come from getInteractions, and no data is unknown", () => {
    const out = summarizeConsents({ Total: 5400, activeUsers: 1200 });
    assert.strictEqual(out.visitors_30d, 1200);
    assert.strictEqual(out.consent_records_30d, 5400);
    assert.strictEqual(out.accept_all_pct, null);
    for (const body of [{ Total: 0, activeUsers: 0 }, "Err_Login_Expired", null]) {
        assert.ok(Object.values(summarizeConsents(body)).every((v) => v === null));
    }
});

const consentBody = (total, accept, decline, partial) => ({
    Total: total,
    interactions_number: { accept, decline, partial },
    device_type: { mobile: 600, tablet: 100, desktop: 300, other: 4000 },
    countryBreakdown: [{ country: "Denmark", num: { total: 3 } }, { country: "Sweden", num: { total: 2 } }, { country: "Unknown", num: { total: 9 } }, { country: "EU", num: { total: 1 } }, { country: "Norway", num: { total: 0 } }],
});

test("sales figures: consent shares use counts, and mobile leaves out unknown devices", () => {
    const out = summarizeConsents(consentBody(5000, 3000, 1500, 500));
    assert.deepStrictEqual([out.accept_all_pct, out.decline_all_pct, out.custom_choice_pct], [60, 30, 10]);
    assert.strictEqual(out.mobile_pct, 60);
});

test("sales figures: countries leave out unknown and the EU placeholder", () => {
    assert.strictEqual(summarizeConsents(consentBody(5000, 3000, 1500, 500)).countries_30d, 2);
});

test("sales figures: consent shares need the minimum number of records", () => {
    assert.strictEqual(summarizeConsents(consentBody(MIN_RECORDS - 1, 500, 400, 99)).accept_all_pct, null);
    assert.strictEqual(summarizeConsents(consentBody(MIN_RECORDS, 500, 400, 100)).accept_all_pct, 50);
    const figure = SALES_FIGURES.find((f) => f.key === "accept_all_pct");
    assert.strictEqual(missingFigureReason(figure, { consent_records_30d: 240 }, 30, 1000), "240 of 1000 records needed");
    assert.strictEqual(missingFigureReason(figure, { consent_records_30d: null }, 30, 1000), "Not available");
});

test("sales sheet: includes consent figures", () => {
    const html = salesSheetHtml({ accept_all_pct: 60, countries_30d: 12 }, "2026-11-10");
    assert.ok(html.includes("60%"));
    assert.ok(html.includes("of consent records accepted all cookies"));
    assert.ok(html.includes("countries with recorded consent choices"));
});

AbortSignal.timeout ??= () => undefined;
const fakeDb = (earlier) => ({
    query: async (sql) => {
        if (/information_schema/.test(sql)) return { rows: [{}, {}] };
        return { rows: /platform_stats_snapshots/.test(sql) ? earlier : [] };
    },
});
const replyWith = (domains, consents, calls = []) => async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { ok: true, json: async () => (url.endsWith("getDomains") ? domains : consents) };
};

test("sales figures: a signed-in admin's token is sent to both PHP endpoints as organisation 1", async () => {
    const calls = [];
    const out = await calculateFigures(fakeDb([]), { authorization: "Bearer admin", now: NOW, fetchImpl: replyWith([{ domain: "a.dk" }], { Total: 5, activeUsers: 2 }, calls) });
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((c) => c.headers.Authorization === "Bearer admin" && c.headers.Organisation === "1"));
    const consentCall = calls.find((c) => c.url.endsWith("getInteractions"));
    assert.strictEqual(consentCall.headers["X-Compare-Start"], "2026-10-10");
    assert.strictEqual(consentCall.headers["X-Compare-End"], "2026-10-10");
    assert.strictEqual(out.sites_installed, 1);
    assert.strictEqual(out.visitors_30d, 2);
    assert.strictEqual(out.source_errors.length, 0);
});

test("sales figures: a refused login is reported and the last known figures are kept", async () => {
    const earlier = [{ figures: { sites_installed: 400, sites_active: 300, visitors_30d: 9000, accept_all_pct: 61 } }];
    const out = await calculateFigures(fakeDb(earlier), { now: NOW, fetchImpl: replyWith("Err_Login_Expired", "Err_Login_Expired") });
    assert.strictEqual(out.sites_installed, 400);
    assert.strictEqual(out.visitors_30d, 9000);
    assert.strictEqual(out.accept_all_pct, 61);
    assert.deepStrictEqual([...out.source_errors], ['getDomains returned "Err_Login_Expired"', 'getInteractions returned "Err_Login_Expired"']);
});

test("sales figures: a failed source with no history stays unknown, and errors never go public", async () => {
    const out = await calculateFigures(fakeDb([]), { now: NOW, fetchImpl: replyWith([], "Err_Login_Expired") });
    assert.strictEqual(out.sites_installed, null);
    assert.strictEqual(out.visitors_30d, null);
    assert.strictEqual(publicFigures(out).source_errors, undefined);
});

test("sales figures: most common trackers are named services, by share of sites", () => {
    const unnamed = { host: "t.shop.dk", category: "analytics" };
    const out = summarizeScans([...sites(20, [ga, ads, unnamed], "a"), ...sites(10, [ga, ga], "b")]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(out.top_trackers)), [{ name: "Google Analytics", pct: 100 }, { name: "Meta Pixel", pct: 67 }]);
    assert.strictEqual(summarizeScans(sites(MIN_SITES - 1, [ga])).top_trackers, null);
});

test("sales figures: EU and non-EU acceptance need enough records of their own", () => {
    const out = summarizeConsents({ Total: 5000, euUsers: 3000, noneEUUsers: 400, euAcceptedRate: 41.6, noneEUAcceptedRate: 70 });
    assert.strictEqual(out.eu_accept_pct, 42);
    assert.strictEqual(out.non_eu_accept_pct, null);
    assert.strictEqual(out.non_eu_records_30d, 400);
    assert.strictEqual(summarizeConsents({ Total: 5000, euUsers: 3000, euAcceptedRate: null }).eu_accept_pct, null);
});

const intastellar = { service: "Intastellar", host: "www.intastellarsolutions.com", category: "cmp" };

test("sales figures: compliance is compared between sites where the banner loaded and the rest", () => {
    const out = summarizeBannerCompliance([
        ...sites(27, [intastellar], "clean"),
        ...sites(3, [intastellar, ga], "leaky"),
        ...sites(10, [ga], "other-leaky"),
        ...sites(20, [{ host: "cdn.x", category: "cdn" }], "other-clean"),
        ...sites(5, [], "blocked"),
    ]);
    assert.deepStrictEqual({ ...out }, { banner_sites_tested: 30, banner_compliant_pct: 90, other_sites_tested: 30, other_compliant_pct: 67 });
});

test("sales figures: a lookalike host doesn't count as the Intastellar banner", () => {
    const out = summarizeBannerCompliance(sites(30, [{ host: "notintastellar.com", category: "cmp" }]));
    assert.strictEqual(out.banner_sites_tested, 0);
    assert.strictEqual(out.other_sites_tested, 30);
});

test("sales figures: a compliance share needs enough sites in its own group, and its sample only goes public with it", () => {
    const out = summarizeBannerCompliance([...sites(30, [intastellar], "a"), ...sites(4, [ga], "b")]);
    assert.strictEqual(out.banner_compliant_pct, 100);
    assert.strictEqual(out.other_compliant_pct, null);
    assert.deepStrictEqual({ ...publicFigures(out) }, { banner_compliant_pct: 100, banner_sites_tested: 30 });
});

test("sales figures: sample sizes can't be switched on their own", async () => {
    const db = { query: async () => ({ rows: [] }) };
    for (const key of ["pre_consent_sites", "banner_sites_tested", "other_sites_tested"]) assert.strictEqual(await setVisibility(db, key, true), false);
    assert.strictEqual(await setVisibility(db, "banner_compliant_pct", true), true);
});

test("sales figures: switched-off figures stay off the website", () => {
    const out = publicFigures({ accept_all_pct: 60, decline_all_pct: 30, pre_consent_pct: 40, pre_consent_sites: 50 }, ["decline_all_pct", "pre_consent_pct"]);
    assert.deepStrictEqual({ ...out }, { accept_all_pct: 60 });
});

test("sales figures: only publishable figures can be switched", async () => {
    const db = { query: async () => ({ rows: [] }) };
    assert.strictEqual(await setVisibility(db, "mrr", true), false);
    assert.strictEqual(await setVisibility(db, "source_errors", true), false);
    assert.strictEqual(await setVisibility(db, "accept_all_pct", "yes"), false);
    assert.strictEqual(await setVisibility(db, "decline_all_pct", true), true);
});

test("sales figures: every trend on the page has history", () => {
    for (const f of SALES_FIGURES.filter((f) => f.trend)) assert.ok(TREND_KEYS.includes(f.key), f.key);
});

test("sales figures: the live copy matches regardless of key order", () => {
    assert.ok(sameFigures({ a: 1, top_trackers: [{ pct: 5, name: "x" }] }, { top_trackers: [{ name: "x", pct: 5 }], a: 1 }));
    assert.ok(!sameFigures({ a: 1 }, { a: 2 }));
    assert.ok(!sameFigures({ a: 1 }, { a: 1, b: 2 }));
});

test("sales sheet: lists the most common trackers", () => {
    const html = salesSheetHtml({ top_trackers: [{ name: "Google <Analytics>", pct: 64 }] }, "2026-11-10");
    assert.ok(html.includes("Google &#60;Analytics&#62;"));
    assert.ok(html.includes("64%"));
});

test("sales figures: only known figures with a value can be published", () => {
    const out = publicFigures({ sites_installed: 415, pre_consent_pct: null, mrr: 1000, customer_domains: ["a.dk"] });
    assert.deepStrictEqual({ ...out }, { sites_installed: 415 });
    assert.deepStrictEqual({ ...publicFigures({ pre_consent_sites: 4, pre_consent_pct: null }) }, {});
});

test("sales figures: every figure on the page can be published", () => {
    const all = Object.fromEntries(SALES_FIGURES.map((f) => [f.key, 1]));
    assert.strictEqual(Object.keys(publicFigures(all)).length, SALES_FIGURES.length);
});

test("sales figures: change is only shown with something to compare", () => {
    assert.strictEqual(figureChange(110, 100), 10);
    assert.strictEqual(figureChange(110, null), null);
    assert.strictEqual(figureChange(110, 0), null);
});

test("sales figures: a missing percentage says how many sites it needs", () => {
    const figure = SALES_FIGURES.find((f) => f.key === "pre_consent_pct");
    assert.strictEqual(missingFigureReason(figure, { pre_consent_sites: 4 }, 30), "4 of 30 sites needed");
});

test("sales sheet: shows published figures and skips the rest", () => {
    const html = salesSheetHtml({ us_transfer_pct: 62, sites_scanned: 1415 }, "2026-11-10");
    assert.ok(html.includes("62%"));
    assert.ok(html.includes("1,415"));
    assert.ok(html.includes("November 10, 2026"));
    assert.ok(!html.includes("before the visitor has agreed"));
});

const token = (claims) => Buffer.from(`${Buffer.from("{}").toString("base64")}.${Buffer.from(JSON.stringify(claims)).toString("base64")}.x`).toString("base64");
const asOrg = (org, email) => ({ headers: { authorization: `Bearer ${token({ email, exp: 9999999999 })}`, organisation: org } });
const memberOf = (id, email) => async () => ({ ok: true, json: async () => [{ id, users: [{ email }] }] });

test("platform admin: claiming organisation 1 without being a member is refused", async () => {
    const out = await requirePlatformAdmin(asOrg("1", "outsider@x.dk"), { fetchImpl: memberOf(7, "outsider@x.dk"), secret: "" });
    assert.strictEqual(out.status, 403);
});

test("platform admin: a member of another organisation is refused", async () => {
    const out = await requirePlatformAdmin(asOrg("7", "customer@x.dk"), { fetchImpl: memberOf(7, "customer@x.dk"), secret: "" });
    assert.strictEqual(out.status, 403);
});

test("platform admin: a request with no sign-in is refused", async () => {
    const out = await requirePlatformAdmin({ headers: { organisation: "1", authorization: "anything" } }, { fetchImpl: memberOf(1, "x@x.dk"), secret: "" });
    assert.strictEqual(out.status, 401);
});

test("platform admin: a member of organisation 1 gets in", async () => {
    const out = await requirePlatformAdmin(asOrg("1", "admin@x.dk"), { fetchImpl: memberOf(1, "admin@x.dk"), secret: "" });
    assert.strictEqual(out.organisationId, 1);
});
