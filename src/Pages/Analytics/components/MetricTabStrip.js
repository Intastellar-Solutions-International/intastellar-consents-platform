import { formatPercent, deltaSentiment } from "../_shared.js";

/**
 * GA4-style metric selector — docs/design-audit-plan.md Phase 1, the KPI
 * half of the hero composite agreed in the design-audit-plan.md Decisions
 * section (your reference screenshot: Active users / Event count / Bounce
 * rate / Key events, each a clickable tab showing its value + delta,
 * selecting one drives one shared chart below). The chart itself is a
 * separate Phase 5 component — this one is deliberately chart-agnostic, a
 * controlled selector only: `active` + `onSelect` are owned by the parent
 * page, which pairs this with a ChartCard/Chart bound to whichever metric
 * is selected.
 *
 * One deliberate deviation from the GA4 reference, flagged in the plan
 * doc's Decisions section: GA4's own delta arrows don't invert per metric
 * (a rising bounce rate renders green in their UI). Each metric here can
 * pass `delta.invert` to get this codebase's correct inversion instead —
 * see deltaSentiment() in _shared.js (built for KpiCard, reused here).
 *
 * `role="group"` with `aria-pressed` toggle buttons rather than a full
 * ARIA tablist (`role="tablist"`/`role="tab"`): a real tablist requires
 * each tab to be cross-referenced with its own tabpanel via
 * `aria-controls`, and the actual chart "panel" lives outside this
 * component, owned by the parent page. Claiming tablist semantics without
 * that linkage would set the wrong expectations for assistive tech (arrow-
 * key roving focus, exactly one associated panel) that this component
 * alone can't back up.
 *
 * `metrics`: [{ key, label, value, delta?: { value, label, invert } }]
 */
export default function MetricTabStrip({ metrics, active, onSelect, className }) {
    return (
        <div
            className={"sa-metric-tabs" + (className ? " " + className : "")}
            role="group"
            aria-label="Select metric"
        >
            {(metrics || []).map(m => {
                const isActive = m.key === active;
                const sentiment = m.delta && Number.isFinite(m.delta.value) ? deltaSentiment(m.delta) : null;
                return (
                    <button
                        key={m.key}
                        type="button"
                        className={"sa-metric-tab" + (isActive ? " sa-metric-tab--active" : "")}
                        aria-pressed={isActive}
                        onClick={() => onSelect && onSelect(m.key)}
                    >
                        <span className="sa-metric-tab__label">{m.label}</span>
                        <span className="sa-metric-tab__value">{m.value}</span>
                        {sentiment && (
                            <span
                                className={"sa-metric-tab__delta" + (sentiment.isGood ? " sa-metric-tab__delta--good" : " sa-metric-tab__delta--bad")}
                                title={m.delta.label || "vs. previous period of the same length"}
                            >
                                {sentiment.isUp ? "▲" : "▼"} {formatPercent(Math.abs(m.delta.value))}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
