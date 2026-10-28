import punycode from "punycode";
import AnalyticsSidebar from "./AnalyticsSidebar.js";
import { buildAnalyticsLinks } from "./SideNavLinks/index.js";
import { DomainContext } from "../../App.js";
import { detectDashboardMode, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";

const { useContext, useMemo } = React;
const useLocation = window.ReactRouterDOM.useLocation;

// Renders the grouped analytics sidebar (AnalyticsSidebar.js) on every page
// in the analytics section, Overview included — docs/design-audit-plan.md
// Phase 3 item 3. Previously skipped Overview (mirroring Google Analytics'
// own snapshot-page convention), which relied on the icon rail + an
// Overview-only tab strip instead; both are gone now (Nav.js, index.js),
// so Overview would otherwise have no labeled navigation at all.
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

    return <AnalyticsSidebar links={links} title={domainLabel} />;
}
