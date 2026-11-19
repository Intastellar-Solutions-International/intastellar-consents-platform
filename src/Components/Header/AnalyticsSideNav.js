import punycode from "punycode";
import AnalyticsSidebar from "./AnalyticsSidebar.js";
import { buildAnalyticsLinks, buildCmpLinks } from "./SideNavLinks/index.js";
import { DomainContext } from "../../App.js";
import { detectDashboardMode, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import { isNewShell, setNewShell } from "../../Functions/featureFlags.js";
import { getOrg } from "../../Functions/storage.js";
import Authentication from "../../Authentication/Auth";
import { Icon } from "../ui/icons.js";
import { OPEN_HELP_EVENT } from "../Help/index.js";
import { t } from "../../i18n/index.js";

const { useContext, useMemo } = React;
const useLocation = window.ReactRouterDOM.useLocation;

/**
 * One shell for both products: the grouped sidebar (AnalyticsSidebar.js),
 * with the Analytics menu on /analytics/… and — in the new shell — the CMP
 * menu everywhere else, replacing the old icon rail (ShellRail.js). The
 * classic layout keeps its own CMP navigation (Nav + per-page SideNav).
 *
 * History: renders on every analytics page, Overview included —
 * docs/design-audit-plan.md Phase 3 item 3.
 */
export default function AnalyticsSideNav() {
    const location = useLocation();
    const [globalDomain] = useContext(DomainContext);
    const mode = detectDashboardMode(location.pathname);
    const newShell = isNewShell();
    const platform = localStorage.getItem("platform") || "gdpr";

    const domainLabel = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return mode === "analytics" ? "Analytics" : "Consents";
        try {
            return punycode.toUnicode(String(globalDomain).trim());
        } catch {
            return String(globalDomain);
        }
    }, [globalDomain, mode]);

    const links = useMemo(
        () => (mode === "analytics"
            ? buildAnalyticsLinks(globalDomain)
            : buildCmpLinks(platform, globalDomain, Number(getOrg?.()?.id) === 1)),
        [mode, globalDomain, platform]
    );

    if (mode !== "analytics" && !newShell) return null;

    // What the old rail's footer offered, now in both products' sidebar.
    const footer = (
        <>
            <button type="button" className="ia-sidebar__footer-btn" onClick={() => window.dispatchEvent(new Event(OPEN_HELP_EVENT))}>
                <Icon name="help-circle" size={16} /> Help
            </button>
            {newShell && (
                <button type="button" className="ia-sidebar__footer-btn" title={t("Switch back to the previous layout")}
                    onClick={() => { setNewShell(false); window.location.reload(); }}>
                    <Icon name="refresh" size={16} /> {t("Classic layout")}
                </button>
            )}
            <button type="button" className="ia-sidebar__footer-btn" onClick={() => Authentication.Logout()}>
                <Icon name="external-link" size={16} /> {t("Log out")}
            </button>
        </>
    );

    return <AnalyticsSidebar links={links} title={domainLabel} footer={footer} />;
}
