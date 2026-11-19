import Drawer from "../ui/Drawer.js";
import { Icon } from "../ui/icons.js";
import { ARTICLES, CATEGORIES, getArticle, articlesForPath, searchArticles } from "../../help/index.js";
import { renderMarkdown } from "../../help/markdown.js";
import { t } from "../../i18n/index.js";
import "./Help.css";

const { useState, useEffect, useMemo, useRef } = React;
const useLocation = window.ReactRouterDOM.useLocation;
const useHistory = window.ReactRouterDOM.useHistory;

export const OPEN_HELP_EVENT = "help:open";

/** Open the Help hub — on a specific article when `articleId` is given. */
export function openHelp(articleId) {
    window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT, { detail: articleId ? { article: articleId } : {} }));
}

const HELP_DESK_URL = "https://help.intastellar.eu/";
const PRODUCT_LABEL = { cmp: "CMP", analytics: "Analytics" };

function ArticleRow({ article, onOpen }) {
    return (
        <li>
            <button type="button" className="help-hub__row" onClick={() => onOpen(article.id)}>
                <span className="help-hub__row-title">
                    {article.title}
                    {PRODUCT_LABEL[article.product] && <span className="help-hub__product">{PRODUCT_LABEL[article.product]}</span>}
                </span>
                {article.summary && <span className="help-hub__row-summary">{article.summary}</span>}
            </button>
        </li>
    );
}

/**
 * Help hub — a side panel with the platform's own articles (src/help/articles,
 * bundled with the app): search, "For this page" picked from the current
 * route, categories, and the article itself. Opens from the header's help
 * button, the sidebar footer, or openHelp("article-id") anywhere.
 */
export default function HelpCenter() {
    const [open, setOpen] = useState(false);
    const [articleId, setArticleId] = useState(null);
    const [query, setQuery] = useState("");
    const location = useLocation();
    const history = useHistory();
    const bodyRef = useRef(null);

    useEffect(() => {
        const show = (e) => {
            setArticleId(e?.detail?.article && getArticle(e.detail.article) ? e.detail.article : null);
            setQuery("");
            setOpen(true);
        };
        window.addEventListener(OPEN_HELP_EVENT, show);
        return () => window.removeEventListener(OPEN_HELP_EVENT, show);
    }, []);

    const article = articleId ? getArticle(articleId) : null;
    const html = useMemo(() => (article ? renderMarkdown(article.body) : ""), [article]);
    const forThisPage = useMemo(() => articlesForPath(location.pathname), [location.pathname]);
    const results = useMemo(() => searchArticles(query), [query]);

    // The Drawer's body is the scroll container — back to the top per article.
    useEffect(() => { bodyRef.current?.parentElement?.scrollTo?.(0, 0); }, [articleId]);

    // Links inside an article: help:<id> → another article, /path → navigate
    // in the app (and close the panel), external → new tab (default).
    function onArticleClick(e) {
        const a = e.target.closest("a");
        if (!a) return;
        const kind = a.getAttribute("data-kind");
        const href = a.getAttribute("href") || "";
        if (kind === "help") {
            e.preventDefault();
            setArticleId(href.replace(/^#help:/, ""));
        } else if (kind === "app") {
            e.preventDefault();
            setOpen(false);
            history.push(href);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => openHelp()}
                aria-label={t("Help")}
                title={t("Help")}
                className="help-trigger tw-flex tw-items-center tw-justify-center tw-h-10 tw-w-10 tw-border-0 tw-bg-transparent tw-rounded-md tw-text-text-secondary tw-cursor-pointer hover:tw-bg-white/5 hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
            >
                <Icon name="help-circle" size={20} />
            </button>
            <Drawer
                open={open}
                onClose={() => setOpen(false)}
                title={article ? article.title : t("Help")}
                width="md"
                footer={(
                    <div className="tw-flex tw-flex-wrap tw-justify-between tw-gap-4 tw-w-full">
                        <span className="tw-text-xs tw-text-text-muted">{t("{count} articles", { count: ARTICLES.length })}</span>
                        <a href={HELP_DESK_URL} target="_blank" rel="noopener noreferrer" className="help-hub__footer-link">
                            {t("Help desk & support")} <Icon name="external-link" size={14} />
                        </a>
                    </div>
                )}
            >
                <div ref={bodyRef} className="help-hub">
                    {article ? (
                        <>
                            <button type="button" className="help-hub__back" onClick={() => setArticleId(null)}>
                                <Icon name="chevron-left" size={16} /> {t("All help")}
                            </button>
                            {/* Rendered from our own escaped markdown (src/help/markdown.js) */}
                            <article className="help-article" onClick={onArticleClick} dangerouslySetInnerHTML={{ __html: html }} />
                        </>
                    ) : (
                        <>
                            <label className="help-hub__search">
                                <Icon name="search" size={16} />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t("Search help — e.g. bots, consent rate, Microsoft")}
                                    aria-label={t("Search help")}
                                />
                            </label>

                            {query.trim().length > 1 ? (
                                <section aria-label={t("Search results")}>
                                    {results.length ? (
                                        <ul className="help-hub__list">{results.map((a) => <ArticleRow key={a.id} article={a} onOpen={setArticleId} />)}</ul>
                                    ) : (
                                        <p className="help-hub__empty">
                                            {t("No article matches \"{query}\".", { query: query.trim() })}{" "}
                                            <a href={HELP_DESK_URL} target="_blank" rel="noopener noreferrer">{t("Ask the help desk")}</a>
                                        </p>
                                    )}
                                </section>
                            ) : (
                                <>
                                    {forThisPage.length > 0 && (
                                        <section aria-labelledby="help-this-page">
                                            <h3 id="help-this-page" className="help-hub__heading">{t("For this page")}</h3>
                                            <ul className="help-hub__list">{forThisPage.map((a) => <ArticleRow key={a.id} article={a} onOpen={setArticleId} />)}</ul>
                                        </section>
                                    )}
                                    {CATEGORIES.map((c) => {
                                        const items = ARTICLES.filter((a) => a.category === c.id);
                                        if (!items.length) return null;
                                        return (
                                            <section key={c.id} aria-labelledby={`help-cat-${c.id}`}>
                                                <h3 id={`help-cat-${c.id}`} className="help-hub__heading">{t(c.title)}</h3>
                                                <ul className="help-hub__list">{items.map((a) => <ArticleRow key={a.id} article={a} onOpen={setArticleId} />)}</ul>
                                            </section>
                                        );
                                    })}
                                </>
                            )}
                        </>
                    )}
                </div>
            </Drawer>
        </>
    );
}
