import { Icon } from "./icons.js";
import Button from "./Button.js";

/**
 * EmptyState — nothing to show (yet). Say why, and what to do next.
 * icon: icon name (default "inbox"); action: { label, onClick } (optional)
 */
export default function EmptyState({ icon = "inbox", title, message, action, compact = false, className = "" }) {
    return (
        <div role="status" className={`tw-flex tw-flex-col tw-items-center tw-text-center tw-gap-2 ${compact ? "tw-py-6" : "tw-py-12"} tw-px-4 ${className}`}>
            <span className="tw-text-text-muted"><Icon name={icon} size={compact ? 24 : 32} /></span>
            {title && <p className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">{title}</p>}
            {message && <p className="tw-m-0 tw-text-sm tw-text-text-muted tw-max-w-md">{message}</p>}
            {action && <Button variant="secondary" size="sm" onClick={action.onClick} className="tw-mt-2">{action.label}</Button>}
        </div>
    );
}
