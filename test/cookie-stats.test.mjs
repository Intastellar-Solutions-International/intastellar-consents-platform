// Item 3: Home, Compliance and the audit snapshot card take their pre- and
// post-consent cookie numbers from src/Functions/cookieStats.js.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "cookieStats.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);
const { preConsentCookieStat, postConsentCookieStat } = ctx;

const scan = (n, extra = {}) => ({ scanned_at: "2026-11-03T09:43:16Z", pre_consent_cookies: Array(n).fill({ name: "c" }), ...extra });

test("pre-consent count comes from the latest completed scan", () => {
    const s = preConsentCookieStat(scan(30));
    assert.strictEqual(s.count, 30);
    assert.strictEqual(s.label, null);
});

test("cookies set after the scanner accepted are not pre-consent cookies", () => {
    const pre_consent_cookies = [{ consentPhase: "pre" }, { consentPhase: "post" }, { consentPhase: "post" }];
    assert.strictEqual(preConsentCookieStat(scan(0, { pre_consent_cookies, consent_phase_known: true })).count, 1);
    assert.strictEqual(preConsentCookieStat(scan(3)).count, 3); // older scan without tags
    const split = preConsentCookieStat(scan(0, { pre_consent_cookies, consent_phase_known: true }));
    assert.strictEqual(split.total, 3);
    assert.strictEqual(split.afterConsent, 2);
    assert.strictEqual(preConsentCookieStat(scan(3)).afterConsent, null);
});

test("zero pre-consent cookies is a real answer, not a dash", () => {
    assert.strictEqual(preConsentCookieStat(scan(0)).count, 0);
});

test("a completed scan still counts when a newer attempt is running", () => {
    assert.strictEqual(preConsentCookieStat(scan(30, { latest_attempt: { status: "in_progress" } })).count, 30);
});

test("no scan says Not scanned, with the reason", () => {
    const never = preConsentCookieStat({ error: "No scan found for this domain.", latest_attempt: null });
    assert.strictEqual(never.count, null);
    assert.strictEqual(never.label, "Not scanned");
    assert.match(never.reason, /No cookie scan has run/);

    const running = preConsentCookieStat({ error: "No scan found", latest_attempt: { status: "in_progress" } });
    assert.match(running.reason, /running/);

    const failed = preConsentCookieStat({ error: "No scan found", latest_attempt: { status: "failed", error: "net::ERR_CERT_COMMON_NAME_INVALID at https://x\nmore" } });
    assert.match(failed.reason, /couldn't load the site \(net::ERR_CERT_COMMON_NAME_INVALID at https:\/\/x\)/);

    assert.match(preConsentCookieStat(null).reason, /couldn't be loaded/);
});

test("post-consent count comes from the banner's reports, or says why not", () => {
    assert.strictEqual(postConsentCookieStat({ consent: { count: 12 } }).count, 12);
    for (const observed of [null, {}, { consent: { count: 0 } }]) {
        const s = postConsentCookieStat(observed);
        assert.strictEqual(s.count, null);
        assert.strictEqual(s.label, "Not observed yet");
    }
});
