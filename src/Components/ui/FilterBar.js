import { Icon } from "./icons.js";
import { t } from "../../i18n/index.js";
import Button from "./Button.js";

/**
 * FilterBar — a row of filters above a table or list.
 * children: FilterSelect / FilterSearch / FilterChip; activeCount + onClear add
 * "Clear filters"; resultCount shows "N results" (announced politely).
 */
export default function FilterBar({ children, activeCount = 0, onClear, resultCount, label = t("Filters"), className = "" }) {
    return (
        <div role="group" aria-label={label} className={`tw-flex tw-flex-wrap tw-items-end tw-gap-3 tw-py-3 ${className}`}>
            {children}
            <div className="tw-flex tw-items-center tw-gap-3 tw-ml-auto">
                {resultCount != null && <span aria-live="polite" className="tw-text-sm tw-text-text-muted tw-tabular-nums">{resultCount} {resultCount === 1 ? "result" : "results"}</span>}
                {activeCount > 0 && onClear && <Button variant="ghost" size="sm" icon="x" onClick={onClear}>{t("Clear filters ({n})", { n: activeCount })}</Button>}
            </div>
        </div>
    );
}

const FIELD = "tw-h-8 tw-px-2 tw-rounded-md tw-border tw-border-solid tw-border-border tw-bg-bg-sunken tw-text-text-primary tw-text-sm tw-font-sans focus-visible:tw-outline-none focus-visible:tw-shadow-focus";
const LABEL = "tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-font-semibold tw-text-text-muted";

/** options: [{ value, label }] — first option is usually "All". */
export function FilterSelect({ label, value, options, onChange }) {
    return (
        <label className={LABEL}>
            {label}
            <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </label>
    );
}

export function FilterSearch({ label, value, onChange, placeholder }) {
    return (
        <label className={LABEL}>
            {label}
            <span className="tw-relative tw-flex tw-items-center">
                <span className="tw-absolute tw-left-2 tw-text-text-muted"><Icon name="search" size={14} /></span>
                <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${FIELD} tw-pl-8 tw-w-field`} />
            </span>
        </label>
    );
}

/** Toggle filter (e.g. "Pre-consent only"). Uses aria-pressed. */
export function FilterChip({ label, pressed, onToggle, icon }) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(!pressed)}
            className={`tw-inline-flex tw-items-center tw-gap-1 tw-h-8 tw-px-3 tw-rounded-full tw-border tw-border-solid tw-text-sm tw-font-semibold tw-cursor-pointer focus-visible:tw-outline-none focus-visible:tw-shadow-focus ${pressed ? "tw-border-accent tw-bg-accent-subtle tw-text-text-primary" : "tw-border-border tw-bg-transparent tw-text-text-secondary hover:tw-text-text-primary"}`}
        >
            {pressed ? <Icon name="check" size={14} /> : icon ? <Icon name={icon} size={14} /> : null}
            {label}
        </button>
    );
}
