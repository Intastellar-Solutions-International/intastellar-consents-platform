import {
    analyticsAudiencePath, analyticsAcquisitionPath, analyticsConsentPath,
    analyticsMarketingPath, analyticsAdSpendPath, analyticsAttributionPath, analyticsSettingsPath, analyticsGoogleAnalyticsPath,
    analyticsSearchConsolePath,
    analyticsHeatmapPath, analyticsRecordingsPath, analyticsBotsPath,
    analyticsUserFlowPath,
    analyticsConversionsPath, analyticsPageExperimentsPath, analyticsFormsPath,
    analyticsCohortPath, analyticsAlertsPath,
    analyticsReportsPath, analyticsReportBuilderPath,
    analyticsPerformancePath, analyticsPageWeightPath,
} from "../../../Functions/domainPathSegments.js";

export const reportsLinks = [
    {
        name: "My Preferences",
        path: "/settings/preferences",
        view: ["admin", "super-admin", "manager"]
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
        name: "Blacklist IP",
        path: "/settings/blacklist-ip",
        view: ["admin", "super-admin", "manager"]
    },
    {
        name: "Client Workspaces",
        path: "/settings/workspaces",
        view: ["admin", "super-admin"],
        requiresTier: 'agency-pro',
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
export function buildAnalyticsLinks(domain) {
    return [
        {
            divider: true,
            label: "Audience",
        },
        {
            name: "Audience",
            path: analyticsAudiencePath(domain),
        },
        {
            name: "Consent",
            path: analyticsConsentPath(domain),
        },
        {
            divider: true,
            label: "Acquisition",
        },
        {
            name: "Acquisition",
            path: analyticsAcquisitionPath(domain),
        },
        {
            name: "Marketing",
            path: analyticsMarketingPath(domain),
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
            name: "Google Analytics",
            path: analyticsGoogleAnalyticsPath(domain),
        },
        {
            name: "Search Console",
            path: analyticsSearchConsolePath(domain),
        },
        {
            divider: true,
            label: "Behavior",
        },
        {
            name: "Heatmap",
            path: analyticsHeatmapPath(domain),
        },
        {
            name: "Recordings",
            path: analyticsRecordingsPath(domain),
        },
        {
            name: "Bots",
            path: analyticsBotsPath(domain),
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
            label: "Conversions",
        },
        {
            name: "Overview",
            path: analyticsConversionsPath(domain),
            indent: true,
        },
        {
            name: "Funnel & Sources",
            path: analyticsConversionsPath(domain, "deepdive"),
            indent: true,
        },
        {
            name: "Events & Tracking",
            path: analyticsConversionsPath(domain, "setup"),
            indent: true,
        },
        {
            name: "Forms",
            path: analyticsFormsPath(domain),
            indent: true,
        },
        {
            name: "Page Experiments",
            path: analyticsPageExperimentsPath(domain),
        },
        {
            divider: true,
            label: "Insights",
        },
        {
            name: "Retention Cohorts",
            path: analyticsCohortPath(domain),
        },
        {
            name: "Alerts",
            path: analyticsAlertsPath(domain),
        },
        {
            divider: true,
            label: "Custom Reports",
        },
        {
            name: "My Reports",
            path: analyticsReportsPath(domain),
            indent: true,
        },
        {
            name: "New Report",
            path: analyticsReportBuilderPath(domain),
            indent: true,
        },
        {
            divider: true,
            label: "Configuration",
        },
        {
            name: "Settings",
            path: analyticsSettingsPath(domain),
        },
    ];
}