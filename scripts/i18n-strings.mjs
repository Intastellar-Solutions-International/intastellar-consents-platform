// Lists every English text the platform asks src/i18n to translate:
// t("...") calls, nav link names, TierGate feature names and fixed page
// titles. Used by test/i18n.test.mjs; run directly to see what's missing:
//   node scripts/i18n-strings.mjs [de|da]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return files(p);
        return /\.js$/.test(e.name) ? [p] : [];
    });
}

const unescape = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

export function platformStrings() {
    const found = new Set();
    for (const file of files(path.join(root, "src"))) {
        if (file.includes(`${path.sep}i18n${path.sep}`) || file.includes(`${path.sep}Login${path.sep}`)) continue;
        const src = fs.readFileSync(file, "utf8");
        const uses = /from "[./]*i18n\/index\.js"/.test(src);
        if (uses) for (const m of src.matchAll(/\bt\("((?:[^"\\]|\\.)+)"/g)) found.add(unescape(m[1]));
        // Shown through t() where they're rendered.
        if (file.endsWith(path.join("SideNavLinks", "index.js"))) {
            for (const m of src.matchAll(/\b(?:name|label): "([^"]+)"/g)) found.add(m[1]);
        }
        for (const m of src.matchAll(/featureName="([^"]+)"/g)) found.add(m[1]);
        for (const m of src.matchAll(/<(?:StickyPageTitle|SideNav)\b[^>]*?\stitle="([^"]+)"/g)) found.add(m[1]);
    }
    return [...found].sort();
}

// src/ files aren't Node-importable (no "type": "module"), so a dictionary
// is evaluated from its source text.
export function loadDictionary(lang) {
    const src = fs.readFileSync(path.join(root, "src", "i18n", `${lang}.js`), "utf8")
        .replace(/^export default \w+;\s*$/m, "");
    return vm.runInNewContext(`${src}\n${lang}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const lang = process.argv[2];
    const all = platformStrings();
    if (!lang) { console.log(all.join("\n")); console.error(`${all.length} strings`); }
    else {
        const dict = loadDictionary(lang);
        const missing = all.filter((s) => !(s in dict));
        console.log(missing.join("\n"));
        console.error(`${missing.length} of ${all.length} missing in ${lang}`);
    }
}
