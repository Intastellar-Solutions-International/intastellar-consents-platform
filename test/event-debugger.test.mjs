// Tests the event-debugger pieces of api/a.js's EMBED_SCRIPT — trackWarnings()
// and the debug-token injection in send(). Same approach as
// tracker-embedded.test.mjs: the shipped string is evaluated from the file
// text (api/a.js can't be imported in plain Node) and the individual
// functions are run in a small vm context.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "api", "a.js"), "utf8");

// Evaluate the EMBED_SCRIPT template literal so we test the string browsers
// actually receive (escape processing included), not the raw source text.
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
const SCRIPT = shippedScript();

// Both functions are declared at the script's top level, so they end at the
// first "\n}" — brace counting would trip over send()'s '{"dbg":"' literal.
function extractFunctionSource(src, name) {
    const start = src.indexOf(`\nfunction ${name}(`);
    assert.ok(start !== -1, `function ${name}() not found in EMBED_SCRIPT`);
    const end = src.indexOf("\n}", start + 1);
    return src.slice(start + 1, end + 2);
}

const trackWarnings = vm.runInNewContext(`(${extractFunctionSource(SCRIPT, "trackWarnings")})`);

test("trackWarnings() is silent for a well-formed call", () => {
    assert.strictEqual(trackWarnings("purchase", {
        value: 49.99, currency: "EUR", transactionId: "T1",
        products: [{ id: "A", price: 10, quantity: 2 }], data: { plan: "pro" },
    }), undefined);
    assert.strictEqual(trackWarnings("signup", undefined), undefined);
});

test("trackWarnings() flags a string value, which ingestion silently drops", () => {
    const w = trackWarnings("purchase", { value: "49.99", currency: "EUR" });
    assert.ok(w && w.some((m) => m.includes("value must be a number")), JSON.stringify(w));
});

test("trackWarnings() flags unknown top-level options", () => {
    const w = trackWarnings("purchase", { value: 1, orderId: "X" });
    assert.ok(w && w.some((m) => m.includes('Unknown option "orderId"')), JSON.stringify(w));
});

test("trackWarnings() flags a non-object second argument", () => {
    const w = trackWarnings("purchase", 49.99);
    assert.ok(w && w[0].includes("options object"), JSON.stringify(w));
});

test("trackWarnings() flags bad currency, long names and non-numeric product prices", () => {
    const w = trackWarnings("x".repeat(70), { currency: "euro", products: [{ price: "9" }] });
    assert.ok(w.some((m) => m.includes("longer than 64")));
    assert.ok(w.some((m) => m.includes("3-letter ISO")));
    assert.ok(w.some((m) => m.includes("products[0].price")));
});

function runSend(dbg, payload) {
    const sent = [];
    const ctx = vm.createContext({
        DBG: dbg,
        EP: "https://example.test/api/a",
        console: { info() {}, warn() {} },
        window: { fetch: true },
        fetch: (url, init) => { sent.push(init.body); return { catch() {} }; },
    });
    vm.runInContext(`${extractFunctionSource(SCRIPT, "send")}; send(${JSON.stringify(payload)});`, ctx);
    return sent;
}

test("send() leaves payloads untouched outside a debug session", () => {
    const body = JSON.stringify({ s: "site", n: "purchase" });
    assert.deepStrictEqual(runSend(null, body), [body]);
});

test("send() adds the debug token as valid JSON during a debug session", () => {
    const [sent] = runSend("abcdefghij0123456789", JSON.stringify({ s: "site", n: "purchase" }));
    assert.deepStrictEqual(JSON.parse(sent), { dbg: "abcdefghij0123456789", s: "site", n: "purchase" });
});
