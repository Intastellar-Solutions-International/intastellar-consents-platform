import { IconDocument } from "../Icons.js";

/**
 * Shared "nothing to show" state — docs/design-audit-plan.md Phase 1.
 * Replaces ad-hoc <p className="sa-notice">No data...</p> one-liners
 * (31 call sites across the Analytics section as of Phase 0) with a
 * consistent icon + message + optional CTA, and a dedicated `dependency`
 * prop for the "needs: <dependency>" case the design brief's ground rules
 * require when a panel needs data that doesn't exist yet — never fabricate
 * a number, render this instead.
 */
export default function EmptyState({ icon, title, message, dependency, action, className }) {
    return (
        <div className={"sa-empty-state" + (className ? " " + className : "")} role="status">
            <span className="sa-empty-state__icon" aria-hidden="true">
                {icon || <IconDocument />}
            </span>
            {title && <p className="sa-empty-state__title">{title}</p>}
            {message && <p className="sa-empty-state__message">{message}</p>}
            {dependency && (
                <p className="sa-empty-state__dependency">Needs: {dependency}</p>
            )}
            {action && (
                <button type="button" className="sa-empty-state__action" onClick={action.onClick}>
                    {action.label}
                </button>
            )}
        </div>
    );
}
