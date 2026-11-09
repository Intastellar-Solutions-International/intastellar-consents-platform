// The admin Platform page: dates from getDomains, site status and platform shares.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "platformStats.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);
const { parseSiteDate, siteStatus, toSites, platformShares, installsByMonth } = ctx;
const NOW = Date.UTC(2026, 10, 9);
const daysAgo = (n) => new Date(NOW - n * 86400000);

test("platform: dates are read as day, month, year", () => {
    assert.strictEqual(parseSiteDate("09. 11 2026").getTime(), NOW);
});

test("platform: a missing database date is unknown, not 1970", () => {
    assert.strictEqual(parseSiteDate("01. 01 1970"), null);
    assert.strictEqual(parseSiteDate(null), null);
});

test("platform: status follows the last activity", () => {
    assert.deepStrictEqual([3, 7, 8, 30, 31].map((n) => siteStatus(daysAgo(n), NOW)), ["active", "active", "quiet", "quiet", "inactive"]);
    assert.strictEqual(siteStatus(null, NOW), "unknown");
});

test("platform: a domain listed twice is one site, the newest row", () => {
    const sites = toSites([{ domain: "a.com", companyName: "New", installed: "01. 11 2026" }, { domain: "a.com", companyName: "Old" }, { domain: "" }], NOW);
    assert.strictEqual(sites.length, 1);
    assert.strictEqual(sites[0].company, "New");
});

test("platform: sites without a stored platform are shown as unknown", () => {
    const s = platformShares({ JS: 0, WP: 20.69 });
    assert.strictEqual(s.unknown, 79.31);
    assert.strictEqual(platformShares({ JS: 60, WP: 45 }).unknown, 0);
});

test("platform: installs are grouped by month and end with this month", () => {
    const sites = toSites([{ domain: "a.com", installed: "02. 11 2026" }, { domain: "b.com", installed: "30. 10 2026" }, { domain: "c.com", installed: "01. 01 2020" }], NOW);
    const months = Array.from(installsByMonth(sites, NOW));
    assert.strictEqual(months.length, 12);
    assert.strictEqual(months[11].key, "2026-11");
    assert.deepStrictEqual([months[10].count, months[11].count], [1, 1]);
    assert.strictEqual(months.reduce((n, m) => n + m.count, 0), 2);
});
