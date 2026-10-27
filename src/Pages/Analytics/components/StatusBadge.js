import { IconCheckCircle, IconAlertTriangle, IconXCircle, IconInfoCircle } from "../Icons.js";

const STATUS_ICON = {
    good:    IconCheckCircle,
    warn:    IconAlertTriangle,
    bad:     IconXCircle,
    info:    IconInfoCircle,
    neutral: null,
};
const STATUS_WORD = { good: "Good", warn: "Warning", bad: "Bad", info: "Info", neutral: "Neutral" };
const VALID = new Set(Object.keys(STATUS_ICON));

/**
 * Status pill — docs/design-audit-plan.md Phase 1. Exists specifically to
 * satisfy the design brief's accessibility rule: never use color alone for
 * status. A label is always rendered (falls back to the status word itself
 * if one isn't passed, so a careless call site can't end up color-only by
 * accident) and every status but `neutral` gets a default icon too. Pass
 * `icon={null}` explicitly to suppress the icon for a given call site.
 */
export default function StatusBadge({ status = "neutral", label, icon, className }) {
    const normalized = VALID.has(status) ? status : "neutral";
    const Icon = icon === null ? null : (icon || STATUS_ICON[normalized]);
    const text = label || STATUS_WORD[normalized];
    return (
        <span className={"sa-status-badge sa-status-badge--" + normalized + (className ? " " + className : "")}>
            {Icon && <Icon className="sa-status-badge__icon" aria-hidden="true" />}
            <span className="sa-status-badge__label">{text}</span>
        </span>
    );
}
