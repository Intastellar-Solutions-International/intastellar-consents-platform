const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;
import Authentication from "../../Authentication/Auth";
export default function SideNav(props) {
    const useLocation = window.ReactRouterDOM.useLocation;
    const location = useLocation();
    const { handle, id } = useParams();

    return <>
        <aside className="sidebar expand" aria-label={props?.title ? undefined : "Sidebar navigation"}>
            <nav className="collapsed expand" aria-label={props?.title || "Navigation"}>
                {
                    props?.title ? <h2 className="sidebar__heading">{props?.title}</h2> : null
                }
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
                                <Link className={itemClass} to={url}>
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