import { Icon } from "./icons.js";
import { t } from "../../i18n/index.js";

/**
 * HealthPill — overall status of a domain at a glance (top bar).
 * checks: [{ label: "Logging", status: "ok"|"warning"|"error"|"unknown", detail: "Last consent 3 min ago" }]
 * The pill shows the worst status as icon + word; every check is listed in
 * the accessible name and tooltip. onClick (optional) opens details.
 */
const STATUS = {
    ok: { icon: "check-circle", word: t("Healthy"), cls: "tw-text-success tw-border-success/40 tw-bg-success/10" },
    warning: { icon: "alert-triangle", word: t("Needs attention"), cls: "tw-text-warning tw-border-warning/40 tw-bg-warning/10" },
    error: { icon: "alert-octagon", word: t("Problem"), cls: "tw-text-danger-text tw-border-danger/40 tw-bg-danger/10" },
    unknown: { icon: "minus-circle", word: t("Unknown"), cls: "tw-text-text-muted tw-border-border tw-bg-white/5" },
};
const RANK = { error: 3, warning: 2, unknown: 1, ok: 0 };

export function worstStatus(checks) {
    return checks.reduce((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), "ok");
}

export default function HealthPill({ checks = [], onClick, className = "" }) {
    const overall = checks.length ? worstStatus(checks) : "unknown";
    const s = STATUS[overall];
    const summary = checks.map((c) => `${c.label}: ${STATUS[c.status]?.word || c.status}${c.detail ? ` (${c.detail})` : ""}`).join("; ");
    const Tag = onClick ? "button" : "span";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            title={summary}
            aria-label={t("Domain health: {status}. {summary}", { status: s.word, summary })}
            className={`tw-inline-flex tw-items-center tw-gap-2 tw-h-8 tw-px-3 tw-rounded-full tw-border tw-border-solid tw-text-sm tw-font-semibold tw-whitespace-nowrap ${s.cls} ${onClick ? "tw-cursor-pointer focus-visible:tw-outline-none focus-visible:tw-shadow-focus" : ""} ${className}`}
        >
            <Icon name={s.icon} size={14} />
            <span>{s.word}</span>
        </Tag>
    );
}
