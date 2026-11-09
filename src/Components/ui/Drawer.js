import Button from "./Button.js";
import { t } from "../../i18n/index.js";
const { useEffect, useRef, useId } = React;

/**
 * Drawer — side panel for details (e.g. one audit-log record).
 * open, onClose, title, children, footer, width: "sm" | "md" | "lg"
 * flush: no body padding or scrolling, for content that fills the panel.
 * Accessibility: role="dialog" + aria-modal, labelled by its title; focus
 * moves into the drawer on open, Tab stays inside, Esc closes, and focus
 * returns to the element that opened it.
 */
// Above the fixed app header (101), the mobile sidebar (150) and the notification panel (200).
const DRAWER_Z_INDEX = 300;
const WIDTHS = { sm: "tw-w-drawer-sm", md: "tw-w-drawer-md", lg: "tw-w-drawer-lg" };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Drawer({ open, onClose, title, children, footer, width = "md", flush = false }) {
    const panel = useRef(null);
    const titleId = useId();
    useEffect(() => {
        if (!open) return undefined;
        const previous = document.activeElement;
        const first = panel.current?.querySelector(FOCUSABLE);
        (first || panel.current)?.focus();
        const onKey = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
            if (e.key !== "Tab" || !panel.current) return;
            const items = [...panel.current.querySelectorAll(FOCUSABLE)];
            if (!items.length) return;
            const [firstEl, lastEl] = [items[0], items[items.length - 1]];
            if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
            else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
        };
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="tw-fixed tw-inset-0 tw-flex tw-justify-end" style={{ zIndex: DRAWER_Z_INDEX }}>
            <div className="tw-absolute tw-inset-0 tw-bg-black/50" onClick={onClose} aria-hidden="true" />
            <aside
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`tw-relative tw-flex tw-flex-col tw-h-full tw-max-w-full ${WIDTHS[width] || WIDTHS.md} tw-bg-bg-raised tw-border-0 tw-border-l tw-border-solid tw-border-border tw-shadow-overlay focus-visible:tw-outline-none`}
            >
                <header className="tw-flex tw-items-start tw-justify-between tw-gap-4 tw-p-5 tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle">
                    <h2 id={titleId} className="tw-m-0 tw-text-lg tw-font-semibold tw-text-text-primary">{title}</h2>
                    <Button variant="ghost" size="sm" icon="x" iconOnly aria-label={t("Close")} onClick={onClose} />
                </header>
                <div className={`tw-flex-1 tw-min-h-0 tw-text-sm tw-text-text-secondary ${flush ? "tw-overflow-hidden" : "tw-overflow-y-auto tw-p-5"}`}>{children}</div>
                {footer && <footer className="tw-flex tw-justify-end tw-gap-2 tw-p-4 tw-border-0 tw-border-t tw-border-solid tw-border-border-subtle">{footer}</footer>}
            </aside>
        </div>
    );
}
