// Item 1 (frontend half): consent timestamps from the consent API are UTC
// wall-clock strings with no zone marker. src/Functions/consentTimestamp.js
// is evaluated from source text (src/ files are bundled by webpack and not
// importable as Node modules), same approach as kpi-card.test.mjs.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "Functions", "consentTimestamp.js"), "utf8");
const parseConsentTimestamp = vm.runInNewContext(`${SRC.replace(/^export /m, "")}; parseConsentTimestamp`, { Date, Number });

test("zone-less consent timestamps are read as UTC, not browser-local time", () => {
    assert.strictEqual(parseConsentTimestamp("2026-11-03 14:30:05").toISOString(), "2026-11-03T14:30:05.000Z");
    assert.strictEqual(parseConsentTimestamp("2026-11-03T14:30:05").toISOString(), "2026-11-03T14:30:05.000Z");
});

test("timestamps that carry their own zone are left as they are", () => {
    assert.strictEqual(parseConsentTimestamp("2026-11-03T14:30:05Z").toISOString(), "2026-11-03T14:30:05.000Z");
    assert.strictEqual(parseConsentTimestamp("2026-11-03T15:30:05+01:00").toISOString(), "2026-11-03T14:30:05.000Z");
});

test("missing or garbage timestamps give null instead of an Invalid Date", () => {
    for (const v of [null, undefined, "", "not a date"]) assert.strictEqual(parseConsentTimestamp(v), null);
});
