// Tests splitForeignDomainsByRecency() in src/Pages/Analytics/_shared.js —
// the Overview banner's "is this domain actually still a live issue"
// split (docs/analytics-audit-plan.md item 4). Extracted from the file as
// text rather than imported as a module: _shared.js pulls in a long chain
// of browser-only dependencies (React globals, chart libs, etc.) that don't
// run in plain Node, same reason as test/tracker-embedded.test.mjs.
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

const fnSrc = extractFunctionSource(SRC, "splitForeignDomainsByRecency");

function split(domains, fromDate) {
    const ctx = vm.createContext({ Array, Date });
    return vm.runInContext(`(${fnSrc})`, ctx)(domains, fromDate);
}

const FROM = new Date("2026-09-27T00:00:00Z");

test("splitForeignDomainsByRecency puts a domain last seen within range into recent", () => {
    const { recent, olderCount } = split(
        [{ domain: "x.example.com", last_seen: "2026-10-26T00:00:00Z" }],
        FROM
    );
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(olderCount, 0);
});

test("splitForeignDomainsByRecency counts a domain last seen before the range as older, not recent", () => {
    const { recent, olderCount } = split(
        [{ domain: "x.example.com", last_seen: "2026-08-26T00:00:00Z" }],
        FROM
    );
    assert.strictEqual(recent.length, 0);
    assert.strictEqual(olderCount, 1);
});

test("splitForeignDomainsByRecency matches the real asasoftware.aero split (1 recent, 34 older)", () => {
    const domains = [
        { domain: "www-asasoftware-aero.translate.goog", last_seen: "2026-10-26T03:44:55.863Z" },
        ...Array.from({ length: 34 }, (_, i) => ({
            domain: `stale-${i}.example.com`,
            last_seen: "2026-09-04T00:00:00Z",
        })),
    ];
    const { recent, olderCount } = split(domains, FROM);
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].domain, "www-asasoftware-aero.translate.goog");
    assert.strictEqual(olderCount, 34);
});

test("splitForeignDomainsByRecency treats a missing last_seen as older, not recent", () => {
    const { recent, olderCount } = split([{ domain: "x.example.com", last_seen: null }], FROM);
    assert.strictEqual(recent.length, 0);
    assert.strictEqual(olderCount, 1);
});
