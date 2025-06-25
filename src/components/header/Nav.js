import "./header.css";
import Authentication from "../../Authentication/Auth";
import SideNav from "./SideNav";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;

export default function Nav() {

    const Expand = function () {
        document.querySelector(".sidebar").classList.toggle("expand");
        document.querySelector(".collapsed").classList.toggle("expand");
    };

    return (
        <>
            <div className="navOverlay">
                <aside className="sidebar">
                    <nav className="collapsed">
                        <button className="expandBtn" onClick={() => Expand()}></button>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/dashboard") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/dashboard"}><i className="dashboard-icons home"></i> <span className="hiddenCollapsed">Home</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/reports") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/reports"}><i className="dashboard-icons reports"></i> <span className="hiddenCollapsed">Reports</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/compare") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/compare"}><i className="dashboard-icons compare"></i> <span className="hiddenCollapsed">Compare</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/domains") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/domains"}><i className="dashboard-icons domains"></i> <span className="hiddenCollapsed">Domains</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/cookies") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/cookies"}><i className="dashboard-icons cookies"></i> <span className="hiddenCollapsed">Cookies</span></Link>
                        <section className="navItems--bottom">
                            <Link className={"navItems" + (useLocation().pathname.indexOf("/settings") > -1 ? " --active" : "")} to={"/settings"}><i className="dashboard-icons settings"></i> <span className="hiddenCollapsed">Settings</span></Link>
                            <button className="navLogout" onClick={() => Authentication.Logout()}><i className="dashboard-icons logout"></i> <span className="hiddenCollapsed">Logout</span></button>
                        </section>
                    </nav>
                </aside>
                {/* {(useLocation().pathname === "/reports") ? <>
                    
                </> : null} */}
            </div>
        </>
    )
}