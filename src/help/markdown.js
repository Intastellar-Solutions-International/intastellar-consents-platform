// Tiny Markdown renderer for the Help hub's own articles (src/help/articles).
// Escape first, then turn a known subset into HTML — so nothing in an
// article can inject markup, and no dependency is needed:
//   # / ## / ### headings · paragraphs · - and 1. lists · **bold** · _italic_
//   `code` · [text](url) · > tip blocks · ``` code blocks
// Links: "/path" stays in the app (the panel routes it), "help:<id>" opens
// another article, http(s) opens a new tab. Anything else is dropped.

/** "---\nkey: value\n---\nbody" → { meta, body }. Lists: "a, b, c". */
export function parseFrontmatter(source) {
    const text = String(source || "").replace(/^﻿/, "");
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(":");
        if (i < 1) continue;
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim();
        meta[key] = ["routes", "tags"].includes(key)
            ? value.split(",").map((v) => v.trim()).filter(Boolean)
            : value;
    }
    return { meta, body: text.slice(m[0].length) };
}

const escapeHtml = (s) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function safeHref(url) {
    if (/^help:[a-z0-9-]+$/.test(url)) return { href: `#${url}`, kind: "help" };
    if (/^\/(?!\/)[^\s]*$/.test(url)) return { href: url, kind: "app" };
    if (/^https?:\/\/[^\s]+$/.test(url)) return { href: url, kind: "external" };
    return null;
}

// Inline formatting on already-escaped text.
function inline(text) {
    // Code first, so its content isn't formatted further.
    const codes = [];
    let out = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
        const link = safeHref(url.replace(/&amp;/g, "&"));
        if (!link) return label;
        const extra = link.kind === "external" ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${escapeHtml(link.href)}" data-kind="${link.kind}"${extra}>${label}</a>`;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

/** Markdown body → HTML string (safe to set as innerHTML). */
export function renderMarkdown(body) {
    const lines = escapeHtml(String(body || "")).split(/\r?\n/);
    const html = [];
    let para = [], list = null, quote = [], code = null;

    const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
    const flushList = () => { if (list) { html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };
    const flushQuote = () => { if (quote.length) { html.push(`<aside class="help-tip">${inline(quote.join(" "))}</aside>`); quote = []; } };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (code) {
            if (/^```/.test(line)) { html.push(`<pre><code>${code.join("\n")}</code></pre>`); code = null; }
            else code.push(raw);
            continue;
        }
        if (/^```/.test(line)) { flushAll(); code = []; continue; }
        if (!line.trim()) { flushAll(); continue; }
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) { flushAll(); const level = h[1].length + 1; html.push(`<h${level}>${inline(h[2])}</h${level}>`); continue; }
        const q = /^&gt;\s?(.*)$/.exec(line);
        if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
        const ul = /^[-*]\s+(.*)$/.exec(line);
        const ol = /^\d+\.\s+(.*)$/.exec(line);
        if (ul || ol) {
            flushPara(); flushQuote();
            const tag = ul ? "ul" : "ol";
            if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
            list.items.push((ul || ol)[1]);
            continue;
        }
        if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
        flushList(); flushQuote();
        para.push(line.trim());
    }
    if (code) html.push(`<pre><code>${code.join("\n")}</code></pre>`);
    flushAll();
    return html.join("\n");
}

/** Plain text for search: markdown syntax stripped. */
export function plainText(body) {
    return String(body || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[#>*_`|-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
