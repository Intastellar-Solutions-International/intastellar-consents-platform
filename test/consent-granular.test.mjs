// Tests the real, shipped hookConsentTrigger() source inside api/a.js's
// EMBED_SCRIPT — extracted from the file text (not imported as a module),
// same reason as test/tracker-embedded.test.mjs. Verifies that wrapping
// IntaSaveSettings vs IntaAcceptAll calls onBannerAction with the correct
// isGranular flag — the mechanism behind the g:1/0 field on sendFull/track
// payloads (docs/analytics-audit-plan.md item 6).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "api", "a.js"), "utf8");

function extractFunctionSource(src, name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `function ${name}() not found in api/a.js`);
    const braceStart = src.indexOf("{", start);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i);
}

const hookConsentTriggerSrc = extractFunctionSource(SRC, "hookConsentTrigger");

function runHook(triggerName) {
    const calls = [];
    const ctx = vm.createContext({
        window: { [triggerName]: function () { return "banner-return-value"; } },
        onBannerAction: (isGranular) => calls.push(isGranular),
        setTimeout: (fn) => fn(), // run the safety re-check synchronously for the test
    });
    vm.runInContext(`
        ${hookConsentTriggerSrc}
        hookConsentTrigger(${JSON.stringify(triggerName)});
        window[${JSON.stringify(triggerName)}]();
    `, ctx);
    return calls;
}

test("hookConsentTrigger('IntaSaveSettings') calls onBannerAction with isGranular=true", () => {
    const calls = runHook("IntaSaveSettings");
    assert.deepEqual(calls, [true, true]); // once immediately, once from the setTimeout safety re-check
});

test("hookConsentTrigger('IntaAcceptAll') calls onBannerAction with isGranular=false", () => {
    const calls = runHook("IntaAcceptAll");
    assert.deepEqual(calls, [false, false]);
});

test("hookConsentTrigger does not re-wrap an already-hooked function", () => {
    const ctx = vm.createContext({
        window: { IntaAcceptAll: Object.assign(function () {}, { __intaHooked: true }) },
        onBannerAction: () => { throw new Error("should not be called — already hooked"); },
        setTimeout: (fn) => fn(),
    });
    vm.runInContext(`
        ${hookConsentTriggerSrc}
        hookConsentTrigger("IntaAcceptAll");
    `, ctx);
    // No throw means the original (already-hooked) function was left alone.
});
