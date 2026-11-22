// Finds English written straight into page code instead of going through
// t(): text between JSX tags (">Some text<") and visible attributes
// (title, placeholder, aria-label, label, hint, message, description).
// test/i18n.test.mjs keeps the total from growing; run directly to see
// where it is:
//   node scripts/i18n-hardcoded.mjs            per-area totals
//   node scripts/i18n-hardcoded.mjs <path>     the texts in files under <path>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = [`${path.sep}i18n${path.sep}`, `${path.sep}help${path.sep}`, `${path.sep}Login${path.sep}`];

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return files(p);
        return /\.js$/.test(e.name) ? [p] : [];
    });
}

const TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{2,}?)\s*</g;
const ATTR = /\b(?:title|placeholder|aria-label|label|hint|message|description)="([A-Z][^"{}]{2,})"/g;

export function hardcodedTexts() {
    const out = [];
    for (const file of files(path.join(root, "src"))) {
        if (SKIP.some((s) => file.includes(s))) continue;
        const src = fs.readFileSync(file, "utf8");
        const rel = path.relative(root, file);
        for (const m of src.matchAll(TEXT)) {
            const text = m[1].trim();
            if (/^[A-Z0-9_ .:/-]{1,6}$/.test(text) || text.includes("=>") || text.includes("&&")) continue;
            out.push({ file: rel, text });
        }
        for (const m of src.matchAll(ATTR)) out.push({ file: rel, text: m[1] });
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const all = hardcodedTexts();
    const filter = process.argv[2];
    if (filter) {
        for (const h of all.filter((h) => h.file.startsWith(filter))) console.log(`${h.file}: ${h.text}`);
    } else {
        const byArea = {};
        for (const h of all) {
            const area = h.file.split(path.sep).slice(1, 3).join("/");
            byArea[area] = (byArea[area] || 0) + 1;
        }
        for (const [area, n] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), area);
    }
    console.log(`${all.length} hard-coded texts`);
}
