// Login page translations: every language has every key, and the language
// choice (src/i18n/languages.js) falls back sensibly. Evaluated from source text (src/ files aren't
// Node-importable).
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Plain modules with no imports: drop "export" and run them in one context.
const load = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8")
    .replace(/^export const /gm, "var ").replace(/^export function /gm, "function ");
const ctx = vm.createContext({});
vm.runInContext(load("src/i18n/languages.js") + "\n" + load("src/Login/loginTranslations.js"), ctx);

test("every login language has every key, with the same number of selling points", () => {
    const en = ctx.TRANSLATIONS.en;
    for (const { code } of ctx.LANGUAGES) {
        const t = ctx.TRANSLATIONS[code];
        assert.ok(t, `${code} missing`);
        assert.deepStrictEqual(Object.keys(t).sort(), Object.keys(en).sort(), code);
        assert.strictEqual(t.points.length, en.points.length, code);
        for (const [key, value] of Object.entries(t)) {
            if (key !== "points") assert.ok(typeof value === "string" && value.trim(), `${code}.${key} empty`);
        }
    }
});
