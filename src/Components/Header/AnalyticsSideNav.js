import punycode from "punycode";
import AnalyticsSidebar from "./AnalyticsSidebar.js";
import { buildAnalyticsLinks } from "./SideNavLinks/index.js";
import { DomainContext } from "../../App.js";
import { detectDashboardMode, isAnalyticsOverviewPath, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";

const { useContext, useMemo } = React;
const useLocation = window.ReactRouterDOM.useLocation;

// Renders the grouped analytics sidebar (AnalyticsSidebar.js) while inside
// a sub-report of the analytics section. Still skips the Overview page for
// now — docs/design-audit-plan.md Phase 3 item 2 only fixes *this*
// sidebar's position:fixed-vs-push bug (now position:sticky, see
// AnalyticsSidebar.js and its CSS in header.css); making Overview show the
// same unified sidebar (removing the icon rail and the Overview-only tab
// strip at the same time, since leaving either in place alongside this
// sidebar would be a visibly broken intermediate state) is item 3.
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

    return <AnalyticsSidebar links={links} title={domainLabel} />;
}
