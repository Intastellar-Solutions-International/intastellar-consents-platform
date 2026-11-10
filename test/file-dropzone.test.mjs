// The upload area accepts files the way the file picker does, including SVGs reported without a type.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { test } from "./_harness.mjs";

const ctx = vm.createContext({ String, Math });
vm.runInContext(fs.readFileSync(new URL("../src/Components/ui/fileAccept.js", import.meta.url), "utf8").replace(/^export /gm, "") + "\n;this.api = { acceptsFile, formatFileLimit };", ctx);
const { acceptsFile, formatFileLimit } = ctx.api;
const LOGO = ".png,.svg,image/png,image/svg+xml";

test("uploads: an SVG is accepted by type or, with no type reported, by name", () => {
    assert.ok(acceptsFile({ name: "logo.svg", type: "image/svg+xml" }, LOGO));
    assert.ok(acceptsFile({ name: "LOGO.SVG", type: "" }, LOGO));
});

test("uploads: other files are refused, and wildcards and no list work", () => {
    assert.ok(!acceptsFile({ name: "virus.exe", type: "application/x-msdownload" }, LOGO));
    assert.ok(acceptsFile({ name: "a.bin", type: "image/gif" }, "image/*"));
    assert.ok(acceptsFile({ name: "a.bin", type: "" }, undefined));
});

test("uploads: limits read naturally", () => {
    assert.strictEqual(formatFileLimit(200 * 1024), "200 KB");
    assert.strictEqual(formatFileLimit(3 * 1024 * 1024), "3 MB");
});
