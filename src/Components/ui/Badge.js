import { Icon } from "./icons.js";
import { t } from "../../i18n/index.js";

/**
 * Badge — compact status/metadata label.
 *
 * tone: "neutral" | "success" | "warning" | "danger" | "info"
 *       (no gold tone: gold is reserved for primary actions/active state)
 * icon: optional icon name; status-bearing badges should always have one,
 *       so meaning never rests on colour alone.
 */
const TONES = {
    neutral: "tw-bg-white/5 tw-text-text-secondary tw-border-border",
    success: "tw-bg-success/10 tw-text-success tw-border-success/40",
    warning: "tw-bg-warning/10 tw-text-warning tw-border-warning/40",
    danger: "tw-bg-danger/10 tw-text-danger-text tw-border-danger/40",
    info: "tw-bg-info/10 tw-text-info-text tw-border-info/40",
};
const BASE = "tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-0.5 tw-rounded-full tw-border tw-border-solid "
    + "tw-text-xs tw-font-semibold tw-leading-snug tw-whitespace-nowrap";

export default function Badge({ tone = "neutral", icon, className = "", children, ...rest }) {
    return (
        <span className={`${BASE} ${TONES[tone] || TONES.neutral} ${className}`} {...rest}>
            {icon ? <Icon name={icon} size={13} /> : null}
            {children}
        </span>
    );
}

/** Risk level — always icon + text, never colour alone. level: high | medium | low | none */
const RISK = {
    high: { tone: "danger", icon: "alert-octagon", label: t("High risk") },
    medium: { tone: "warning", icon: "alert-triangle", label: t("Medium risk") },
    low: { tone: "success", icon: "check-circle", label: t("Low risk") },
    none: { tone: "neutral", icon: "minus-circle", label: t("No risk") },
};
export function RiskBadge({ level = "medium", label, ...rest }) {
    const r = RISK[level] || RISK.medium;
    return <Badge tone={r.tone} icon={r.icon} {...rest}>{label || r.label}</Badge>;
}

/** Tag — user-applied label, optionally removable (e.g. an active filter). */
export function Tag({ children, onRemove, className = "" }) {
    return (
        <span className={`${BASE} ${TONES.neutral} ${className}`}>
            {children}
            {onRemove ? (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={t("Remove {name}", { name: typeof children === "string" ? children : t("tag") })}
                    className="tw-inline-flex tw-items-center tw-justify-center tw-p-0 tw-ml-0.5 tw-border-0 tw-bg-transparent tw-text-text-muted tw-rounded-full tw-cursor-pointer hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
                >
                    <Icon name="x" size={12} />
                </button>
            ) : null}
        </span>
    );
}
