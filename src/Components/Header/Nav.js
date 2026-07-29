import "./header.css";
import Authentication from "../../Authentication/Auth";
import { DomainContext } from "../../App.js";
import { dashboardPath, reportsPath, analyticsPath, analyticsMarketingPath, analyticsAudiencePath, analyticsAcquisitionPath, analyticsConsentPath, analyticsHeatmapPath, analyticsRecordingsPath, analyticsBotsPath, analyticsConversionsPath, analyticsAdSpendPath, analyticsGoogleAnalyticsPath, detectDashboardMode } from "../../Functions/domainPathSegments.js";
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
import marketing from "./icons/marketing.svg";
import audience from "./icons/audience.svg";
import acquisition from "./icons/acquisition.svg";
import consentIcon from "./icons/compliance.svg";
import heatmapIcon from "./icons/heatmap.svg";
import recordingsIcon from "./icons/recordings.svg";
import botsIcon from "./icons/bots.svg";
import conversionsIcon from "./icons/conversions.svg";
import adSpendIcon from "./icons/ad-spend.svg";
import googleAnalyticsIcon from "./icons/google-analytics.svg";
import { getOrg } from "../../Functions/storage.js";

export default function Nav() {
    const [currentDomain] = useContext(DomainContext);
    const location = useLocation();
    const platform = localStorage.getItem("platform") || "gdpr";
    const isAdminOrg = Number(getOrg?.()?.id) === 1;
    const path = location.pathname;
    const mode = detectDashboardMode(path);

    // ── Analytics mode: analytics + marketing links only ──────────────────
    if (mode === "analytics") {
        const overviewPath    = analyticsPath(currentDomain);
        const audiencePath    = analyticsAudiencePath(currentDomain);
        const acquisitionPath = analyticsAcquisitionPath(currentDomain);
        const consentPath     = analyticsConsentPath(currentDomain);
        const marketingPath   = analyticsMarketingPath(currentDomain);
        const heatmapPath     = analyticsHeatmapPath(currentDomain);
        const recordingsPath  = analyticsRecordingsPath(currentDomain);
        const botsPath        = analyticsBotsPath(currentDomain);
        const conversionsPath = analyticsConversionsPath(currentDomain);
        const adSpendPath     = analyticsAdSpendPath(currentDomain);
        const googleAnalyticsPath = analyticsGoogleAnalyticsPath(currentDomain);

        const sub = ["/audience", "/acquisition", "/consent", "/marketing", "/heatmap", "/recordings", "/bots", "/conversions", "/ad-spend", "/google-analytics"].find(s => path.includes(s));
        const overviewActive    = path.indexOf("/analytics") === 0 && !sub;
        const audienceActive    = sub === "/audience";
        const acquisitionActive = sub === "/acquisition";
        const consentActive     = sub === "/consent";
        const marketingActive   = sub === "/marketing";
        const heatmapActive     = sub === "/heatmap";
        const recordingsActive  = sub === "/recordings";
        const botsActive        = sub === "/bots";
        const conversionsActive = sub === "/conversions";
        const adSpendActive     = sub === "/ad-spend";
        const googleAnalyticsActive = sub === "/google-analytics";

        return (
            <>
                <div className="navOverlay">
                    <aside className="sidebar">
                        <nav className="collapsed">
                            <Link className={"navItems" + (overviewActive ? " --active" : "")} to={overviewPath}>
                                <i className="dashboard-icons analytics-overview" style={{ backgroundImage: `url(${analyticsOverview})` }} data-icon={analyticsOverview}></i>
                                <span className="hiddenCollapsed">Overview</span>
                            </Link>
                            <Link className={"navItems" + (audienceActive ? " --active" : "")} to={audiencePath}>
                                <i className="dashboard-icons audience" style={{ backgroundImage: `url(${audience})` }} data-icon={audience}></i>
                                <span className="hiddenCollapsed">Audience</span>
                            </Link>
                            <Link className={"navItems" + (acquisitionActive ? " --active" : "")} to={acquisitionPath}>
                                <i className="dashboard-icons acquisition" style={{ backgroundImage: `url(${acquisition})` }} data-icon={acquisition}></i>
                                <span className="hiddenCollapsed">Acquisition</span>
                            </Link>
                            <Link className={"navItems" + (consentActive ? " --active" : "")} to={consentPath}>
                                <i className="dashboard-icons consent-nav" style={{ backgroundImage: `url(${consentIcon})` }} data-icon={consentIcon}></i>
                                <span className="hiddenCollapsed">Consent</span>
                            </Link>
                            <Link className={"navItems" + (heatmapActive ? " --active" : "")} to={heatmapPath}>
                                <i className="dashboard-icons heatmap" style={{ backgroundImage: `url(${heatmapIcon})` }} data-icon={heatmapIcon}></i>
                                <span className="hiddenCollapsed">Heatmap</span>
                            </Link>
                            <Link className={"navItems" + (recordingsActive ? " --active" : "")} to={recordingsPath}>
                                <i className="dashboard-icons recordings" style={{ backgroundImage: `url(${recordingsIcon})` }} data-icon={recordingsIcon}></i>
                                <span className="hiddenCollapsed">Recordings</span>
                            </Link>
                            <Link className={"navItems" + (botsActive ? " --active" : "")} to={botsPath}>
                                <i className="dashboard-icons bots" style={{ backgroundImage: `url(${botsIcon})` }} data-icon={botsIcon}></i>
                                <span className="hiddenCollapsed">Bots</span>
                            </Link>
                            <Link className={"navItems" + (conversionsActive ? " --active" : "")} to={conversionsPath}>
                                <i className="dashboard-icons conversions" style={{ backgroundImage: `url(${conversionsIcon})` }} data-icon={conversionsIcon}></i>
                                <span className="hiddenCollapsed">Conversions</span>
                            </Link>
                            <Link className={"navItems" + (marketingActive ? " --active" : "")} to={marketingPath}>
                                <i className="dashboard-icons marketing" style={{ backgroundImage: `url(${marketing})` }} data-icon={marketing}></i>
                                <span className="hiddenCollapsed">Marketing</span>
                            </Link>
                            <Link className={"navItems" + (adSpendActive ? " --active" : "")} to={adSpendPath}>
                                <i className="dashboard-icons ad-spend" style={{ backgroundImage: `url(${adSpendIcon})` }} data-icon={adSpendIcon}></i>
                                <span className="hiddenCollapsed">Ad Spend</span>
                            </Link>
                            <Link className={"navItems" + (googleAnalyticsActive ? " --active" : "")} to={googleAnalyticsPath}>
                                <i className="dashboard-icons google-analytics" style={{ backgroundImage: `url(${googleAnalyticsIcon})` }} data-icon={googleAnalyticsIcon}></i>
                                <span className="hiddenCollapsed">Google Analytics</span>
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