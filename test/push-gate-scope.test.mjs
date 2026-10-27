// Regression test for a bug reported live while item 2 was in progress:
// NON_CONVERSION_AUTO_EVENTS was declared inside the EMBED_SCRIPT template
// literal (shipped to browsers, never used there) instead of in real
// server-side module scope, so the one real usage — in the POST handler's
// ad-conversion-push queueing gate — threw
// `ReferenceError: NON_CONVERSION_AUTO_EVENTS is not defined` on every
// ad-attributed conversion event. Reads the file as text rather than
// importing it, same reason as test/tracker-embedded.test.mjs (importing
// api/a.js pulls in a dependency chain needing browser/edge globals this
// plain-Node environment doesn't have).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "api", "a.js"), "utf8");

const EMBED_START_MARKER = "export const EMBED_SCRIPT = `";
const embedStart = SRC.indexOf(EMBED_START_MARKER) + EMBED_START_MARKER.length;
assert.ok(embedStart > EMBED_START_MARKER.length - 1, "EMBED_SCRIPT declaration not found in api/a.js");
const embedEnd = SRC.indexOf("`;", embedStart);
assert.ok(embedEnd !== -1, "EMBED_SCRIPT closing backtick not found in api/a.js");

const embedScriptBody = SRC.slice(embedStart, embedEnd);
const beforeEmbedScript = SRC.slice(0, embedStart);
const afterEmbedScript = SRC.slice(embedEnd);

test("NON_CONVERSION_AUTO_EVENTS is not shipped inside the client-side EMBED_SCRIPT", () => {
    assert.ok(
        !embedScriptBody.includes("NON_CONVERSION_AUTO_EVENTS"),
        "NON_CONVERSION_AUTO_EVENTS re-appeared inside EMBED_SCRIPT — it is never used client-side " +
        "and declaring it there means the real (server-side) usage below can't see it"
    );
});

test("NON_CONVERSION_AUTO_EVENTS is declared in real server-side module scope", () => {
    assert.match(beforeEmbedScript, /const NON_CONVERSION_AUTO_EVENTS\s*=\s*new Set\(/);
});

test("the push-queueing gate's usage of NON_CONVERSION_AUTO_EVENTS resolves against that declaration", () => {
    assert.match(afterEmbedScript, /NON_CONVERSION_AUTO_EVENTS\.has\(/);
});
