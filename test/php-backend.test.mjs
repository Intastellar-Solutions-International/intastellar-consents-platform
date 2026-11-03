// Runs the PHP test suite (php-backend/tests/run.php) as part of `npm test`,
// so the consent API's query logic is covered by the same command. Skipped —
// not failed — on machines without a PHP CLI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(__dirname, "..", "php-backend", "tests", "run.php");

test("PHP consent API tests (php-backend/tests)", () => {
    const res = spawnSync("php", [runner], { encoding: "utf8" });
    if (res.error && res.error.code === "ENOENT") {
        console.log("    (skipped — no php CLI on this machine)");
        return;
    }
    process.stdout.write(res.stdout.replace(/^/gm, "  "));
    assert.strictEqual(res.status, 0, res.stderr || "PHP tests failed");
});
