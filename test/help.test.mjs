// Help hub: the markdown renderer is safe, and every article is complete
// and only links to articles that exist.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(ROOT, "src", "help", "markdown.js"), "utf8").replace(/^export /gm, "");
const ctx = vm.createContext({});
vm.runInContext(SRC, ctx);
const { renderMarkdown, parseFrontmatter } = ctx;

const ARTICLE_DIR = path.join(ROOT, "src", "help", "articles");
const files = fs.readdirSync(ARTICLE_DIR).filter((f) => f.endsWith(".md"));
const ids = new Set(files.map((f) => f.replace(/\.md$/, "")));
const indexSrc = fs.readFileSync(path.join(ROOT, "src", "help", "index.js"), "utf8");
const categories = new Set([...indexSrc.matchAll(/\{ id: "([a-z]+)", title:/g)].map((m) => m[1]));

test("help markdown: HTML in an article is escaped, never executed", () => {
    const html = renderMarkdown("Hello <script>alert(1)</script> **bold** <img src=x onerror=alert(1)>");
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("<strong>bold</strong>"));
});

test("help markdown: only app, help: and http(s) links become links", () => {
    const html = renderMarkdown("[a](/settings) [b](help:glossary) [c](https://x.test) [d](javascript:alert(1))");
    assert.match(html, /href="\/settings" data-kind="app"/);
    assert.match(html, /href="#help:glossary" data-kind="help"/);
    assert.match(html, /href="https:\/\/x\.test" data-kind="external" target="_blank"/);
    assert.ok(!html.includes("javascript:"), "unsafe link dropped to plain text");
});

test("help markdown: headings, lists, tips and code render", () => {
    const html = renderMarkdown("## Title\n\n- one\n- two\n\n> a tip\n\n```\n<b>x</b>\n```");
    assert.match(html, /<h3>Title<\/h3>/);
    assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
    assert.match(html, /<aside class="help-tip">a tip<\/aside>/);
    assert.match(html, /<pre><code>&lt;b&gt;x&lt;\/b&gt;<\/code><\/pre>/);
});

test("help articles: each has a title, summary and a known category", () => {
    assert.ok(files.length > 0);
    for (const f of files) {
        const { meta } = parseFrontmatter(fs.readFileSync(path.join(ARTICLE_DIR, f), "utf8"));
        assert.ok(meta.title, `${f}: title`);
        assert.ok(meta.summary, `${f}: summary`);
        assert.ok(categories.has(meta.category), `${f}: category "${meta.category}"`);
        assert.ok(["cmp", "analytics", "both"].includes(meta.product), `${f}: product "${meta.product}"`);
    }
});

test("help articles: every help: link points to an article that exists", () => {
    for (const f of files) {
        const body = fs.readFileSync(path.join(ARTICLE_DIR, f), "utf8");
        for (const m of body.matchAll(/\]\(help:([a-z0-9-]+)\)/g)) {
            assert.ok(ids.has(m[1]), `${f} links to missing article "${m[1]}"`);
        }
    }
});

// ── Translations: articles/<lang>/<id>.md ──────────────────────────────────
const langSrc = fs.readFileSync(path.join(ROOT, "src", "i18n", "languages.js"), "utf8");
const languages = [...langSrc.matchAll(/\{ code: "([a-z]{2})"/g)].map((m) => m[1]).filter((c) => c !== "en");

test("help translations: every language has every article, each with a title and summary", () => {
    for (const lang of languages) {
        const dir = path.join(ARTICLE_DIR, lang);
        assert.ok(fs.existsSync(dir), `${lang}: missing folder`);
        const translated = new Set(fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));
        for (const id of ids) assert.ok(translated.has(id), `${lang}: missing translation of "${id}"`);
        for (const id of translated) {
            assert.ok(ids.has(id), `${lang}/${id}.md has no English original`);
            const { meta } = parseFrontmatter(fs.readFileSync(path.join(dir, `${id}.md`), "utf8"));
            assert.ok(meta.title && meta.summary, `${lang}/${id}.md: title and summary`);
        }
    }
});

test("help translations: every help: link points to an article that exists", () => {
    for (const lang of languages) {
        const dir = path.join(ARTICLE_DIR, lang);
        for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
            const body = fs.readFileSync(path.join(dir, f), "utf8");
            for (const m of body.matchAll(/\]\(help:([a-z0-9-]+)\)/g)) {
                assert.ok(ids.has(m[1]), `${lang}/${f} links to missing article "${m[1]}"`);
            }
        }
    }
});
