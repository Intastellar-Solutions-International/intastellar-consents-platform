// Customer domains for the request form, and the shared look of our emails.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "./_harness.mjs";
import { isPlatformHost, customHostTarget } from "../api/_known-hosts.js";
import { normalizeCustomDomain, dnsInstructions, domainState, attachDomain, checkCustomDomains } from "../api/_dsr-domains.js";
import { emailLayout, emailFacts, INTASTELLAR_LOGO_ATTACHMENT } from "../api/_email-layout.js";

process.env.VERCEL_API_TOKEN = "t";
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

test("hosts: the dashboard's domains stay the dashboard, others go to the form", () => {
    for (const host of ["www.intastellarconsents.com", "WWW.INTASTELLARCONSENTS.COM:443", "analytics.consentsmanagement.com", "x-y.vercel.app", "localhost:8080"]) {
        assert.ok(isPlatformHost(host), host);
        assert.strictEqual(customHostTarget(host), null, host);
    }
    assert.strictEqual(customHostTarget("privacy.acme.dk", "?lang=da"), "/api/dsr-public?host=1&lang=da");
});

test("hosts: every domain on the Vercel project is listed", () => {
    for (const host of ["analytics.consentsmanagement.com", "consents.inta.dev", "dev.intastellarconsents.com", "www.intastellarconsents.com", "intastellarconsents.com", "consents.check.intastellarsolutions.com", "analytics.tst.intastellarsolutions.com", "analytics.prd.intastellarsolutions.com", "analytics.dev.intastellarsolutions.com"]) assert.ok(isPlatformHost(host), host);
});

test("hosts: middleware skips the API, the form's own paths and files", () => {
    const source = fs.readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
    const matcher = new RegExp(`^${/matcher: \["(.*)"\]/.exec(source)[1].replace(/\\\\/g, "\\")}$`);
    for (const path of ["/", "/login", "/gdpr/reports"]) assert.ok(matcher.test(path), path);
    for (const path of ["/api/a", "/privacy-request/abc", "/bundle.js"]) assert.ok(!matcher.test(path), path);
});

test("domains: subdomains only", () => {
    assert.strictEqual(normalizeCustomDomain(" https://Privacy.Acme.dk/form "), "privacy.acme.dk");
    assert.strictEqual(normalizeCustomDomain("privacy.acme.co.uk"), "privacy.acme.co.uk");
    for (const bad of ["acme.dk", "acme.co.uk", "", "not a domain", "-x.acme.dk", "privacy.acme.123"]) assert.ok(normalizeCustomDomain(bad).error, bad);
});

test("domains: our own domains can't be claimed", () => {
    for (const bad of ["www.intastellarconsents.com", "forms.intastellar.com", "x.consentsmanagement.com", "x.vercel.app"]) assert.ok(normalizeCustomDomain(bad, 7).error, bad);
    assert.strictEqual(normalizeCustomDomain("privacy.intastellar.eu", 1), "privacy.intastellar.eu");
    for (const stillBlocked of ["www.intastellarconsents.com", "dev.intastellarconsents.com", "x.vercel.app"]) assert.ok(normalizeCustomDomain(stillBlocked, 1).error, stillBlocked);
});

test("domains: a root domain Vercel recognises is taken straight back off", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => { calls.push(options.method); return reply({ apexName: "weird.tld", name: "weird.tld" }); };
    assert.ok((await attachDomain("weird.tld", { fetchImpl })).error);
    assert.deepStrictEqual(calls, ["POST", "DELETE"]);
});

test("domains: every Vercel call names this project and team", async () => {
    const urls = [];
    await attachDomain("p.a.dk", { fetchImpl: async (url) => { urls.push(url); return reply({}); } });
    assert.match(urls[0], /\/projects\/prj_CfB9TsDNKEE72Wi6vSQLUhl57zPO\/domains\?teamId=team_aWxsCZ5awaiAbwZxTjzhaHk1$/);
});

test("domains: live only when both of Vercel's checks pass", async () => {
    const answer = (project, config) => async (url) => reply(url.includes("/config") ? config : project);
    assert.strictEqual((await domainState("p.a.dk", { fetchImpl: answer({ verified: true }, { misconfigured: false }) })).status, "active");
    assert.strictEqual((await domainState("p.a.dk", { fetchImpl: answer({ verified: true }, { misconfigured: true }) })).status, "pending");
    assert.strictEqual((await domainState("p.a.dk", { fetchImpl: answer({ verified: false }, { misconfigured: false }) })).status, "pending");
});

test("domains: DNS instructions use the subdomain and any proof-of-ownership record", () => {
    const dns = dnsInstructions("privacy.acme.dk", { recommendedCNAME: [{ value: "abc.vercel-dns-017.com." }] }, { apexName: "acme.dk", verification: [{ type: "TXT", domain: "_vercel.acme.dk", value: "vc=1" }] });
    assert.deepStrictEqual(dns, [{ type: "CNAME", name: "privacy", value: "abc.vercel-dns-017.com" }, { type: "TXT", name: "_vercel.acme.dk", value: "vc=1" }]);
    assert.strictEqual(dnsInstructions("privacy.acme.dk", {}, {})[0].value, "cname.vercel-dns.com");
});

test("domains: one failing for two weeks is detached; a recent failure isn't", async () => {
    const run = async (failedDaysAgo) => {
        const queries = [], methods = [];
        const db = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: /SELECT token/.test(sql) ? [{ token: "t1", custom_domain: "p.a.dk", custom_domain_failed_since: new Date(Date.now() - failedDaysAgo * 86400000).toISOString() }] : [] }; } };
        const fetchImpl = async (url, options) => { methods.push(options.method); return reply(url.includes("/config") ? { misconfigured: true } : { verified: true }); };
        return { result: await checkCustomDomains(db, { fetchImpl }), methods, queries };
    };
    const old = await run(15);
    assert.strictEqual(old.result.removed, 1);
    assert.ok(old.methods.includes("DELETE"));
    const recent = await run(2);
    assert.strictEqual(recent.result.removed, 0);
    assert.ok(!recent.methods.includes("DELETE"));
});

test("domains: the plan is checked on the server", () => {
    const source = fs.readFileSync(new URL("../api/dsr.js", import.meta.url), "utf8");
    assert.match(source, /async function domainAction[\s\S]{0,160}organisationHasPlan\(db, organisationId, "agency-pro"\)/);
});

test("emails: the shared layout escapes the heading and carries the logo", () => {
    const html = emailLayout({ heading: "<b>x</b>", body: "<p>ok</p>", cta: { label: "Go", href: "https://x/?a=1&b=2" }, badge: { text: "Alert", tone: "critical" } });
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(html, /a=1&amp;b=2/);
    assert.match(html, /cid:intastellar-logo/);
    assert.match(emailFacts([["A", "B"]]), /A<\/td>/);
    assert.ok(INTASTELLAR_LOGO_ATTACHMENT.content.length > 1000);
});

test("emails: alerts and reports all use the shared layout", () => {
    for (const file of ["_alert-check", "cron-analytics-alerts", "_scheduled-report"]) {
        const source = fs.readFileSync(new URL(`../api/${file}.js`, import.meta.url), "utf8");
        assert.match(source, /emailLayout\(\{/, file);
        assert.match(source, /attachments: \[INTASTELLAR_LOGO_ATTACHMENT\]/, file);
        assert.doesNotMatch(source, /#0f1117/, file);
    }
});
