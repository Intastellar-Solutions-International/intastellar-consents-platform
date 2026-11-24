import googleAnalyticsLogo from "../icons/google-analytics.svg";
import searchConsoleLogo from "../icons/search-console.svg";
import botsLogo from "../icons/bots.svg";
import heatmapLogo from "../icons/heatmap.svg";
import recordingsLogo from "../icons/recordings.svg";

import {
    analyticsPath, analyticsAudiencePath, analyticsSegmentsPath, analyticsAcquisitionPath, analyticsConsentPath,
    analyticsMarketingPath, analyticsAdSpendPath, analyticsAttributionPath, analyticsSettingsPath, analyticsGoogleAnalyticsPath,
    analyticsSearchConsolePath,
    analyticsHeatmapPath, analyticsRecordingsPath, analyticsBotsPath, analyticsLivePath,
    analyticsUserFlowPath,
    analyticsConversionsPath, analyticsPageExperimentsPath, analyticsFormsPath,
    analyticsCohortPath, analyticsAlertsPath, analyticsScheduledReportsPath,
    analyticsReportsPath, analyticsReportBuilderPath,
    analyticsPerformancePath, analyticsPageWeightPath, analyticsDigestPath, analyticsGettingStartedPath,
    analyticsEventDebuggerPath, analyticsAudiencesPath,
    dashboardPath, reportsPath,
} from "../../../Functions/domainPathSegments.js";

export const reportsLinks = [
    {
        name: "My Preferences",
        path: "/settings/preferences",
        view: ["admin", "super-admin", "manager"]
    },
    {
        name: "My Privacy",
        path: "https://intastellaraccounts.com/settings/privacy",
        external: true,
    },
    {
        name: "View Users",
        path: "/settings/view-users",
        view: ["admin", "super-admin", "manager"]
    },
    {
        name: "View Organisations",
        path: "/settings/view-organisations",
        view: ["admin", "super-admin", "user", "manager"]
    },
    {
        name: "Add new Domain",
        path: "/settings/add-domain",
        view: ["admin", "super-admin", "manager"]
    },
    {
        name: "Jurisdiction",
        path: "/settings/config-gdpr",
        view: ["admin", "super-admin", "manager"],
        requiresTier: 'starter',
    },
    {
        name: "Legal Basis",
        path: "/settings/legal-basis",
        view: ["admin", "super-admin", "manager"],
        requiresTier: 'growth',
    },
    {
        name: "RoPA Builder",
        path: "/settings/ropa",
        view: ["admin", "super-admin", "manager"],
        requiresTier: 'growth',
    },
    {
        name: "Evidence Catalog",
        path: "/settings/evidence",
        view: ["admin", "super-admin", "manager"],
        requiresTier: 'growth',
    },
    {
        name: "Ad Connections",
        path: "/settings/ad-connections",
        view: ["admin", "super-admin", "manager"],
    },
    {
        name: "Analytics Script",
        path: "/settings/analytics-script",
        view: ["admin", "super-admin", "manager"],
        requiresTier: 'starter',
    },
    {
        name: "Organisation Privacy",
        path: "https://intastellaraccounts.com/settings/org-privacy",
        view: ["admin", "super-admin"],
        external: true,
    },
    {
        name: "Blacklist IP",
        path: "/settings/blacklist-ip",
        view: ["admin", "super-admin", "manager"]
    },
    {
        name: "Client Workspaces",
        path: "/settings/workspaces",
        view: ["admin", "super-admin"],
        requiresTier: 'agency-pro',
    },
    {
        name: "Team Insights",
        path: "/settings/team-insights",
        view: ["admin", "super-admin"],
        requiresTier: 'growth',
    }
]

export const experimentsLinks = [
    {
        name: "A/B Testing",
        path: "/experiments",
        view: ["admin", "super-admin", "manager"]
    }
]

// GA-style grouped sidebar for the Analytics section. Built as a function of
// the current domain (rather than a static handle-less array) because
// AnalyticsSideNav mounts outside any matched <Route> (see App.js) — so
// SideNav's own useParams()-based "/analytics" -> "/analytics/:handle"
// rewrite never fires there, and a handle-less link like "/analytics/audience"
// has no matching route at all. Pre-resolving full hrefs here sidesteps that
// entirely: SideNav's rewrite only runs when it finds a handle, so with none
// available it just passes these paths through unchanged.
//
// Regrouped for docs/design-audit-plan.md Phase 3 to the exact groups your
// brief specified: Overview/Audience standalone, then Marketing/Behavior/
// Leads/Insights/Reports/Settings. Two judgment calls worth flagging:
//
// 1. The brief's "Marketing (Acquisition, Ad Spend, Attribution, Search
//    Console, Google Analytics, Consent)" sub-item list doesn't itself
//    include a "Marketing" leaf — but there IS a real page at this exact
//    path (the Channel Analytics / "Marketing" overview, renamed to match
//    its nav label in Phase 2 item 3), and group-header divider rows
//    aren't clickable links in this sidebar (see SideNav.js: `if
//    (link.divider) return <li aria-hidden="true">...`). Omitting it would
//    orphan that page from the main nav entirely, so it's included as the
//    group's own first item rather than dropped.
// 2. The Conversions sub-items (Overview/Funnel & Sources/Events &
//    Tracking) are no longer nested here as indented children — confirmed
//    live (Phase 3 investigation) that ConversionsOverview.js already
//    renders its own in-page sub-nav (`sa-conv-submenu`) for exactly
//    these three destinations. Keeping both was a genuine duplication,
//    not two different things; "Conversions" is now one link here, per
//    the brief's own "keep in-page sub-nav only where truly needed
//    (Conversions)" — the in-page one is the one being kept.
export function buildAnalyticsLinks(domain) {
    return [
        {
            name: "Overview",
            path: analyticsPath(domain),
        },
        {
            // Shared CMP + Analytics checklist (also in the CMP rail)
            name: "Get started",
            path: analyticsGettingStartedPath(),
        },
        {
            name: "Audience",
            path: analyticsAudiencePath(domain),
        },
        {
            name: "Segments",
            path: analyticsSegmentsPath(domain),
        },
        {
            divider: true,
            label: "Marketing",
        },
        {
            name: "Campaign consent",
            path: analyticsMarketingPath(domain),
        },
        {
            name: "Acquisition",
            path: analyticsAcquisitionPath(domain),
        },
        {
            name: "Ad Spend",
            path: analyticsAdSpendPath(domain),
        },
        {
            name: "Attribution",
            path: analyticsAttributionPath(domain),
        },
        {
            name: "Search Console",
            path: analyticsSearchConsolePath(domain),
            logoSrc: searchConsoleLogo,
        },
        {
            name: "Google Analytics",
            path: analyticsGoogleAnalyticsPath(domain),
            logoSrc: googleAnalyticsLogo,
        },
        {
            name: "Consent",
            path: analyticsConsentPath(domain),
        },
        {
            divider: true,
            label: "Behavior",
        },
        {
            name: "Live",
            path: analyticsLivePath(domain),
        },
        {
            name: "Heatmap",
            path: analyticsHeatmapPath(domain),
            logoSrc: heatmapLogo,
        },
        {
            name: "Recordings",
            path: analyticsRecordingsPath(domain),
            logoSrc: recordingsLogo,
        },
        {
            name: "Bots",
            path: analyticsBotsPath(domain),
            logoSrc: botsLogo,
        },
        {
            name: "User Flow",
            path: analyticsUserFlowPath(domain),
        },
        {
            name: "Performance",
            path: analyticsPerformancePath(domain),
        },
        {
            name: "Page Weight",
            path: analyticsPageWeightPath(domain),
        },
        {
            divider: true,
            label: "Leads",
        },
        {
            name: "Conversions",
            path: analyticsConversionsPath(domain),
        },
        {
            name: "Forms",
            path: analyticsFormsPath(domain),
        },
        {
            name: "Experiments",
            path: analyticsPageExperimentsPath(domain),
        },
        {
            divider: true,
            label: "Insights",
        },
        {
            name: "Cohorts",
            path: analyticsCohortPath(domain),
        },
        {
            name: "Audiences",
            path: analyticsAudiencesPath(domain),
        },
        {
            name: "Alerts",
            path: analyticsAlertsPath(domain),
        },
        {
            name: "Digest",
            path: analyticsDigestPath(),
        },
        {
            divider: true,
            label: "Reports",
        },
        {
            name: "My Reports",
            path: analyticsReportsPath(domain),
        },
        {
            name: "New Report",
            path: analyticsReportBuilderPath(domain),
            indent: true,
        },
        {
            name: "Scheduled Reports",
            path: analyticsScheduledReportsPath(domain),
            indent: true,
        },
        {
            divider: true,
            label: "Settings",
        },
        {
            name: "Settings",
            path: analyticsSettingsPath(domain),
        },
        {
            name: "Event Debugger",
            path: analyticsEventDebuggerPath(domain),
        },
        {
            name: "Global Settings",
            path: "/settings",
        },
    ];
}

// CMP menu in the same grouped sidebar as Analytics (AnalyticsSidebar.js) —
// one shell for both products. Mirrors the groups the new-shell rail had
// (ShellRail.js): Overview items on top, then collapsible groups. Paths are
// fully resolved here; `match` marks a link active on its sub-pages too
// (e.g. Settings on every /settings/… page). `requiresTier` hides links
// the plan doesn't include.
export function buildCmpLinks(platform, domain, isAdminOrg = false) {
    const r = (leaf) => reportsPath(platform, domain, leaf);
    return [
        { name: "Home", path: dashboardPath(platform, domain), match: (p) => /\/[^/]+\/dashboard(\/|$)/.test(p) || /^\/[^/]+\/view\//.test(p) },
        { name: "Get started", path: `/${platform}/onboarding`, match: (p) => p.endsWith("/onboarding") },

        { divider: true, label: "Compliance" },
        { name: "Compliance overview", path: r("/compliance"), match: (p) => p.includes("/compliance"), requiresTier: "starter" },
        { name: "Cookie scans", path: `/${platform}/reports/scans`, match: (p) => p.includes("/reports/scans"), requiresTier: "starter" },
        { name: "Audit log", path: r("/user-consents"), match: (p) => p.includes("/user-consents"), requiresTier: "personal" },
        { name: "Audit reports", path: r("/audit-report"), match: (p) => p.includes("/audit-report"), requiresTier: "personal" },
        { name: "DSR portal", path: r("/dsr"), match: (p) => p.includes("/dsr"), requiresTier: "personal" },

        { divider: true, label: "Reports" },
        { name: "Reports", path: r(""), match: (p) => /\/reports\/?$/.test(p) || /\/reports\/view\/[^/]+\/?$/.test(p) },
        { name: "Ad reconciliation", path: r("/reconcile"), match: (p) => p.includes("/reconcile"), requiresTier: "growth" },

        { divider: true, label: "Optimise" },
        { name: "Portfolio benchmark", path: `/${platform}/compare`, match: (p) => p.includes("/compare") },
        { name: "A/B testing", path: "/experiments", match: (p) => p.startsWith("/experiments") },

        { divider: true, label: "Settings" },
        { name: "Settings", path: "/settings", match: (p) => p.startsWith("/settings") },
        ...(isAdminOrg ? [
            { name: "Cookie database", path: "/cookie-database", match: (p) => p === "/cookie-database" },
            { name: "Platform", path: "/platform", match: (p) => p === "/platform" || p.startsWith("/platform/") },
        ] : []),
    ];
}
