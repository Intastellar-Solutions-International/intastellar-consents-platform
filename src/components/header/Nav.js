import "./header.css";
import Authentication from "../../Authentication/Auth";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;

import home from "./icons/home.svg";
import reports from "./icons/reports.svg";
/* import compare from "./icons/compare.svg"; */
import domains from "./icons/domain.svg";
import expand from "./icons/expand.svg";
import cookies from "./icons/cookies.svg";
import settings from "./icons/settings.svg";
import logout from "./icons/logout.svg";
import dashboard from "./icons/dashboard.svg";
import experiments from "./icons/domain.svg";

export default function Nav() {

    return (
        <>
            <div className="navOverlay">
                <aside className="sidebar">
                    <nav className="collapsed">
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/dashboard") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/dashboard"}><i className="dashboard-icons home" style={{
                            backgroundImage: `url(${home})`
                        }} data-icon={home}></i> <span className="hiddenCollapsed">Home</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/reports") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/reports"}><i className="dashboard-icons reports" style={{
                            backgroundImage: `url(${reports})`
                        }} data-icon={reports}></i> <span className="hiddenCollapsed">Reports</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/compare") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/compare"}><i className="dashboard-icons compare" style={{
                            backgroundImage: `url(${dashboard})`
                        }} data-icon={dashboard}></i> <span className="hiddenCollapsed">Portfolio Benchmark</span></Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/experiments") > -1 ? " --active" : "")} to={"/experiments"}>
                            <i className="dashboard-icons experiments" style={{
                                backgroundImage: `url(${experiments})`
                            }} data-icon={experiments}></i> <span className="hiddenCollapsed">A/B Testing</span>
                        </Link>
                        <Link className={"navItems" + (useLocation().pathname.indexOf("/cookies") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/cookies"}><i className="dashboard-icons cookies" style={{
                            backgroundImage: `url(${cookies})`
                        }} data-icon={cookies}></i> <span className="hiddenCollapsed">Cookies</span></Link>
                        <section className="navItems--bottom">
                            <Link className={"navItems" + (useLocation().pathname.indexOf("/settings") > -1 ? " --active" : "")} to={"/settings"}><i className="dashboard-icons settings" style={{
                                backgroundImage: `url(${settings})`
                            }} data-icon={settings}></i> <span className="hiddenCollapsed">Settings</span></Link>
                            <button className="navLogout" onClick={() => Authentication.Logout()}><i className="dashboard-icons logout" style={{
                                backgroundImage: `url(${logout})`
                            }}></i> <span className="hiddenCollapsed" data-icon={logout}>Logout</span></button>
                        </section>
                    </nav>
                </aside>
                {/* {(useLocation().pathname === "/reports") ? <>
                    
                </> : null} */}
            </div>
        </>
    )
}