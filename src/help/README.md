# Help hub articles

The in-app Help hub (side panel, `src/Components/Help`) shows every file in
`articles/`. Add or edit a `.md` file here and it ships with the next build.

## Frontmatter

```
---
title: Ad Spend
summary: One line shown in lists and search results.
category: ads              # start | consent | analytics | ads | account
product: analytics         # cmp | analytics | both
routes: /analytics/*/ad-spend, /analytics/ad-spend
tags: cpc, ctr, campaigns  # extra search words
order: 20                  # sort within the category
---
```

`routes` decides where the article appears under **For this page**:
`*` is one path segment (e.g. the domain), `**` any number.

## Writing

- Supported: `##`/`###` headings, paragraphs, `-` and `1.` lists, `**bold**`,
  `_italic_`, `` `code` ``, `> tip` blocks, fenced code, links.
- Links: `[text](/settings/ad-connections)` stays in the app,
  `[text](help:glossary)` opens another article, `https://…` opens a new tab.
  Nothing else becomes a link; HTML is shown as text.
- Describe what the product actually does today — the articles are part of
  the product, so change them in the same commit as the feature.
- Open an article from code with `openHelp("article-id")`
  (`src/Components/Help/index.js`).

## Translations

`articles/<lang>/<id>.md` (de, da, sv, nb, nl, fr, es, it, pl — the
languages in `src/i18n/languages.js`). A translation has only `title`,
`summary` and `tags` in its frontmatter, plus the body; category, product,
routes and order always come from the English article. A missing
translation falls back to English. Change an article and its translations
in the same commit.

`npm test` checks that every article has a title, summary and valid category,
that every language has every article, and that every `help:` link points to
an existing article.
