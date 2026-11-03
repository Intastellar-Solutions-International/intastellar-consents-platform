// Scan consent phase: the scanner tags what it saw before granting consent
// ("pre") vs after ("post"), so "pre-consent" means pre-consent. The summary
// helper is imported directly; the scanner is read as source text (importing
// api/_scan-core.js pulls in Chromium).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { summarizeConsentPhase } from "../api/_consent-phase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN = fs.readFileSync(path.join(__dirname, "..", "api", "_scan-core.js"), "utf8");

test("phase summary counts pre-consent transfers and cookies", () => {
    const r = summarizeConsentPhase(
        [{ host: "a", consentPhase: "pre" }, { host: "b", consentPhase: "post" }, { host: "c", consentPhase: "pre" }],
        [{ name: "x", consentPhase: "post" }, { name: "y", consentPhase: "pre" }],
    );
    assert.deepEqual(r, { consent_phase_known: true, pre_consent_only: { transfers: 2, cookies: 1 } });
});

test("phase is unknown for scans made before tagging, or with any untagged item", () => {
    assert.deepEqual(summarizeConsentPhase([{ host: "a" }], []), { consent_phase_known: false, pre_consent_only: null });
    assert.equal(summarizeConsentPhase([{ host: "a", consentPhase: "pre" }], [{ name: "x" }]).consent_phase_known, false);
    assert.equal(summarizeConsentPhase([], []).consent_phase_known, false);
    assert.equal(summarizeConsentPhase().consent_phase_known, false);
});

test("scanner flips to post-consent before calling IntaAcceptAll, after snapshotting cookies", () => {
    const snapshot = SCAN.indexOf("preConsentCookieKeys = new Set(");
    const flip = SCAN.indexOf('consentPhase = "post"');
    const call = SCAN.indexOf("page.evaluate(() => IntaAcceptAll())");
    assert.ok(snapshot > 0 && flip > snapshot && call > flip, "order: snapshot → flip → IntaAcceptAll()");
    // The existence check must not call it (that would leak post-consent requests as "pre").
    assert.match(SCAN, /page\.evaluate\(\(\) => typeof IntaAcceptAll === "function"\)/);
});

test("scanner records the phase on every transfer and cookie it returns", () => {
    assert.match(SCAN, /seen\.set\(host, \{[\s\S]*?consentPhase,\s*\}\)/);
    assert.match(SCAN, /consentPhase:\s+info\.consentPhase/);
    assert.match(SCAN, /consentPhase: !preConsentCookieKeys \|\| preConsentCookieKeys\.has\(cookieKey\(c\)\) \? "pre" : "post"/);
});
