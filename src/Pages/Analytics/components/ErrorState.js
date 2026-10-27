import { IconAlertTriangle } from "../Icons.js";

/**
 * Shared error state — docs/design-audit-plan.md Phase 1. Visually based on
 * the existing .sa-notice--error pattern (Analytics.css), but reconciled
 * onto the new --sa-bad token: the old rule hardcoded a fourth distinct
 * "error red" (rgba(220,80,80,X) / #f5aeae) that matched none of the three
 * other reds already found live elsewhere (see the design-tokens commit).
 * role="alert" so assistive tech announces it immediately, unlike
 * EmptyState's role="status".
 */
export default function ErrorState({ message, detail, onRetry, className }) {
    return (
        <div className={"sa-error-state" + (className ? " " + className : "")} role="alert">
            <span className="sa-error-state__icon" aria-hidden="true">
                <IconAlertTriangle />
            </span>
            <p className="sa-error-state__message">{message || "Something went wrong."}</p>
            {detail && <p className="sa-error-state__detail">{detail}</p>}
            {onRetry && (
                <button type="button" className="sa-error-state__retry" onClick={onRetry}>
                    Try again
                </button>
            )}
        </div>
    );
}
