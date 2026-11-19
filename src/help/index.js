// Help hub content: every src/help/articles/*.md, bundled at build time
// (webpack asset/source). An article's frontmatter says what it is:
//
//   ---
//   title: Banner acceptance vs. statistics consent
//   summary: One line shown in lists and search results
//   category: analytics            (a key of CATEGORIES)
//   product: both | cmp | analytics
//   routes: /analytics/*/consent, /gdpr/dashboard   (pages it explains)
//   tags: consent rate, acceptance                   (extra search words)
//   order: 10                                         (sort within category)
//   ---
//
// `routes`: "*" matches one path segment (e.g. the domain), "**" any number.
//
// Translations: articles/<lang>/<id>.md (lang = an src/i18n code: de, da, …)
// with only title / summary / tags + body. Category, product, routes and
// order always come from the English article, so they can't drift. The
// app reloads on a language change, so the language is resolved once here;
// a missing translation falls back to English.
import { parseFrontmatter, plainText } from "./markdown.js";
import { getLanguage } from "../i18n/index.js";

export const CATEGORIES = [
    { id: "start", title: "Getting started" },
    { id: "consent", title: "Consent & compliance" },
    { id: "analytics", title: "Analytics" },
    { id: "ads", title: "Ads & marketing" },
    { id: "account", title: "Account, privacy & data" },
];

function routeToRegExp(pattern) {
    const escaped = pattern.trim().replace(/\/+$/, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("^" + escaped.replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]+").replace(/\u0000/g, ".*") + "/?$");
}

const context = require.context("./articles", true, /\.md$/);
const readSource = (key) => { const mod = context(key); return typeof mod === "string" ? mod : mod?.default || ""; };
const language = getLanguage();
const isEnglish = (key) => /^\.\/[^/]+\.md$/.test(key);
const translationKey = (id) => `./${language}/${id}.md`;
const keys = new Set(context.keys());

export const ARTICLES = context.keys().filter(isEnglish).map((key) => {
    const { meta, body: englishBody } = parseFrontmatter(readSource(key));
    const id = key.replace(/^\.\//, "").replace(/\.md$/, "");
    const translated = language !== "en" && keys.has(translationKey(id)) ? parseFrontmatter(readSource(translationKey(id))) : null;
    const local = translated?.meta || {};
    const body = translated ? translated.body : englishBody;
    return {
        id,
        title: local.title || meta.title || id,
        summary: local.summary || meta.summary || "",
        category: meta.category || "start",
        product: meta.product || "both",
        routes: (meta.routes || []).map(routeToRegExp),
        // Local search words plus the English ones (people search in both).
        tags: [...(local.tags || []), ...(meta.tags || [])],
        order: Number(meta.order) || 100,
        body,
        text: plainText(body).toLowerCase(),
    };
}).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, language));

export function getArticle(id) {
    return ARTICLES.find((a) => a.id === id) || null;
}

/** Articles that explain the page at `pathname` (decoded, as the router gives it). */
export function articlesForPath(pathname) {
    const path = String(pathname || "").replace(/\/+$/, "") || "/";
    return ARTICLES.filter((a) => a.routes.some((r) => r.test(path)));
}

/** Every word must match; title and tag hits rank above body hits. */
export function searchArticles(query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    return ARTICLES
        .map((a) => {
            const head = `${a.title} ${a.summary} ${a.tags.join(" ")}`.toLowerCase();
            if (!words.every((w) => head.includes(w) || a.text.includes(w))) return null;
            const score = words.reduce((s, w) => s + (a.title.toLowerCase().includes(w) ? 3 : head.includes(w) ? 2 : 1), 0);
            return { article: a, score };
        })
        .filter(Boolean)
        .sort((x, y) => y.score - x.score)
        .map((x) => x.article);
}
