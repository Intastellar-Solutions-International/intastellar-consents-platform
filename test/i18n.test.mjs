// Platform translations (src/i18n): every text the code passes to t() has a
// version in every language with the same {placeholders}, and lookups fall
// back to English.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";
import { platformStrings, loadDictionary } from "../scripts/i18n-strings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const languages = vm.createContext({});
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "src/i18n/languages.js"), "utf8")
        .replace(/^export const /gm, "var ").replace(/^export function /gm, "function "),
    languages
);

const strings = platformStrings();
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

for (const lang of languages.LANGUAGES.map((l) => l.code).filter((c) => c !== "en")) {
    const dict = loadDictionary(lang);

    test(`i18n: every platform text has a ${lang} translation (node scripts/i18n-strings.mjs ${lang} lists gaps)`, () => {
        const missing = strings.filter((s) => !(s in dict));
        assert.deepStrictEqual(missing, []);
    });

    test(`i18n: ${lang} translations keep the English {placeholders}`, () => {
        for (const [en, translated] of Object.entries(dict)) {
            assert.deepStrictEqual(placeholders(translated), placeholders(en), `${lang}: ${en}`);
            assert.ok(translated.trim(), `${lang}: empty translation for ${en}`);
        }
    });
}

test("i18n: lookup falls back to English and fills placeholders", () => {
    const dict = { "Renews {date}": "Verlängert sich am {date}" };
    assert.strictEqual(languages.translateWith(dict, "Renews {date}", { date: "5. Dez." }), "Verlängert sich am 5. Dez.");
    assert.strictEqual(languages.translateWith(dict, "Not translated yet"), "Not translated yet");
    assert.strictEqual(languages.translateWith(undefined, "Hi, {name}!", { name: "Ann" }), "Hi, Ann!");
    // An unknown placeholder is left for the caller (TierGate splits on {plan}).
    assert.strictEqual(languages.translateWith(dict, "{feature} requires the {plan} plan", { feature: "X" }), "X requires the {plan} plan");
});

test("i18n: language choice — saved, then browser, then English", () => {
    assert.strictEqual(languages.pickLanguage("da", ["de-DE"]), "da");
    assert.strictEqual(languages.pickLanguage(null, ["pt-BR", "de-AT"]), "de");
    assert.strictEqual(languages.pickLanguage("xx", ["pt-BR"]), "en");
    // Norwegian arrives as nb, no or nn; all are Bokmål here.
    for (const tag of ["nb-NO", "no", "nn-NO"]) assert.strictEqual(languages.pickLanguage(null, [tag]), "nb", tag);
});
