// Tests for docs/design-audit-plan.md Phase 2 item 5: elementLabel() in
// _shared.js — replacing raw selector strings ("button.btn.btn-primary.
// text-sm") with a readable label ('Button: "Continue"'), honest about
// which data sources actually have element text and which don't.
// Extracted as text, same reason as every other test on this file.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
    path.join(__dirname, "..", "src", "Pages", "Analytics", "_shared.js"),
    "utf8"
);

function extractFunctionSource(src, name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `function ${name}() not found in _shared.js`);
    const parenStart = src.indexOf("(", start);
    let pDepth = 0, j = parenStart;
    for (; j < src.length; j++) {
        if (src[j] === "(") pDepth++;
        else if (src[j] === ")") {
            pDepth--;
            if (pDepth === 0) { j++; break; }
        }
    }
    const braceStart = src.indexOf("{", j);
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

function extractConstSource(src, name) {
    const marker = `const ${name} = {`;
    const start = src.indexOf(marker);
    assert.ok(start !== -1, `const ${name} not found in _shared.js`);
    const braceStart = src.indexOf("{", start);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i) + ";";
}

function loadElementLabel() {
    const ctx = vm.createContext({ String });
    vm.runInContext(extractConstSource(SRC, "HUMAN_TAG"), ctx);
    vm.runInContext(extractFunctionSource(SRC, "humanizeTag"), ctx);
    const exportedSrc = extractFunctionSource(SRC, "elementLabel").replace(/^export\s+/, "");
    return vm.runInContext(`(${exportedSrc})`, ctx);
}

const elementLabel = loadElementLabel();

test("elementLabel combines a humanized tag with quoted text when both exist (the Heatmap case)", () => {
    assert.strictEqual(elementLabel({ tag: "button", text: "Continue" }), 'Button: "Continue"');
});

test("elementLabel falls back to just the humanized tag when text is missing (the rage-click case — api/a.js never tracks element text)", () => {
    assert.strictEqual(elementLabel({ tag: "button" }), "Button");
});

test("elementLabel falls back to just the humanized tag when text is empty/whitespace-only", () => {
    assert.strictEqual(elementLabel({ tag: "a", text: "   " }), "Link");
});

test("elementLabel maps known tags to human names (a→Link, input→Input, select→Dropdown)", () => {
    assert.strictEqual(elementLabel({ tag: "a", text: "Home" }), 'Link: "Home"');
    assert.strictEqual(elementLabel({ tag: "select" }), "Dropdown");
});

test("elementLabel capitalizes an unknown tag rather than failing", () => {
    assert.strictEqual(elementLabel({ tag: "span", text: "Close" }), 'Span: "Close"');
});

test("elementLabel falls back to \"Element\" when tag itself is missing", () => {
    assert.strictEqual(elementLabel({ text: "Continue" }), 'Element: "Continue"');
    assert.strictEqual(elementLabel({}), "Element");
    assert.strictEqual(elementLabel(), "Element");
});

test("elementLabel clips very long text rather than overflowing the table cell", () => {
    const longText = "A".repeat(60);
    const result = elementLabel({ tag: "button", text: longText });
    assert.ok(result.includes("…"), "expected truncation ellipsis");
    assert.ok(result.length < longText.length + 20, "expected the label to be meaningfully shorter than the raw text");
});
