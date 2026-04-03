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
    /* {
        name: "View Domains",
        path: "/settings/view-domains",
        view: ["admin", "super-admin", "manager"]
    },
    {
        name: "Config GDPR",
        path: "/settings/config-gdpr",
        view: ["admin", "super-admin", "manager"]
    }, */
    {
        name: "Blacklist IP",
        path: "/settings/blacklist-ip",
        view: ["admin", "super-admin", "manager"]
    }
]

export const experimentsLinks = [
    {
        name: "A/B Testing",
        path: "/experiments",
        view: ["admin", "super-admin", "manager"]
    }
]