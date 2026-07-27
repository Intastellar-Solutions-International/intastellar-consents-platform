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