// Item 2 (frontend half): the "Exclude suspected bots" preference and the
// ExcludeBots header it produces. Evaluated from source text with a stubbed
// localStorage/window (src/ files aren't Node-importable).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "botFilter.js"), "utf8")
    .replace(/^export /gm, "");

function load(storage) {
    const events = [];
    const ctx = vm.createContext({
        localStorage: storage,
        window: { dispatchEvent: (e) => events.push(e.type) },
        Event: class { constructor(type) { this.type = type; } },
    });
    vm.runInContext(SRC, ctx);
    return { ctx, events };
}

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("suspected bots are excluded by default", () => {
    const { ctx } = load(memoryStorage());
    assert.strictEqual(ctx.excludeBotsHeader(), "1");
});

test("turning the toggle off sends ExcludeBots: 0 and notifies other toggles", () => {
    const { ctx, events } = load(memoryStorage());
    ctx.setExcludeBots(false);
    assert.strictEqual(ctx.excludeBotsHeader(), "0");
    assert.deepStrictEqual(events, ["intastellar-bot-filter-changed"]);
    ctx.setExcludeBots(true);
    assert.strictEqual(ctx.excludeBotsHeader(), "1");
});

test("bots stay excluded when storage is unavailable (private mode)", () => {
    const { ctx } = load({ getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } });
    assert.strictEqual(ctx.excludeBotsHeader(), "1");
    assert.doesNotThrow(() => ctx.setExcludeBots(false));
});
