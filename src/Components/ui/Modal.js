import Button from "./Button.js";
import { t } from "../../i18n/index.js";
const { useEffect, useRef, useId } = React;

/**
 * Modal — a centred dialog for one short task.
 * open, onClose, title, children
 * Same accessibility as Drawer. It can open on top of a Drawer: it listens in
 * the capture phase and stops Esc and Tab there, so the Drawer underneath
 * neither closes nor pulls focus back. Rendered on <body> so nothing above it
 * can clip it.
 */
// Above Drawer (300).
const MODAL_Z_INDEX = 400;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children }) {
    const panel = useRef(null);
    const titleId = useId();
    const close = useRef(onClose);
    close.current = onClose;

    useEffect(() => {
        if (!open) return undefined;
        const previous = document.activeElement;
        const items = () => [...(panel.current?.querySelectorAll(FOCUSABLE) || [])];
        // The first control after the close button.
        (items()[1] || items()[0] || panel.current)?.focus();
        const onKey = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); close.current(); return; }
            if (e.key !== "Tab") return;
            e.stopPropagation();
            const list = items();
            if (!list.length) return;
            const [firstEl, lastEl] = [list[0], list[list.length - 1]];
            if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
            else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
        };
        document.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("keydown", onKey, true); previous?.focus?.(); };
    }, [open]);

    if (!open) return null;
    return window.ReactDOM.createPortal(
        <div className="tw-fixed tw-inset-0 tw-flex tw-items-center tw-justify-center tw-p-4" style={{ zIndex: MODAL_Z_INDEX }}>
            <div className="tw-absolute tw-inset-0 tw-bg-black/60" onClick={onClose} aria-hidden="true" />
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="tw-relative tw-flex tw-flex-col tw-w-full tw-bg-bg-raised tw-border tw-border-solid tw-border-border tw-rounded-xl tw-shadow-md focus-visible:tw-outline-none"
                style={{ maxWidth: 560, maxHeight: "90vh" }}
            >
                <header className="tw-flex tw-items-start tw-justify-between tw-gap-4 tw-p-5 tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle">
                    <h2 id={titleId} className="tw-m-0 tw-text-lg tw-font-semibold tw-text-text-primary">{title}</h2>
                    <Button variant="ghost" size="sm" icon="x" iconOnly aria-label={t("Close")} onClick={onClose} />
                </header>
                <div className="tw-flex-1 tw-min-h-0 tw-overflow-y-auto tw-p-5 tw-text-sm tw-text-text-secondary">{children}</div>
            </div>
        </div>,
        document.body
    );
}
