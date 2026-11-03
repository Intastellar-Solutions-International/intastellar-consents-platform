// GET /api/a serves EMBED_SCRIPT minified (api/_minify-embed.js). These run
// the real minifier over the real shipped script, so an edit to the embed
// script that terser can't handle — or that minification would break — fails
// here instead of on customer sites.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { minifyEmbed, createEmbedCache } from "../api/_minify-embed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "api", "a.js"), "utf8");

// Evaluate the EMBED_SCRIPT template literal (api/a.js can't be imported in
// plain Node) to get the exact string the handler minifies.
function shippedScript() {
    const marker = "export const EMBED_SCRIPT = ";
    const start = SRC.indexOf(marker) + marker.length;
    let i = start + 1;
    for (; i < SRC.length; i++) {
        if (SRC[i] === "\\") { i++; continue; }
        if (SRC[i] === "`") break;
    }
    return vm.runInNewContext(SRC.slice(start, i + 1));
}

test("the minified embed script parses and is much smaller", async () => {
    const source = shippedScript();
    const min = await minifyEmbed(source);
    new vm.Script(min); // throws on a syntax error
    assert.ok(min.length < source.length * 0.6, `expected <60% of ${source.length}, got ${min.length}`);
});

test("minification keeps the public API and wire-format strings", async () => {
    const min = await minifyEmbed(shippedScript());
    for (const s of ["intaAnalytics", "track", "ia_debug", "_ia_dbg", "data-site", "IntaAcceptAll", "IntaSaveSettings", "__ICS_SCAN__"]) {
        assert.ok(min.includes(s), `minified script lost "${s}"`);
    }
});

test("createEmbedCache falls back to the original source when minification fails", async () => {
    const broken = "function (";
    const errors = console.error;
    console.error = () => {};
    try {
        assert.strictEqual(await createEmbedCache(broken)(), broken);
    } finally {
        console.error = errors;
    }
});
