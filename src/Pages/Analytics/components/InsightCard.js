import StatusBadge from "./StatusBadge.js";

function formatEvidenceValue(value) {
    if (value == null) return "—";
    if (typeof value === "number") {
        return Number.isInteger(value)
            ? value.toLocaleString("de-DE")
            : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
    }
    return String(value);
}

/**
 * Single insight/suggestion card — docs/design-audit-plan.md Phase 1,
 * modeled directly on the existing Marketing page pattern
 * (src/Pages/Reports/MarketingReport/MarketingSuggestionsStrip.js:
 * severity chip, finding, one action, snooze, a collapsible "Why this?"
 * evidence disclosure) — a promoted/generalized version of an
 * already-proven pattern, not a new design. Styled with the Analytics
 * section's own tokens rather than MarketingReport.css's — that
 * stylesheet is out of scope (CMP/Reports side, see Phase 0).
 *
 * Stateless/presentational like every other Phase 1 component: the caller
 * owns snooze persistence and the suggestion list/filtering — pass an
 * `onSnooze` callback, this component doesn't manage localStorage itself.
 *
 * Adds the one thing the existing Marketing pattern doesn't have: a
 * `sampleSize` prop rendering "Based on N visitors," so a reader can judge
 * how much to trust the finding.
 */
export default function InsightCard({
    severity = "neutral", severityLabel, title, body, action, onSnooze, snoozeLabel,
    evidence, sampleSize, className,
}) {
    return (
        <div className={"sa-insight-card sa-insight-card--" + severity + (className ? " " + className : "")}>
            <div className="sa-insight-card__head">
                <StatusBadge status={severity} label={severityLabel} />
                <h3 className="sa-insight-card__title">{title}</h3>
            </div>
            {body && <p className="sa-insight-card__body">{body}</p>}
            {sampleSize != null && (
                <p className="sa-insight-card__sample">
                    Based on {Number(sampleSize).toLocaleString("de-DE")} visitor{sampleSize === 1 ? "" : "s"}
                </p>
            )}
            {(action || onSnooze) && (
                <div className="sa-insight-card__actions">
                    {action && (action.href
                        ? <a className="sa-insight-card__cta" href={action.href}>{action.label} →</a>
                        : <button type="button" className="sa-insight-card__cta" onClick={action.onClick}>{action.label} →</button>
                    )}
                    {onSnooze && (
                        <button type="button" className="sa-insight-card__snooze" onClick={onSnooze}>
                            {snoozeLabel || "Snooze"}
                        </button>
                    )}
                </div>
            )}
            {evidence && Object.keys(evidence).length > 0 && (
                <details className="sa-insight-card__evidence">
                    <summary>Why this?</summary>
                    <ul>
                        {Object.entries(evidence).map(([k, v]) => (
                            <li key={k}><code>{k}</code>: {formatEvidenceValue(v)}</li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
