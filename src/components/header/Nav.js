import "./header.css";
import Authentication from "../../Authentication/Auth";
import { DomainContext } from "../../App.js";
import { dashboardPath, reportsPath } from "../../Functions/domainPathSegments.js";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const useContext = React.useContext;

import home from "./icons/home.svg";
import reports from "./icons/reports.svg";
/* import compare from "./icons/compare.svg"; */
import domains from "./icons/domain.svg";
import expand from "./icons/expand.svg";
import settings from "./icons/settings.svg";
import logout from "./icons/logout.svg";
import dashboard from "./icons/dashboard.svg";
import experiments from "./icons/experiment.svg";
import benchmark from "./icons/benchmark.svg";
import compliance from "./icons/compliance.svg";

export default function Nav() {
    const [currentDomain] = useContext(DomainContext);
    const location = useLocation();
    const platform = localStorage.getItem("platform") || "gdpr";
    const homePath = dashboardPath(platform, currentDomain);
    const reportsPathResolved = reportsPath(platform, currentDomain, "");
    const compliancePath = reportsPath(platform, currentDomain, "/compliance");
    const path = location.pathname;
    // Dashboard: /:id/dashboard or /:id/view/:handle — not /:id/reports/view/... (that also contains "/view/")
    const homeActive =
        /\/[^/]+\/dashboard(\/|$|\?)/.test(path) || /^\/[^/]+\/view\//.test(path);

    return (
        <>
            <div className="navOverlay">
                <aside className="sidebar">
                    <nav className="collapsed">
                        <Link className={"navItems" + (homeActive ? " --active" : "")} to={homePath}><i className="dashboard-icons home" style={{
                            backgroundImage: `url(${home})`
                        }} data-icon={home}></i> <span className="hiddenCollapsed">Home</span></Link>
                        <Link className={"navItems" + (path.indexOf("/reports") > -1 && path.indexOf("/compliance") === -1 ? " --active" : "")} to={reportsPathResolved}><i className="dashboard-icons reports" style={{
                            backgroundImage: `url(${reports})`
                        }} data-icon={reports}></i> <span className="hiddenCollapsed">Reports</span></Link>
                        <Link className={"navItems" + (path.indexOf("/compare") > -1 ? " --active" : "")} to={"/" + localStorage.getItem("platform") + "/compare"}><i className="dashboard-icons compare" style={{
                            backgroundImage: `url(${benchmark})`
                        }} data-icon={benchmark}></i> <span className="hiddenCollapsed">Portfolio Benchmark</span></Link>
                        <Link className={"navItems" + (path.indexOf("/experiments") > -1 ? " --active" : "")} to={"/experiments"}>
                            <i className="dashboard-icons experiments" style={{
                                backgroundImage: `url(${experiments})`
                            }} data-icon={experiments}></i> <span className="hiddenCollapsed">A/B Testing</span>
                        </Link>
                        <Link className={"navItems" + (path.indexOf("/compliance") > -1 ? " --active" : "")} to={compliancePath}><i className="dashboard-icons compliance" style={{
                            backgroundImage: `url(${compliance})`
                        }} data-icon={compliance}></i> <span className="hiddenCollapsed">Compliance</span></Link>
                        <section className="navItems--bottom">
                            <Link className={"navItems" + (path.indexOf("/settings") > -1 ? " --active" : "")} to={"/settings"}><i className="dashboard-icons settings" style={{
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