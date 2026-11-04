import Authentication from "../../Authentication/Auth";
import { DomainContext } from "../../App.js";
import { dashboardPath, reportsPath, detectDashboardMode } from "../../Functions/domainPathSegments.js";
import { canAccess } from "../../Functions/tier.js";
import { getOrg } from "../../Functions/storage.js";
import { setNewShell } from "../../Functions/featureFlags.js";
import { t } from "../../i18n/index.js";
import { Icon } from "../ui/icons.js";
import "./Shell.css";

const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const { useContext, useState, useEffect } = React;
const COLLAPSED_KEY = "shell:railCollapsed";

/**
 * Left rail for the new shell (feature flag newShell). Labels are shown by
 * default; the collapse button switches to icons only (remembered). Every
 * link keeps its accessible name and a tooltip when collapsed.
 *
 * Groups: Overview · Compliance · Reports · Optimise · Settings. Compliance
 * lives only here — the Reports sidebar that repeated it is hidden in this
 * shell (see SideNav.js).
 */
function buildGroups(platform, domain, isAdminOrg) {
    const r = (leaf) => reportsPath(platform, domain, leaf);
    return [
        { label: t("Overview"), items: [{ name: t("Home"), icon: "home", to: dashboardPath(platform, domain), match: (p) => /\/[^/]+\/dashboard(\/|$)/.test(p) || /^\/[^/]+\/view\//.test(p) }] },
        {
            label: t("Compliance"), items: [
                { name: t("Compliance overview"), icon: "shield-check", to: r("/compliance"), match: (p) => p.includes("/compliance"), tier: "starter" },
                { name: t("Audit log"), icon: "file-text", to: r("/user-consents"), match: (p) => p.includes("/user-consents"), tier: "personal" },
                { name: t("Audit reports"), icon: "file-text", to: r("/audit-report"), match: (p) => p.includes("/audit-report"), tier: "personal" },
                { name: t("DSR portal"), icon: "inbox", to: r("/dsr"), match: (p) => p.includes("/dsr"), tier: "personal" },
            ],
        },
        {
            label: t("Reports"), items: [
                { name: t("Reports"), icon: "bar-chart", to: r(""), match: (p) => /\/reports\/?$/.test(p) || /\/reports\/view\/[^/]+\/?$/.test(p) },
                { name: t("Ad reconciliation"), icon: "trending-up", to: r("/reconcile"), match: (p) => p.includes("/reconcile"), tier: "growth" },
            ],
        },
        {
            label: t("Optimise"), items: [
                { name: t("Portfolio benchmark"), icon: "globe", to: `/${platform}/compare`, match: (p) => p.includes("/compare") },
                { name: t("A/B testing"), icon: "flask", to: "/experiments", match: (p) => p.startsWith("/experiments") },
            ],
        },
        {
            label: t("Settings"), items: [
                { name: t("Settings"), icon: "settings", to: "/settings", match: (p) => p.startsWith("/settings") },
                ...(isAdminOrg ? [{ name: t("Cookie database"), icon: "database", to: "/cookie-database", match: (p) => p === "/cookie-database" }] : []),
            ],
        },
    ];
}

const ITEM = "tw-flex tw-items-center tw-gap-3 tw-h-10 tw-px-3 tw-rounded-md tw-text-sm tw-no-underline tw-border-0 tw-bg-transparent tw-cursor-pointer tw-w-full "
    + "focus-visible:tw-outline-none focus-visible:tw-shadow-focus";

export default function ShellRail() {
    const [currentDomain] = useContext(DomainContext);
    const path = useLocation().pathname;
    const platform = localStorage.getItem("platform") || "gdpr";
    const [collapsed, setCollapsed] = useState(() => {
        try {
            const saved = localStorage.getItem(COLLAPSED_KEY);
            if (saved != null) return saved === "1";
        } catch { /* ignore */ }
        return window.innerWidth < 1100;   // no saved choice: icons only on narrow screens
    });
    useEffect(() => {
        try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
        document.documentElement.style.setProperty("--shell-rail-width", collapsed ? "var(--size-rail-collapsed)" : "var(--size-rail)");
    }, [collapsed]);
    // The header's menu button toggles the rail too (small screens).
    useEffect(() => {
        const toggle = () => setCollapsed((c) => !c);
        window.addEventListener("shell:toggle-rail", toggle);
        return () => window.removeEventListener("shell:toggle-rail", toggle);
    }, []);

    // Analytics has its own grouped sidebar (AnalyticsSideNav), like the classic rail.
    if (detectDashboardMode(path) === "analytics") return null;

    const groups = buildGroups(platform, currentDomain, Number(getOrg?.()?.id) === 1)
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.tier || canAccess(i.tier)) }))
        .filter((g) => g.items.length);

    return (
        <aside className="shell-rail tw-bg-bg-sunken tw-border-0 tw-border-r tw-border-solid tw-border-border-subtle" style={{ width: "var(--shell-rail-width, var(--size-rail))" }}>
            <nav aria-label={t("Main navigation")} className="tw-flex tw-flex-col tw-h-full tw-gap-1 tw-p-2 tw-overflow-y-auto">
                <button
                    type="button"
                    onClick={() => setCollapsed((c) => !c)}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? t("Expand navigation") : t("Collapse navigation")}
                    title={collapsed ? t("Expand navigation") : t("Collapse navigation")}
                    className={`${ITEM} tw-text-text-muted hover:tw-text-text-primary hover:tw-bg-white/5 ${collapsed ? "tw-justify-center tw-px-0" : ""}`}
                >
                    <Icon name="panel-left" size={18} />
                    {!collapsed && <span>{t("Collapse")}</span>}
                </button>
                {groups.map((g) => (
                    <div key={g.label} role="group" aria-labelledby={`rail-${g.label}`} className="tw-flex tw-flex-col tw-gap-0.5 tw-pt-3">
                        <span
                            id={`rail-${g.label}`}
                            className={collapsed ? "tw-sr-only" : "tw-px-3 tw-pb-1 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-text-muted"}
                        >
                            {g.label}
                        </span>
                        {g.items.map((item) => {
                            const active = item.match(path);
                            return (
                                <Link
                                    key={item.name}
                                    to={item.to}
                                    aria-current={active ? "page" : undefined}
                                    aria-label={collapsed ? item.name : undefined}
                                    title={collapsed ? item.name : undefined}
                                    className={`${ITEM} ${collapsed ? "tw-justify-center tw-px-0" : ""} ${active
                                        ? "tw-bg-accent-subtle tw-text-text-primary tw-font-semibold tw-shadow-active"
                                        : "tw-text-text-secondary hover:tw-bg-white/5 hover:tw-text-text-primary"}`}
                                >
                                    <Icon name={item.icon} size={18} />
                                    {!collapsed && <span className="tw-truncate">{item.name}</span>}
                                </Link>
                            );
                        })}
                    </div>
                ))}
                <div className="tw-mt-auto tw-flex tw-flex-col tw-gap-0.5 tw-pt-3">
                    <button type="button" onClick={() => { setNewShell(false); window.location.reload(); }} title={t("Switch back to the previous layout")} className={`${ITEM} tw-text-text-muted hover:tw-text-text-primary hover:tw-bg-white/5 ${collapsed ? "tw-justify-center tw-px-0" : ""}`} aria-label={collapsed ? t("Use classic layout") : undefined}>
                        <Icon name="refresh" size={18} />
                        {!collapsed && <span>{t("Classic layout")}</span>}
                    </button>
                    <button type="button" onClick={() => Authentication.Logout()} className={`${ITEM} tw-text-text-muted hover:tw-text-text-primary hover:tw-bg-white/5 ${collapsed ? "tw-justify-center tw-px-0" : ""}`} aria-label={collapsed ? t("Log out") : undefined} title={collapsed ? t("Log out") : undefined}>
                        <Icon name="external-link" size={18} />
                        {!collapsed && <span>{t("Log out")}</span>}
                    </button>
                </div>
            </nav>
        </aside>
    );
}
