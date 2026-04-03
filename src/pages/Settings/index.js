import "./Style.css";
import SideNav from "../../Components/Header/SideNav";
import { reportsLinks as settingsSidebarLinks } from "../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../Components/Header/Sticky";
import Authentication from "../../Authentication/Auth";

const Link = window.ReactRouterDOM.Link;
const { useMemo } = React;

const SETTINGS_HUB_COPY = {
    "/settings/preferences": "Profile, notifications, and personal defaults for your account.",
    "/settings/add-user": "Invite teammates to this organisation and assign a role.",
    "/settings/view-users": "See who has access and manage organisation membership.",
    "/settings/create-organisation": "Register another organisation you administer.",
    "/settings/view-organisations": "Browse organisations you belong to and switch context.",
    "/settings/add-domain": "Connect a new site or hostname for the consent platform.",
    "/settings/view-domains": "Inspect domains linked to this organisation.",
    "/settings/config-gdpr": "GDPR-related configuration for this workspace (when enabled).",
    "/settings/blacklist-ip": "Exclude specific IP addresses from analytics and reporting.",
};

function userCanSeeSidebarLink(link) {
    if (!link?.view?.length) return true;
    const role = Authentication.getCurrentOrganisationRole();
    if (role == null || role === "") return false;
    return link.view.indexOf(role) !== -1;
}

function canOpenBlacklistRoute() {
    const role = Authentication.getCurrentOrganisationRole();
    return role === "admin" || role === "super-admin";
}

export default function Settings() {
    document.title = "Settings | Intastellar Consents | CMP";

    const visibleItems = useMemo(() => {
        return settingsSidebarLinks.filter((link) => {
            if (!userCanSeeSidebarLink(link)) return false;
            if (link.path === "/settings/blacklist-ip" && !canOpenBlacklistRoute()) return false;
            return true;
        });
    }, []);

    const scopeLine = useMemo(() => {
        try {
            const org = JSON.parse(localStorage.getItem("organisation"));
            const name = org?.name;
            if (name) return name;
        } catch {
            /* ignore */
        }
        return "Current organisation";
    }, []);

    return (
        <>
            <SideNav links={settingsSidebarLinks} title="Settings" />
            <main className="dashboard-content">
                <StickyPageTitle title="Settings" />
                <div className="settings-hub">
                    <p className="settings-hub__intro">
                        Configure your account, organisation, and domains. Use the sidebar for quick access, or
                        choose a section below. Your role controls which actions are available.
                    </p>
                    <div className="settings-hub__scope" aria-live="polite">
                        <span className="settings-hub__scope-label">Organisation</span>
                        <span className="settings-hub__scope-value">{scopeLine}</span>
                    </div>
                    {visibleItems.length === 0 ? (
                        <p className="settings-hub__empty">No settings sections are available for your current role.</p>
                    ) : (
                        <div className="settings-hub__grid">
                            {visibleItems.map((link) => (
                                <Link key={link.path} className="settings-hub__card" to={link.path}>
                                    <span className="settings-hub__card-title">
                                        {link.name}
                                        <span className="settings-hub__card-arrow" aria-hidden="true" />
                                    </span>
                                    <p className="settings-hub__card-desc">
                                        {SETTINGS_HUB_COPY[link.path] ||
                                            "Open this section to manage related options."}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
