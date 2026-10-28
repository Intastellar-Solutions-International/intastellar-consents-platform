const { useState, useEffect } = React;
const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;
import Authentication from "../../Authentication/Auth";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";
import { canAccess } from "../../Functions/tier.js";

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

    const closeMobile = () => setMobileOpen(false);

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
            <span className="ia-sidebar-toggle__label">Menu</span>
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
            <nav className="ia-sidebar__nav" aria-label={props?.title || "Analytics navigation"}>
                <div className="ia-sidebar__top">
                    {props?.title ? <h2 className="ia-sidebar__heading">{props?.title}</h2> : null}
                    <button
                        type="button"
                        className="ia-sidebar__close"
                        onClick={closeMobile}
                        aria-label="Close menu"
                    >
                        ×
                    </button>
                </div>
                <ul className="ia-sidebar__list">
                {
                    props?.links?.map((link, key) => {
                        if (link.divider) {
                            if (link.requiresTier && !canAccess(link.requiresTier)) return null;
                            return (
                                <li key={key} className="ia-sidebar__group-label" aria-hidden="true">
                                    <span className="ia-sidebar__group-label-text">{link.label}</span>
                                </li>
                            );
                        }

                        if (
                            link?.view?.length &&
                            link.view.indexOf(Authentication.getCurrentOrganisationRole()) === -1
                        ) {
                            return null;
                        }

                        if (link.requiresTier && !canAccess(link.requiresTier)) {
                            return null;
                        }

                        if (link.external) {
                            return (
                                <li key={key} className="ia-sidebar__item">
                                    <a
                                        className="ia-sidebar__link"
                                        href={link.path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={closeMobile}
                                    >
                                        <span className="ia-sidebar__link-label">{link?.name} ↗</span>
                                    </a>
                                </li>
                            );
                        }

                        const url = (() => {
                            if (link.path.indexOf("/analytics") === 0) {
                                if (!handle) return link.path;
                                return link.path.replace(/^\/analytics/, `/analytics/${handle}`);
                            }
                            if (link.path.indexOf("reports") === -1) {
                                return link.path;
                            }
                            let p = link.path;
                            if (handle) {
                                p = p.replace(/^\/reports/, `/reports/view/${handle}`);
                            }
                            return "/" + id + p;
                        })();

                        const isActive = location?.pathname === url;
                        const itemClass = "ia-sidebar__link"
                            + (isActive ? " --active" : "")
                            + (link.indent ? " ia-sidebar__link--indent" : "");

                        return (
                            <li key={key} className="ia-sidebar__item">
                                <Link className={itemClass} to={url} onClick={closeMobile}>
                                    {link?.logoSrc
                                        ? <img src={link.logoSrc} alt="" aria-hidden="true" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0, verticalAlign: "middle" }} />
                                        : link?.icon
                                            ? <i className={"dashboard-icons " + link?.icon} aria-hidden="true"></i>
                                            : null}{" "}
                                    <span className="ia-sidebar__link-label">{link?.name}</span>
                                </Link>
                            </li>
                        );
                    })
                }
                </ul>
            </nav>
        </aside>
    </>
}
