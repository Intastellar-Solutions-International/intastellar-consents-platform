const { useRef } = React;

/**
 * Tabs — WAI-ARIA tablist with roving focus.
 * tabs: [{ id, label, count?, disabled? }], value, onChange(id), label (accessible name), idPrefix
 * Keyboard: ←/→ move between tabs, Home/End jump, Enter/Space not needed (selection follows focus).
 * Render each panel with <TabPanel idPrefix id active>.
 * Active tab: gold underline (gold = active state).
 */
export default function Tabs({ tabs, value, onChange, label, idPrefix = "tabs", className = "" }) {
    const refs = useRef({});
    const enabled = tabs.filter((t) => !t.disabled);
    const move = (delta) => {
        const i = enabled.findIndex((t) => t.id === value);
        const next = delta === "home" ? enabled[0] : delta === "end" ? enabled[enabled.length - 1] : enabled[(i + delta + enabled.length) % enabled.length];
        if (next) { onChange(next.id); refs.current[next.id]?.focus(); }
    };
    const onKeyDown = (e) => {
        const map = { ArrowRight: 1, ArrowLeft: -1, Home: "home", End: "end" };
        if (e.key in map) { e.preventDefault(); move(map[e.key]); }
    };
    return (
        <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`tw-flex tw-gap-1 tw-border-0 tw-border-b tw-border-solid tw-border-border ${className}`}>
            {tabs.map((t) => {
                const active = t.id === value;
                return (
                    <button
                        key={t.id}
                        ref={(el) => { refs.current[t.id] = el; }}
                        type="button"
                        role="tab"
                        id={`${idPrefix}-tab-${t.id}`}
                        aria-selected={active}
                        aria-controls={`${idPrefix}-panel-${t.id}`}
                        tabIndex={active ? 0 : -1}
                        disabled={t.disabled}
                        onClick={() => onChange(t.id)}
                        className={`tw-inline-flex tw-items-center tw-gap-2 tw-px-3 tw-py-2 tw--mb-px tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-solid tw-text-sm tw-font-semibold tw-cursor-pointer focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-t-sm disabled:tw-opacity-50 disabled:tw-cursor-not-allowed ${active ? "tw-border-accent tw-text-text-primary" : "tw-border-transparent tw-text-text-muted hover:tw-text-text-primary"}`}
                    >
                        {t.label}
                        {t.count != null && <span className="tw-text-xs tw-font-normal tw-text-text-muted tw-tabular-nums">{t.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

export function TabPanel({ idPrefix = "tabs", id, active, children, className = "" }) {
    return (
        <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={!active} tabIndex={0} className={`focus-visible:tw-outline-none focus-visible:tw-shadow-focus ${className}`}>
            {active ? children : null}
        </div>
    );
}
