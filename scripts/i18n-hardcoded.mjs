// Finds English written straight into page code instead of going through
// t()/tx(): text between JSX tags, visible attributes (title, placeholder,
// aria-label, alt, label, hint, …) and strings chosen inside {…} in JSX
// (e.g. {busy ? "Saving…" : "Save"}). Parsed with Babel, so text spread
// over several lines counts too.
//
// test/i18n.test.mjs keeps the total from growing; run directly to see
// where it is:
//   node scripts/i18n-hardcoded.mjs            per-area totals
//   node scripts/i18n-hardcoded.mjs <path>     the texts in files under <path>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = [`${path.sep}i18n${path.sep}`, `${path.sep}help${path.sep}`, `${path.sep}Login${path.sep}`, `${path.sep}Styleguide${path.sep}`];
const VISIBLE_ATTRS = new Set(["title", "placeholder", "aria-label", "alt", "label", "hint", "message", "description", "source", "emptyText", "featureName"]);

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return files(p);
        return /\.js$/.test(e.name) ? [p] : [];
    });
}

// Words a person reads: letters, and either a space or a capital start.
// Leaves out codes and keys ("EUR", "rtl", "data-site", "PHPSESSID").
function isProse(text) {
    const s = text.replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2}/.test(s)) return false;
    if (/^[A-Z0-9_.:/\-]+$/.test(s)) return false;        // EUR, PHPSESSID, CTR
    if (/^[a-z0-9_.:/\-]+$/.test(s)) return false;        // keys, paths, ids
    if (/^(https?:|\/|#|\.|[\w-]+\.(js|css|png|svg)$)/.test(s)) return false;
    return /\s/.test(s) || /^[A-Z][a-z]/.test(s);
}

const isTranslateCall = (node) =>
    node?.type === "CallExpression" && node.callee.type === "Identifier" && (node.callee.name === "t" || node.callee.name === "tx");

function walk(node, visit, parents = []) {
    if (!node || typeof node.type !== "string") return;
    visit(node, parents);
    const next = [...parents, node];
    for (const key of Object.keys(node)) {
        if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments") continue;
        const v = node[key];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, visit, next));
        else if (v && typeof v.type === "string") walk(v, visit, next);
    }
}

// A string literal shown directly as JSX content: {"…"}, {a ? "…" : "…"}, {a && "…"}.
function shownInJsx(parents) {
    for (let i = parents.length - 1; i >= 0; i--) {
        const p = parents[i];
        if (p.type === "JSXExpressionContainer") return parents[i - 1]?.type !== "JSXAttribute" || VISIBLE_ATTRS.has(parents[i - 1].name?.name);
        if (p.type === "BinaryExpression" && p.operator !== "+") return false;   // comparisons aren't shown
        if (p.type === "ConditionalExpression" && parents[i + 1] === p.test) return false;
        if (!["ConditionalExpression", "LogicalExpression", "TemplateLiteral", "BinaryExpression"].includes(p.type)) return false;
    }
    return false;
}

export function hardcodedTexts() {
    const out = [];
    for (const file of files(path.join(root, "src"))) {
        if (SKIP.some((s) => file.includes(s))) continue;
        const src = fs.readFileSync(file, "utf8");
        if (!src.includes("<")) continue;
        let ast;
        try {
            ast = parse(src, { sourceType: "module", plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"], errorRecovery: true });
        } catch {
            continue;
        }
        const rel = path.relative(root, file);
        const add = (node, text) => out.push({ file: rel, line: node.loc.start.line, text: text.replace(/\s+/g, " ").trim() });
        walk(ast.program, (node, parents) => {
            if (parents.some(isTranslateCall)) return;
            if (node.type === "JSXText" && isProse(node.value)) add(node, node.value);
            else if (node.type === "JSXAttribute" && VISIBLE_ATTRS.has(node.name?.name) && node.value?.type === "StringLiteral" && isProse(node.value.value)) add(node, node.value.value);
            else if (node.type === "StringLiteral" && parents.at(-1)?.type !== "JSXAttribute" && shownInJsx(parents) && isProse(node.value)) add(node, node.value);
            else if (node.type === "TemplateLiteral" && shownInJsx(parents)) {
                const text = node.quasis.map((q) => q.value.cooked).join("…");
                if (isProse(text) && /[a-z]{3,} [a-z]{2,}/i.test(text)) add(node, text);
            }
        });
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const all = hardcodedTexts();
    const filter = process.argv[2];
    if (filter) {
        for (const h of all.filter((h) => h.file.startsWith(filter))) console.log(`${h.file}:${h.line}: ${h.text}`);
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
