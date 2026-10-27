// Tests the real, shipped isEmbedded() source inside api/a.js's EMBED_SCRIPT —
// extracted from the file text (not imported as a module) because importing
// api/a.js directly pulls in a dependency chain that needs browser/edge
// globals (ReadableStream) this plain-Node test environment doesn't have.
// Reading the source and eval'ing just the one function in a tiny vm context
// still exercises the actual shipped code, so a future edit to isEmbedded()
// that changes its behavior will break this test.
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
    assert.ok(braceStart !== -1, `no opening brace found for ${name}()`);
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

const isEmbeddedSrc = extractFunctionSource(SRC, "isEmbedded");

function runIsEmbedded(mockWindow) {
    const ctx = vm.createContext({ window: mockWindow });
    return vm.runInContext(`(${isEmbeddedSrc})()`, ctx);
}

test("isEmbedded() is false at the top level (window.top === window.self)", () => {
    const w = {};
    w.top = w;
    w.self = w;
    assert.strictEqual(runIsEmbedded(w), false);
});

test("isEmbedded() is true inside a same-origin iframe (window.top !== window.self)", () => {
    const w = {};
    w.self = w;
    w.top = {}; // a distinct object stands in for the parent window
    assert.strictEqual(runIsEmbedded(w), true);
});

test("isEmbedded() is true when reading window.top throws (cross-origin sandbox)", () => {
    const w = {};
    w.self = w;
    Object.defineProperty(w, "top", {
        get() { throw new Error("cross-origin frame access denied"); },
    });
    assert.strictEqual(runIsEmbedded(w), true);
});
