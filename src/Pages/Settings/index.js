import "./Style.css";
import SideNav from "../../Components/Header/SideNav";
import { reportsLinks as settingsSidebarLinks } from "../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../Components/Header/Sticky";
import Authentication from "../../Authentication/Auth";
import { canAccess, getTier, TIER_LABELS } from "../../Functions/tier.js";
import { formatDate } from "../../Functions/format.js";
import Button from "../../Components/UI/Button.js";
import appStorage from '../../Functions/storage.js';

const Link = window.ReactRouterDOM.Link;
const { useMemo } = React;

const SETTINGS_HUB_COPY = {
    "/settings/preferences": "Profile, notifications, and personal defaults for your account.",
    "https://intastellaraccounts.com/settings/privacy": "Your own marketing, telemetry, data sharing, and visibility preferences — plus requesting an export or deletion of your data. Managed on IntastellarAccounts.com.",
    "/settings/add-user": "Invite teammates to this organisation and assign a role.",
    "/settings/view-users": "See who has access, edit members, or create new platform users from here.",
    "/settings/view-organisations": "Browse organisations, edit them, or create a new one from here.",
    "/settings/add-domain": "Connect a new site or hostname for the consent platform.",
    "/settings/view-domains": "Inspect domains linked to this organisation.",
    "/settings/config-gdpr": "Configure which regulations apply to your visitors and set the banner type per jurisdiction.",
    "/settings/legal-basis": "Assign a legal basis to each processing purpose under each active regulation for audit and DSR responses.",
    "/settings/ropa": "Maintain your Article 30 Record of Processing Activities. Auto-populate from pre-consent scan data.",
    "/settings/ad-connections": "Connect Google Ads, Meta, LinkedIn, and Microsoft Ads to auto-import clicks and spend for each domain.",
    "/settings/analytics-script": "Embed a consent-gated first-party analytics script on your website to collect privacy-safe pageview data.",
    "https://intastellaraccounts.com/settings/org-privacy": "Set organisation-wide privacy defaults — marketing, telemetry, data sharing, and visibility — and lock what members can't override themselves. Managed on IntastellarAccounts.com.",
    "/settings/blacklist-ip": "Exclude specific IP addresses from analytics and reporting.",
    "/settings/workspaces": "Manage client workspaces for your agency. Create and organize client domains.",
};


function userCanSeeSidebarLink(link) {
    if (!link?.view?.length) return true;
    const role = Authentication.getCurrentOrganisationRole();
    if (role == null || role === "") return false;
    return link.view.indexOf(role) !== -1;
}

// Plan, renewal and a link to Stripe's customer portal (cancel, change card,
// invoices). The portal is Stripe's email-verified login, so the link is safe
// to show; only admins see it because only they manage billing.
function BillingSummary() {
    const role = Authentication.getCurrentOrganisationRole();
    if (role !== "admin" && role !== "super-admin") return null;

    let sub = {};
    try { sub = JSON.parse(appStorage.getItem("subscription") || "{}") || {}; } catch { /* ignore */ }
    const tier = getTier();
    if (tier === "none") return null;

    const periodEnd = sub.current_period_end ? formatDate(sub.current_period_end) : null;
    const renewal = !periodEnd ? null
        : sub.cancel_at_period_end ? `Ends ${periodEnd}`
        : sub.status === "trialing" ? `Free trial until ${periodEnd}`
        : sub.status === "past_due" ? "Payment overdue — update your card"
        : `Renews ${periodEnd}`;

    return (
        <div className="settings-hub__billing">
            <span className="settings-hub__scope-label">Plan</span>
            <span className="settings-hub__scope-value">{TIER_LABELS[tier]}</span>
            {renewal && <span className="settings-hub__billing-renewal">{renewal}</span>}
            {sub.portal_url && (
                <Button size="sm" href={sub.portal_url} target="_blank" rel="noopener noreferrer" iconRight="external-link">
                    Manage billing
                </Button>
            )}
        </div>
    );
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
            if (link.requiresTier && !canAccess(link.requiresTier)) return false;
            return true;
        });
    }, []);

    const scopeLine = useMemo(() => {
        try {
            const org = JSON.parse(appStorage.getItem("organisation"));
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
                    <BillingSummary />
                    {visibleItems.length === 0 ? (
                        <p className="settings-hub__empty">No settings sections are available for your current role.</p>
                    ) : (
                        <div className="settings-hub__grid">
                            {visibleItems.map((link) => {
                                const CardTag = link.external ? "a" : Link;
                                const cardProps = link.external
                                    ? { href: link.path, target: "_blank", rel: "noopener noreferrer" }
                                    : { to: link.path };
                                return (
                                    <CardTag key={link.path} className="settings-hub__card" {...cardProps}>
                                        <span className="settings-hub__card-title">
                                            {link.name}{link.external ? " ↗" : ""}
                                            <span className="settings-hub__card-arrow" aria-hidden="true" />
                                        </span>
                                        <p className="settings-hub__card-desc">
                                            {SETTINGS_HUB_COPY[link.path] ||
                                                "Open this section to manage related options."}
                                        </p>
                                    </CardTag>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
