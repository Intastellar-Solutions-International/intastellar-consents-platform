import { WorkspaceContext } from "../App.js";
import Authentication from "../Authentication/Auth";
import { ScannerHost } from "../API/host.js";
import { encodeDomainPathSegment } from "../Functions/domainPathSegments.js";
import { getRecentDomains } from "../Functions/domainFavourites.js";
import { readCachedDomains } from "../Functions/cachedDomains.js";

const { useContext, useEffect } = React;
const useLocation = window.ReactRouterDOM.useLocation;
const useHistory = window.ReactRouterDOM.useHistory;

const DONE_KEY = "ia_auto_domain_done";
// Analytics pages that are meant to cover every domain.
const ALL_DOMAIN_PAGES = /^\/analytics\/(digest|getting-started|ad-spend)(\/|$)/;

function alreadyDecided() {
    try { return sessionStorage.getItem(DONE_KEY) === "1"; } catch { return true; }
}
function markDecided() {
    try { sessionStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
}

// A real domain segment always has a dot ("example.com" / "example%2Ecom");
// sub-page names ("audience", "consent") never do.
function hasDomainSegment(pathname) {
    const seg = String(pathname).split("/").filter(Boolean)[1] || "";
    return seg.includes(".") || /%2e/i.test(seg);
}

async function pickDomain(orgDomains) {
    const known = new Set(orgDomains);
    // 1. The domain used last — in either product (the header records both)
    const recent = getRecentDomains().find((d) => known.has(d));
    if (recent) return recent;
    // 2. The first domain that has Analytics turned on
    try {
        const r = await fetch(`${ScannerHost}/api/analytics-site?list=1`, {
            headers: { Authorization: Authentication.getToken(), Organisation: String(Authentication.getOrganisation() ?? "") },
        });
        if (r.ok) {
            const active = new Set(((await r.json())?.sites || []).filter((s) => s.active).map((s) => s.domain));
            const withAnalytics = orgDomains.find((d) => active.has(d.toLowerCase()));
            if (withAnalytics) return withAnalytics;
        }
    } catch { /* fall through */ }
    // 3. Any domain
    return orgDomains[0] || null;
}

/**
 * Opening an Analytics page without a domain used to stop at "Select a
 * domain". On the first such visit in a tab, this opens the domain used
 * last instead (or the first with Analytics). Once per tab, so an explicit
 * "combined view" choice afterwards is respected; never with a workspace
 * roll-up active, and never on pages that cover all domains.
 */
export default function AutoDomain() {
    const location = useLocation();
    const history = useHistory();
    const [activeWorkspace] = useContext(WorkspaceContext);

    useEffect(() => {
        const { pathname, search, hash } = location;
        if (!pathname.startsWith("/analytics") || alreadyDecided()) return;
        markDecided();
        if (hasDomainSegment(pathname) || activeWorkspace || ALL_DOMAIN_PAGES.test(pathname)) return;

        const orgDomains = readCachedDomains();
        if (!orgDomains.length) return;
        let cancelled = false;
        pickDomain(orgDomains).then((domain) => {
            const seg = domain && encodeDomainPathSegment(domain);
            if (cancelled || !seg || window.location.pathname !== pathname) return;
            history.replace(`/analytics/${seg}${pathname.replace(/^\/analytics/, "")}${search}${hash}`);
        });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    return null;
}
