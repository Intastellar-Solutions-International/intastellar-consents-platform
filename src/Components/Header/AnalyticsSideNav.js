import punycode from "punycode";
import SideNav from "./SideNav.js";
import { buildAnalyticsLinks } from "./SideNavLinks/index.js";
import { DomainContext } from "../../App.js";
import { detectDashboardMode, isAnalyticsOverviewPath, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";

const { useContext, useMemo } = React;
const useLocation = window.ReactRouterDOM.useLocation;

// Renders the grouped GA-style analytics sidebar only while inside a
// sub-report of the analytics section — the overview/"Reports snapshot"
// page itself stays full-width, same as GA's own snapshot page. Mounted
// once in App.js next to <Nav/> — its fixed positioning (see .sidebar in
// header.css) falls back to normal-flow static position, so DOM order
// right after <Nav/> is what places it beside the icon rail rather than
// overlapping it.
export default function AnalyticsSideNav() {
    const location = useLocation();
    const [globalDomain] = useContext(DomainContext);

    const domainLabel = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return "Analytics";
        try {
            return punycode.toUnicode(String(globalDomain).trim());
        } catch {
            return String(globalDomain);
        }
    }, [globalDomain]);

    const links = useMemo(() => buildAnalyticsLinks(globalDomain), [globalDomain]);

    if (detectDashboardMode(location.pathname) !== "analytics") return null;
    if (isAnalyticsOverviewPath(location.pathname)) return null;

    return <SideNav links={links} title={domainLabel} />;
}
