import "./header.css";
import Authentication from "../../Authentication/Auth";
import { DomainContext } from "../../App.js";
import { dashboardPath, reportsPath, analyticsPath, analyticsAudiencePath, analyticsAcquisitionPath, analyticsHeatmapPath, analyticsConversionsPath, detectDashboardMode, analyticsRailSection } from "../../Functions/domainPathSegments.js";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const useContext = React.useContext;

import home from "./icons/home.svg";
import reports from "./icons/reports.svg";
/* import compare from "./icons/compare.svg"; */
import domains from "./icons/domain.svg";
import expand from "./icons/expand.svg";
import settings from "./icons/settings.svg";
import logout from "./icons/Logout.svg";
import experiments from "./icons/experiment.svg";
import benchmark from "./icons/benchmark.svg";
import compliance from "./icons/compliance.svg";
import cookies from "./icons/cookies.svg";
import analyticsOverview from "./icons/analytics-overview.svg";
import audience from "./icons/audience.svg";
import acquisition from "./icons/acquisition.svg";
import heatmapIcon from "./icons/heatmap.svg";
import conversionsIcon from "./icons/conversions.svg";
import { getOrg } from "../../Functions/storage.js";

export default function Nav() {
    const [currentDomain] = useContext(DomainContext);
    const location = useLocation();
    const platform = localStorage.getItem("platform") || "gdpr";
    const isAdminOrg = Number(getOrg?.()?.id) === 1;
    const path = location.pathname;
    const mode = detectDashboardMode(path);

    // ── Analytics mode: one entry point per section — Overview is a
    // standalone landing page (no secondary sidebar); the other four jump
    // into their group's first report and reveal the grouped AnalyticsSideNav
    // (mounted alongside this rail, see App.js), which lists the rest of
    // that group's pages. Groups mirror the dividers in SideNavLinks'
    // analyticsLinks — see analyticsRailSection(). ──
    if (mode === "analytics") {
        const overviewPath    = analyticsPath(currentDomain);
        const audiencePath    = analyticsAudiencePath(currentDomain);
        const acquisitionPath = analyticsAcquisitionPath(currentDomain);
        const behaviorPath    = analyticsHeatmapPath(currentDomain);
        const conversionsPath = analyticsConversionsPath(currentDomain);

        const section = analyticsRailSection(path);

        return (
            <>
                <div className="navOverlay">
                    <aside className="sidebar">
                        <nav className="collapsed">
                            <Link className={"navItems" + (section === "overview" ? " --active" : "")} to={overviewPath}>
                                <i className="dashboard-icons analytics-overview" style={{ backgroundImage: `url(${analyticsOverview})` }} data-icon={analyticsOverview}></i>
                                <span className="hiddenCollapsed">Overview</span>
                            </Link>
                            <Link className={"navItems" + (section === "audience" ? " --active" : "")} to={audiencePath}>
                                <i className="dashboard-icons audience" style={{ backgroundImage: `url(${audience})` }} data-icon={audience}></i>
                                <span className="hiddenCollapsed">Audience</span>
                            </Link>
                            <Link className={"navItems" + (section === "acquisition" ? " --active" : "")} to={acquisitionPath}>
                                <i className="dashboard-icons acquisition" style={{ backgroundImage: `url(${acquisition})` }} data-icon={acquisition}></i>
                                <span className="hiddenCollapsed">Acquisition</span>
                            </Link>
                            <Link className={"navItems" + (section === "behavior" ? " --active" : "")} to={behaviorPath}>
                                <i className="dashboard-icons heatmap" style={{ backgroundImage: `url(${heatmapIcon})` }} data-icon={heatmapIcon}></i>
                                <span className="hiddenCollapsed">Behavior</span>
                            </Link>
                            <Link className={"navItems" + (section === "conversions" ? " --active" : "")} to={conversionsPath}>
                                <i className="dashboard-icons conversions" style={{ backgroundImage: `url(${conversionsIcon})` }} data-icon={conversionsIcon}></i>
                                <span className="hiddenCollapsed">Conversions</span>
                            </Link>
                            <section className="navItems--bottom">
                                <Link className={"navItems" + (path.indexOf("/settings") > -1 ? " --active" : "")} to={"/settings"}>
                                    <i className="dashboard-icons settings" style={{ backgroundImage: `url(${settings})` }} data-icon={settings}></i>
                                    <span className="hiddenCollapsed">Settings</span>
                                </Link>
                                <button className="navLogout" onClick={() => Authentication.Logout()}>
                                    <i className="dashboard-icons logout" style={{ backgroundImage: `url(${logout})` }}></i>
                                    <span className="hiddenCollapsed" data-icon={logout}>Logout</span>
                                </button>
                            </section>
                        </nav>
                    </aside>
                </div>
            </>
        )
    }

    // ── CMP mode: original consent-management navigation ──────────────────
    const homePath = dashboardPath(platform, currentDomain);
    const reportsPathResolved = reportsPath(platform, currentDomain, "");
    const compliancePath = reportsPath(platform, currentDomain, "/compliance");
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
                        <Link className={"navItems" + (path.indexOf("/compliance") > -1 ? " --active" : "")} to={compliancePath}><i className="dashboard-icons compliance" style={{
                            backgroundImage: `url(${compliance})`
                        }} data-icon={compliance}></i> <span className="hiddenCollapsed">Compliance</span></Link>
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
                        <section className="navItems--bottom">
                            {isAdminOrg && (
                                <Link className={"navItems" + (path === "/cookie-database" ? " --active" : "")} to="/cookie-database">
                                    <i className="dashboard-icons cookies" style={{ backgroundImage: `url(${cookies})` }} data-icon={cookies}></i>
                                    <span className="hiddenCollapsed">Cookie DB</span>
                                </Link>
                            )}
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