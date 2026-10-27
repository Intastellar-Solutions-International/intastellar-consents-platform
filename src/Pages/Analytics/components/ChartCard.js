import EmptyState from "./EmptyState.js";
import ErrorState from "./ErrorState.js";
import { SkeletonBlock } from "./Skeleton.js";

/**
 * Chart panel shell — docs/design-audit-plan.md Phase 1. Handles the
 * loading/error/empty states every chart needs (so the Phase 5 shared
 * Chart component only has to handle the "there is real data" case), plus
 * a title row with an optional badge/subtitle and a bottom legend slot —
 * matching the GA4 reference's bottom-left legend convention agreed for
 * Phase 5. Visually based on the existing .sa-chart-section pattern
 * (same background/border/radius/shadow), with corrected type-scale sizes.
 */
export default function ChartCard({
    title, subtitle, badge, legend, actions, loading, error, onRetry, empty, height = 220, children, className,
}) {
    return (
        <div className={"sa-chart-card" + (className ? " " + className : "")}>
            {(title || actions) && (
                <div className="sa-chart-card__head">
                    <div className="sa-chart-card__title-group">
                        <h3 className="sa-chart-card__title">{title}</h3>
                        {badge}
                        {subtitle && <span className="sa-chart-card__subtitle">{subtitle}</span>}
                    </div>
                    {actions && <div className="sa-chart-card__actions">{actions}</div>}
                </div>
            )}
            <div className="sa-chart-card__body" style={{ minHeight: height }}>
                {loading ? (
                    <SkeletonBlock width="100%" height={height} />
                ) : error ? (
                    <ErrorState message={error} onRetry={onRetry} />
                ) : empty ? (
                    <EmptyState {...empty} />
                ) : children}
            </div>
            {legend && <div className="sa-chart-card__legend">{legend}</div>}
        </div>
    );
}
