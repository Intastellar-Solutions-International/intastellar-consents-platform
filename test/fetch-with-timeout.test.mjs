// Item 4: Home sections use fetchJsonWithTimeout so a slow or failing
// request ends in an error state with Retry instead of an endless skeleton.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "fetchWithTimeout.js"), "utf8").replace(/^export /gm, "");

function load(fetchImpl) {
    const ctx = vm.createContext({ fetch: fetchImpl, AbortController, setTimeout, clearTimeout, Error, Math, Object });
    vm.runInContext(SRC, ctx);
    return ctx.fetchJsonWithTimeout;
}
const ok = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
// Never resolves until aborted — like a hung server.
const hang = () => (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("AbortError"))));

test("returns the parsed JSON on success", async () => {
    assert.deepStrictEqual(await load(ok({ Total: 5 }))("u"), { Total: 5 });
});

test("gives up after the time limit instead of loading forever", async () => {
    const started = Date.now();
    await assert.rejects(load(hang())("u", {}, { timeoutMs: 50 }), (e) => e.kind === "timeout" && /No response within/.test(e.message));
    assert.ok(Date.now() - started < 1000);
});

test("reports server errors with their status", async () => {
    await assert.rejects(load(ok({}, 500))("u"), (e) => e.kind === "http" && e.status === 500 && /500/.test(e.message));
});

test("a superseded request is reported as aborted, not as an error", async () => {
    const ac = new AbortController();
    const p = load(hang())("u", {}, { signal: ac.signal, timeoutMs: 5000 });
    ac.abort();
    await assert.rejects(p, (e) => e.kind === "aborted");
});

test("an expired login triggers the login redirect hook", async () => {
    let redirected = 0;
    await assert.rejects(load(ok("Err_Login_Expired"))("u", {}, { onLoginExpired: () => redirected++ }), (e) => e.kind === "auth");
    await assert.rejects(load(ok({}, 401))("u", {}, { onLoginExpired: () => redirected++ }), (e) => e.kind === "auth");
    assert.strictEqual(redirected, 2);
});
