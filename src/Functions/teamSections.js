// Team insights: which platform section a URL belongs to. A section key is
// stored per visit (api/team-activity.js), so it must stay stable — domain
// handles, organisation ids and record ids are dropped from the path.

const ANALYTICS_SECTIONS = [
    "audience", "acquisition", "consent", "heatmap", "live", "recordings", "bots",
    "user-flow", "conversions", "page-experiments", "marketing", "ad-spend", "settings",
    "event-debugger", "forms", "performance", "page-weight", "attribution",
    "google-analytics", "search-console", "cohorts", "alerts", "scheduled-reports",
    "reports", "digest",
];

const UNTRACKED = ["login", "auth-login", "signup", "check", "api", "styleguide"];
const TOP_LEVEL = ["settings", "experiments", "cookie-database", "dashboard"];

export function sectionForPath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean).map((p) => p.toLowerCase());
    if (!parts.length || UNTRACKED.includes(parts[0])) return null;

    if (parts[0] === "analytics") {
        // /analytics/:handle/<section>/… or /analytics/<section>/…
        const rest = ANALYTICS_SECTIONS.includes(parts[1]) ? parts.slice(1) : parts.slice(2);
        return `analytics/${rest[0] || "overview"}`;
    }
    if (parts[0] === "settings") return parts[1] ? `settings/${parts[1]}` : "settings";
    if (TOP_LEVEL.includes(parts[0])) return parts[0];

    // Everything else starts with the platform id: /:id/dashboard, /:id/reports/…
    const [, area, next, , sub] = parts;
    if (!area) return null;
    if (area === "reports") {
        // /:id/reports/view/:handle/<report>  or  /:id/reports/<report>
        const report = next === "view" ? sub : next;
        return report ? `reports/${report}` : "reports";
    }
    return /^[a-z-]+$/.test(area) ? area : null;
}

const LABELS = {
    "analytics/overview": "Analytics overview",
    "analytics/user-flow": "User flow",
    "analytics/page-experiments": "Page experiments",
    "analytics/ad-spend": "Ad spend",
    "analytics/event-debugger": "Event debugger",
    "analytics/page-weight": "Page weight",
    "analytics/google-analytics": "Google Analytics",
    "analytics/search-console": "Search Console",
    "analytics/scheduled-reports": "Scheduled reports",
    "analytics/reports": "Custom reports",
    "analytics/settings": "Analytics settings",
    "reports": "Reports",
    "reports/user-consents": "User consents",
    "reports/audit-report": "Audit report",
    "reports/reconcile": "Ad reconciliation",
    "reports/compliance": "Compliance",
    "reports/dsr": "Data subject requests",
    "settings": "Settings",
    "settings/config-gdpr": "Jurisdiction settings",
    "settings/ropa": "RoPA builder",
    "settings/team-insights": "Team insights",
    "dashboard": "Dashboard",
    "domains": "Domains",
    "compare": "Portfolio benchmark",
    "cookie-database": "Cookie database",
};

// "analytics/heatmap" → "Heatmap", "settings/view-users" → "Settings · View users"
export function sectionLabel(section) {
    if (LABELS[section]) return LABELS[section];
    const [area, sub] = String(section || "").split("/");
    const words = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
    if (!sub) return words(area);
    return area === "analytics" ? words(sub) : `${words(area)} · ${words(sub)}`;
}
