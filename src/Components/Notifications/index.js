import { Icon } from "../ui/icons.js";
import Authentication from "../../Authentication/Auth";
import { ScannerHost } from "../../API/host";
import { readCachedDomains, toUnicodeDomain } from "../../Functions/cachedDomains.js";
import { reportsPath } from "../../Functions/domainPathSegments.js";
import { t } from "../../i18n/index.js";

const { useState, useEffect, useRef, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
const useHistory = window.ReactRouterDOM.useHistory;

const REFRESH_MS = 60000;
const SYNC_MS = 15 * 60000;
const SEVERITY = {
    critical: { icon: "alert-octagon", word: "Action needed", tone: "tw-text-danger-text" },
    warning: { icon: "alert-triangle", word: "Check", tone: "tw-text-warning" },
    info: { icon: "info", word: "Info", tone: "tw-text-info-text" },
};

function timeAgo(iso) {
    const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationCenter() {
    const authToken = Authentication.getToken();
    const orgId = Authentication.getOrganisation();
    const history = useHistory();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const rootRef = useRef(null);
    const headers = useCallback(() => ({ Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" }), [authToken, orgId]);

    const refresh = useCallback(async () => {
        if (!authToken || !orgId) return;
        try {
            const resp = await fetch(`${ScannerHost}/api/ad-alerts?resource=notifications`, { headers: headers() });
            if (!resp.ok) return;
            const data = await resp.json();
            setNotifications(data.notifications || []);
            setUnread(data.unread || 0);
        } catch { /* the next refresh will retry */ }
    }, [authToken, orgId, headers]);

    const post = useCallback((body) => fetch(`${ScannerHost}/api/ad-alerts`, { method: "POST", headers: headers(), body: JSON.stringify(body) }), [headers]);

    const sync = useCallback(async () => {
        if (!authToken || !orgId) return;
        try {
            await post({ action: "sync-scan-notifications", domains: readCachedDomains() });
        } catch { /* the next sync will retry */ }
        refresh();
    }, [authToken, orgId, post, refresh]);

    useEffect(() => {
        sync();
        const refreshTimer = setInterval(refresh, REFRESH_MS);
        const syncTimer = setInterval(sync, SYNC_MS);
        return () => { clearInterval(refreshTimer); clearInterval(syncTimer); };
    }, [sync, refresh]);

    useEffect(() => {
        if (!open) return undefined;
        const onClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
    }, [open]);

    function markAllRead() {
        const now = new Date().toISOString();
        setNotifications((list) => list.map((n) => ({ ...n, read_at: n.read_at || now })));
        setUnread(0);
        post({ action: "mark-read", id: "all" }).catch(() => {});
    }

    function openNotification(n) {
        if (!n.read_at) {
            setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
            setUnread((c) => Math.max(0, c - 1));
            post({ action: "mark-read", id: n.id }).catch(() => {});
        }
        if (n.scan_id) {
            const platform = localStorage.getItem("platform") || "gdpr";
            setOpen(false);
            history.push(`${reportsPath(platform, toUnicodeDomain(n.domain), "/compliance")}?scan=${encodeURIComponent(n.scan_id)}`);
        }
    }

    return (
        <div ref={rootRef} className="tw-relative tw-flex tw-items-center">
            <button
                type="button"
                onClick={() => { if (!open) refresh(); setOpen((o) => !o); }}
                aria-label={unread > 0 ? `${t("Notifications")}: ${unread} unread` : t("Notifications")}
                aria-expanded={open}
                title={t("Notifications")}
                className="tw-relative tw-flex tw-items-center tw-justify-center tw-h-10 tw-w-10 tw-border-0 tw-bg-transparent tw-rounded-md tw-text-text-secondary tw-cursor-pointer hover:tw-bg-white/5 hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
            >
                <Icon name="bell" size={20} />
                {unread > 0 && (
                    <span className="tw-absolute tw-flex tw-items-center tw-justify-center tw-px-1 tw-bg-danger tw-text-text-inverse tw-text-xs tw-font-semibold tw-rounded-full tw-tabular-nums tw-leading-none" style={{ top: 2, right: 2, minWidth: 18, height: 18 }}>
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label={t("Notifications")}
                    className="notif-panel tw-absolute tw-right-0 tw-flex tw-flex-col tw-bg-bg-raised tw-border tw-border-solid tw-border-border tw-rounded-xl tw-shadow-overlay tw-overflow-hidden"
                    style={{ top: "calc(100% + 8px)", width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "min(560px, 80vh)", zIndex: 200 }}
                >
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-px-4 tw-py-3 tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle">
                        <h2 className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">{t("Notifications")}</h2>
                        {unread > 0 && (
                            <button type="button" onClick={markAllRead} className="tw-p-0 tw-border-0 tw-bg-transparent tw-font-sans tw-text-sm tw-text-accent-strong tw-cursor-pointer tw-rounded-sm focus-visible:tw-outline-none focus-visible:tw-shadow-focus">Mark all read</button>
                        )}
                    </div>
                    {notifications.length === 0 ? (
                        <div className="tw-flex tw-flex-col tw-items-center tw-gap-2 tw-px-4 tw-py-8 tw-text-center">
                            <span className="tw-text-success"><Icon name="check-circle" size={24} /></span>
                            <p className="tw-m-0 tw-text-sm tw-text-text-primary">You're all caught up</p>
                            <p className="tw-m-0 tw-text-xs tw-text-text-muted">Issues found on your domains will appear here.</p>
                        </div>
                    ) : (
                        <ul className="tw-m-0 tw-p-0 tw-list-none tw-overflow-y-auto">
                            {notifications.map((n) => {
                                const s = SEVERITY[n.severity] || SEVERITY.info;
                                return (
                                    <li key={n.id} className="tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle">
                                        <button
                                            type="button"
                                            onClick={() => openNotification(n)}
                                            className={`tw-flex tw-gap-3 tw-w-full tw-px-4 tw-py-3 tw-border-0 tw-font-sans tw-text-left tw-cursor-pointer hover:tw-bg-white/5 focus-visible:tw-outline-none focus-visible:tw-shadow-focus ${n.read_at ? "tw-bg-transparent" : "tw-bg-white/5"}`}
                                        >
                                            <span className={`tw-shrink-0 ${s.tone}`} style={{ marginTop: 2 }}><Icon name={s.icon} size={16} label={s.word} /></span>
                                            <span className="tw-flex-1 tw-min-w-0">
                                                <span className="tw-block tw-text-sm tw-font-semibold tw-text-text-primary">{n.title || n.rule_type}</span>
                                                {n.body && <span className="tw-block tw-text-sm tw-text-text-secondary">{n.body}</span>}
                                                <span className="tw-block tw-mt-1 tw-text-xs tw-text-text-muted">{toUnicodeDomain(n.domain)} · {timeAgo(n.created_at)}{n.read_at ? "" : " · Unread"}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <Link to="/settings/preferences" onClick={() => setOpen(false)} className="tw-block tw-px-4 tw-py-3 tw-text-sm tw-text-text-secondary tw-no-underline hover:tw-text-text-primary hover:tw-bg-white/5 tw-border-0 tw-border-t tw-border-solid tw-border-border-subtle focus-visible:tw-outline-none focus-visible:tw-shadow-focus">Notification settings</Link>
                </div>
            )}
        </div>
    );
}
