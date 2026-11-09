// Stage 3: the new shell's health checks and feature flag. Evaluated from
// source text with stubs (src/ files aren't Node-importable).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

const healthSrc = read("src/Components/Shell/useDomainHealth.js");
const fnSrc = healthSrc.slice(healthSrc.indexOf("const HOUR"), healthSrc.indexOf("export default function useDomainHealth")).replace(/^export /gm, "");
// t() stands in for src/i18n's: English text with {placeholders} filled.
const t = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);
const ctx = vm.createContext({ Math, Date, t });
vm.runInContext(fnSrc, ctx);
const NOW = Date.parse("2026-11-03T12:00:00Z");
const at = (h) => new Date(NOW - h * 3600e3);
const build = (o) => ctx.buildHealthChecks({ now: NOW, ...o });

test("health: recent consent and scan are ok", () => {
    const c = build({ lastConsentAt: at(2), lastScanAt: at(24) });
    assert.deepStrictEqual(Array.from(c, (x) => x.status), ["ok", "ok"]);
    assert.match(c[0].detail, /last consent 2 h ago/);
});

test("health: logging goes warning after a day and error after a week", () => {
    assert.strictEqual(build({ lastConsentAt: at(30), lastScanAt: at(1) })[0].status, "warning");
    assert.strictEqual(build({ lastConsentAt: at(24 * 8), lastScanAt: at(1) })[0].status, "error");
    assert.strictEqual(build({ lastConsentAt: null, lastScanAt: at(1) })[0].status, "error");
});

test("health: stale or missing scan is a warning; failed checks are unknown, not guessed", () => {
    assert.strictEqual(build({ lastConsentAt: at(1), lastScanAt: at(24 * 15) })[1].status, "warning");
    assert.strictEqual(build({ lastConsentAt: at(1), lastScanAt: null })[1].detail, "not scanned yet");
    const failed = build({ consentFailed: true, scanFailed: true });
    assert.deepStrictEqual(Array.from(failed, (x) => x.status), ["unknown", "unknown"]);
});

test("feature flag: on by default, ?shell=new / ?shell=classic switch and persist", () => {
    const flagSrc = read("src/Functions/featureFlags.js").replace(/^export /gm, "");
    const run = (search, store = new Map()) => {
        const c = vm.createContext({
            window: { location: { search }, dispatchEvent() {} }, Event: class {}, URLSearchParams,
            localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
        });
        vm.runInContext(flagSrc, c);
        return { on: c.isNewShell(), store };
    };
    assert.strictEqual(run("").on, true);
    const { on, store } = run("?shell=new");
    assert.strictEqual(on, true);
    assert.strictEqual(run("", store).on, true, "remembered");
    assert.strictEqual(run("?shell=classic", store).on, false);
});
