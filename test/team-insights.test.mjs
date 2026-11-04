// Team insights: the section a platform URL is recorded under. Evaluated
// from source text (src/ files aren't Node-importable).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "..", "src/Functions/teamSections.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(src, ctx);

test("team sections drop domain handles, platform ids and record ids", () => {
    const cases = {
        "/analytics/acme-com/heatmap": "analytics/heatmap",
        "/analytics/heatmap": "analytics/heatmap",
        "/analytics/acme-com/recordings/abc123": "analytics/recordings",
        "/analytics/acme-com": "analytics/overview",
        "/analytics": "analytics/overview",
        "/gdpr/dashboard": "dashboard",
        "/gdpr/reports/view/acme-com/audit-report": "reports/audit-report",
        "/gdpr/reports/view/acme-com": "reports",
        "/gdpr/reports/dsr/42": "reports/dsr",
        "/settings/ropa/17": "settings/ropa",
        "/settings": "settings",
        "/experiments/9": "experiments",
        "/gdpr/compare": "compare",
    };
    for (const [url, section] of Object.entries(cases)) assert.strictEqual(ctx.sectionForPath(url), section, url);
});

test("login, signup and API pages aren't recorded", () => {
    for (const url of ["/", "/login", "/auth-login", "/signup", "/check", "/api"]) {
        assert.strictEqual(ctx.sectionForPath(url), null, url);
    }
});

test("every section key fits the server's format", () => {
    const SECTION_RE = /^[a-z0-9][a-z0-9/-]{0,63}$/;
    for (const url of ["/analytics/x/search-console/coverage", "/gdpr/reports/user-consents/abc", "/settings/team-insights"]) {
        assert.match(ctx.sectionForPath(url), SECTION_RE, url);
    }
});

test("section labels are readable", () => {
    assert.strictEqual(ctx.sectionLabel("analytics/heatmap"), "Heatmap");
    assert.strictEqual(ctx.sectionLabel("analytics/user-flow"), "User flow");
    assert.strictEqual(ctx.sectionLabel("settings/view-users"), "Settings · View users");
    assert.strictEqual(ctx.sectionLabel("reports/dsr"), "Data subject requests");
});
