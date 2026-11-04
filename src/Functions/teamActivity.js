import { ScannerHost } from "../API/host.js";
import Authentication from "../Authentication/Auth";
import { DomainContext } from "../App.js";
import { sectionForPath } from "./teamSections.js";
import { canAccess, FEATURE_TIERS } from "./tier.js";
import appStorage from "./storage.js";

const { useContext, useEffect } = React;
const useLocation = window.ReactRouterDOM.useLocation;

export const TEAM_ACTIVITY_URL = `${ScannerHost}/api/team-activity`;

// Same section + domain again within this window isn't re-sent (the server
// applies the same rule; this just saves the requests).
const RESEND_AFTER_MS = 10 * 60 * 1000;
const sentAt = new Map();

function memberName() {
    try {
        const name = JSON.parse(appStorage.getItem("globals"))?.profile?.name;
        return [name?.first_name, name?.last_name].filter(Boolean).join(" ") || undefined;
    } catch { return undefined; }
}

/**
 * Records which section (and domain) the signed-in member opens, for Team
 * insights. Renders nothing. Mounted once inside the router and the
 * DomainContext provider; waits a moment after navigation so the domain
 * picker has settled on the page's domain. Nothing is recorded for
 * organisations whose plan doesn't include Team insights.
 */
export default function TeamActivityTracker() {
    const { pathname } = useLocation();
    const [currentDomain] = useContext(DomainContext);

    useEffect(() => {
        const section = sectionForPath(pathname);
        const token = Authentication.getToken();
        const organisation = Authentication.getOrganisation();
        if (!section || !token || !organisation || !canAccess(FEATURE_TIERS.team_insights)) return undefined;
        const domain = currentDomain && currentDomain !== "combined view" ? currentDomain : null;

        const timer = setTimeout(() => {
            const key = `${organisation}|${section}|${domain}`;
            if (Date.now() - (sentAt.get(key) || 0) < RESEND_AFTER_MS) return;
            sentAt.set(key, Date.now());
            fetch(TEAM_ACTIVITY_URL, {
                method: "POST",
                keepalive: true,
                headers: { Authorization: token, Organisation: String(organisation), "Content-Type": "application/json" },
                body: JSON.stringify({ section, path: pathname, domain, name: memberName(), email: Authentication.getUserId() }),
            }).catch(() => { /* insights are best-effort */ });
        }, 1500);
        return () => clearTimeout(timer);
    }, [pathname, currentDomain]);

    return null;
}
