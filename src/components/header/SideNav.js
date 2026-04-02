const { useState, useEffect } = React;
const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;
import Authentication from "../../Authentication/Auth";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";

export default function SideNav(props) {
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

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 769px)");
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
            className="sidebar-mobile-toggle"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar-nav"
            onClick={() => setMobileOpen((o) => !o)}
        >
            <span className="sidebar-mobile-toggle__bars" aria-hidden>
                <span className="sidebar-mobile-toggle__bar" />
                <span className="sidebar-mobile-toggle__bar" />
                <span className="sidebar-mobile-toggle__bar" />
            </span>
            <span className="sidebar-mobile-toggle__label">Menu</span>
        </button>

        <div
            className={"sidebar-backdrop" + (mobileOpen ? " sidebar-backdrop--visible" : "")}
            onClick={closeMobile}
            aria-hidden={!mobileOpen}
        />

        <aside
            id="app-sidebar-nav"
            className={"sidebar expand" + (mobileOpen ? " sidebar--open" : "")}
            aria-label={props?.title ? undefined : "Sidebar navigation"}
        >
            <nav className="collapsed expand" aria-label={props?.title || "Navigation"}>
                <div className="sidebar__top">
                    {props?.title ? <h2 className="sidebar__heading">{props?.title}</h2> : null}
                    <button
                        type="button"
                        className="sidebar-mobile-close"
                        onClick={closeMobile}
                        aria-label="Close menu"
                    >
                        ×
                    </button>
                </div>
                <ul className="sidebar__list">
                {
                    props?.links?.map((link, key) => {
                        if (link?.view?.length && link.view.indexOf(Authentication.User.Status) === -1) {
                            return null;
                        }

                        const url = link.path.indexOf("reports") !== -1
                            ? "/" + id + link?.path
                            : link?.path;

                        const isActive = location?.pathname === url;
                        const itemClass = "navItems sidebar__link" + (isActive ? " --active" : "");

                        return (
                            <li key={key} className="sidebar__item">
                                <Link className={itemClass} to={url} onClick={closeMobile}>
                                    {link?.icon ? <i className={"dashboard-icons " + link?.icon} aria-hidden="true"></i> : null}{" "}
                                    <span className="hiddenCollapsed">{link?.name}</span>
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