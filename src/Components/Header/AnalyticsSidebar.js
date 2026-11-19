const { useState, useEffect } = React;
const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;
import Authentication from "../../Authentication/Auth";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";
import { canAccess } from "../../Functions/tier.js";
import { t } from "../../i18n/index.js";

/**
 * docs/design-audit-plan.md Phase 3 item 2 — the root structural fix for
 * "sidebar overlays instead of pushing content" (Phase 0's finding: the
 * generic SideNav.js's `.collapsed` class is unconditionally
 * `position: fixed`, so it never actually reserves layout space; it only
 * *looks* like it pushes content by coincidence of its default static
 * render position matching its sibling's reserved width).
 *
 * This is a NEW, Analytics-only component rather than a fix to
 * SideNav.js itself — that component is shared app-wide (Settings, DSR,
 * Countries, UserConsents pages all use it too, confirmed by grep before
 * writing this), so changing its positioning model would risk every one
 * of those unrelated pages. The Analytics section's nav has also grown
 * different enough (unified groups, its own responsive behavior) that it
 * no longer fits cleanly as "just another SideNav.js consumer."
 *
 * The actual fix: `position: sticky` on the nav instead of `fixed`.
 * Sticky keeps the same "stays in view while the page scrolls" feel the
 * old fixed positioning had, but — unlike fixed — a sticky element is
 * never removed from normal document flow, so it genuinely contributes
 * its width to the flex row it's in and actually pushes its siblings.
 */
// Link URLs encode the domain's dots as "%2E" (encodeDomainPathSegment), but
// React Router's history decodeURI()s location.pathname, so the two never
// matched as raw strings and no menu item ever showed as active. Compare
// decoded, case-insensitive, without a trailing slash.
function normalizePath(path) {
    let p = String(path || "");
    try { p = decodeURIComponent(p); } catch { /* keep as-is if malformed */ }
    return p.replace(/\/+$/, "").toLowerCase() || "/";
}

// Which groups the viewer opened/closed by hand — a per-browser convenience,
// so storage failures (private mode, blocked site data) just fall back to
// the default of "only the current page's group is open".
const OPEN_GROUPS_KEY = "ia_analytics_nav_groups";
function readGroupOverrides() {
    try { return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY)) || {}; } catch { return {}; }
}
function writeGroupOverrides(v) {
    try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

export default function AnalyticsSidebar(props) {
    const useLocation = window.ReactRouterDOM.useLocation;
    const location = useLocation();
    const { handle, id } = useParams();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileOpen) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") setMobileOpen(false);
        };
        window.addEventListener("keydown", onKey);
        lockBodyScroll();
        return () => {
            window.removeEventListener("keydown", onKey);
            unlockBodyScroll();
        };
    }, [mobileOpen]);

    // Responsive collapse below 1024px, per the design brief — SideNav.js's
    // own mobile drawer (the pattern this borrows) switches at 769px;
    // moved here to the brief's actual requested breakpoint.
    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1024px)");
        const onChange = () => {
            if (mq.matches) setMobileOpen(false);
        };
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    // The header's menu button (new shell) opens the drawer on small screens.
    useEffect(() => {
        const toggle = () => {
            if (!window.matchMedia("(min-width: 1024px)").matches) setMobileOpen((o) => !o);
        };
        window.addEventListener("shell:toggle-rail", toggle);
        return () => window.removeEventListener("shell:toggle-rail", toggle);
    }, []);

    const closeMobile = () => setMobileOpen(false);

    // Resolve each link once: hidden (role/tier) → null, otherwise its URL
    // and whether it's the current page.
    const resolveLink = (link) => {
        if (link?.view?.length && link.view.indexOf(Authentication.getCurrentOrganisationRole()) === -1) return null;
        if (link.requiresTier && !canAccess(link.requiresTier)) return null;
        if (link.external) return { link, url: link.path, isActive: false };
        const url = (() => {
            if (link.path.indexOf("/analytics") === 0) {
                if (!handle) return link.path;
                return link.path.replace(/^\/analytics/, `/analytics/${handle}`);
            }
            // Only the legacy relative form "/reports/…" gets the /:id
            // prefix — fully resolved paths (CMP links, "/gdpr/reports/…")
            // pass through untouched.
            if (link.path.indexOf("/reports") !== 0) {
                return link.path;
            }
            let p = link.path;
            if (handle) {
                p = p.replace(/^\/reports/, `/reports/view/${handle}`);
            }
            return "/" + id + p;
        })();
        // `match` lets a link stay active on its sub-pages (CMP: Settings on /settings/…).
        const isActive = typeof link.match === "function"
            ? link.match(location?.pathname || "")
            : normalizePath(location?.pathname) === normalizePath(url);
        return { link, url, isActive };
    };

    // Flat link list (dividers mark group starts) → top-level items + groups.
    // Groups the viewer can't see anything in are dropped entirely. Not
    // memoized: tier/role can resolve after first render, and it's ~30 items.
    const { topItems, groups } = (() => {
        const top = [];
        const grouped = [];
        let current = null;
        for (const link of props?.links || []) {
            if (link.divider) {
                if (link.requiresTier && !canAccess(link.requiresTier)) { current = { hidden: true, items: [] }; continue; }
                current = { label: link.label, items: [] };
                grouped.push(current);
                continue;
            }
            if (current?.hidden) continue;
            const r = resolveLink(link);
            if (!r) continue;
            (current ? current.items : top).push(r);
        }
        return { topItems: top, groups: grouped.filter(g => g.items.length) };
    })();

    // Collapsed by default so a first visit sees ~8 lines, not ~30 links;
    // the group holding the current page opens itself. Explicit
    // open/close by the viewer wins and is remembered.
    const [groupOverrides, setGroupOverrides] = useState(readGroupOverrides);
    const toggleGroup = (label, isOpen) => {
        setGroupOverrides(prev => {
            const next = { ...prev, [label]: !isOpen };
            writeGroupOverrides(next);
            return next;
        });
    };
    // Navigating into a group that was closed by hand reopens it.
    useEffect(() => {
        const activeGroup = groups.find(g => g.items.some(i => i.isActive));
        if (activeGroup && groupOverrides[activeGroup.label] === false) {
            setGroupOverrides(prev => {
                const next = { ...prev };
                delete next[activeGroup.label];
                writeGroupOverrides(next);
                return next;
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location?.pathname]);

    const renderItem = ({ link, url, isActive }, key) => {
        if (link.external) {
            return (
                <li key={key} className="ia-sidebar__item">
                    <a className="ia-sidebar__link" href={link.path} target="_blank" rel="noopener noreferrer" onClick={closeMobile}>
                        <span className="ia-sidebar__link-label">{t(link?.name)} ↗</span>
                    </a>
                </li>
            );
        }
        const itemClass = "ia-sidebar__link"
            + (isActive ? " --active" : "")
            + (link.indent ? " ia-sidebar__link--indent" : "");
        return (
            <li key={key} className="ia-sidebar__item">
                <Link className={itemClass} to={url} onClick={closeMobile} aria-current={isActive ? "page" : undefined}>
                    {link?.logoSrc
                        ? <img src={link.logoSrc} alt="" aria-hidden="true" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0, verticalAlign: "middle" }} />
                        : link?.icon
                            ? <i className={"dashboard-icons " + link?.icon} aria-hidden="true"></i>
                            : null}{" "}
                    <span className="ia-sidebar__link-label">{t(link?.name)}</span>
                </Link>
            </li>
        );
    };

    return <>
        <button
            type="button"
            className="ia-sidebar-toggle"
            aria-expanded={mobileOpen}
            aria-controls="ia-analytics-sidebar"
            onClick={() => setMobileOpen((o) => !o)}
        >
            <span className="ia-sidebar-toggle__bars" aria-hidden>
                <span className="ia-sidebar-toggle__bar" />
                <span className="ia-sidebar-toggle__bar" />
                <span className="ia-sidebar-toggle__bar" />
            </span>
            <span className="ia-sidebar-toggle__label">{t("Menu")}</span>
        </button>

        <div
            className={"ia-sidebar-backdrop" + (mobileOpen ? " ia-sidebar-backdrop--visible" : "")}
            onClick={closeMobile}
            aria-hidden={!mobileOpen}
        />

        <aside
            id="ia-analytics-sidebar"
            className={"ia-sidebar" + (mobileOpen ? " ia-sidebar--open" : "")}
        >
            <nav className="ia-sidebar__nav" aria-label={props?.title ? t(props.title) : t("Analytics navigation")}>
                <div className="ia-sidebar__top">
                    {props?.title ? <h2 className="ia-sidebar__heading">{props?.title}</h2> : null}
                    <button
                        type="button"
                        className="ia-sidebar__close"
                        onClick={closeMobile}
                        aria-label={t("Close menu")}
                    >
                        ×
                    </button>
                </div>
                <ul className="ia-sidebar__list">
                    {topItems.map((item, i) => renderItem(item, "top-" + i))}
                    {groups.map((group, gi) => {
                        const hasActive = group.items.some(i => i.isActive);
                        const isOpen = groupOverrides[group.label] ?? hasActive;
                        const listId = `ia-sidebar-group-${gi}`;
                        return (
                            <li key={group.label} className={"ia-sidebar__group" + (isOpen ? " ia-sidebar__group--open" : "")}>
                                <button
                                    type="button"
                                    className={"ia-sidebar__group-toggle" + (hasActive ? " ia-sidebar__group-toggle--has-active" : "")}
                                    aria-expanded={isOpen}
                                    aria-controls={listId}
                                    onClick={() => toggleGroup(group.label, isOpen)}
                                >
                                    <span className="ia-sidebar__group-toggle-label">{t(group.label)}</span>
                                    {!isOpen && <span className="ia-sidebar__group-count">{group.items.length}</span>}
                                    <svg className="ia-sidebar__group-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                <ul id={listId} className="ia-sidebar__sublist" hidden={!isOpen}>
                                    {group.items.map((item, i) => renderItem(item, group.label + "-" + i))}
                                </ul>
                            </li>
                        );
                    })}
                </ul>
                {props?.footer ? <div className="ia-sidebar__footer">{props.footer}</div> : null}
            </nav>
        </aside>
    </>
}
