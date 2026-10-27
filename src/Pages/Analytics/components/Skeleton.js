/**
 * Shared loading-skeleton primitives — docs/design-audit-plan.md Phase 1.
 * Promoted and generalized from what used to be two separate, overlapping
 * implementations: _shared.js's `PanelSkeleton` (rows-only) and index.js's
 * locally-defined `KpiCardSkeleton`/`PanelSkeletonShell` (full panel with
 * title). Renamed the rows-only one to `SkeletonRows` so `PanelSkeleton`
 * can mean what its name suggests — a whole panel, title included — rather
 * than two same-named things meaning different amounts of markup depending
 * on which file you imported from.
 */

/** The base shimmer rectangle. Replaces the ad-hoc
 *  <span className="sa-skeleton" style={{width,height}} /> pattern that was
 *  previously typed out inline at each call site. */
export function SkeletonBlock({ width, height = 10, inline = false, flex = false, className }) {
    return (
        <span
            className={"sa-skeleton" + (flex ? " sa-skeleton--flex" : "") + (className ? " " + className : "")}
            style={{ width: flex ? undefined : width, height, display: flex ? undefined : (inline ? "inline-block" : "block") }}
        />
    );
}

/** A stack of placeholder rows — same shimmer pattern as a real data table's
 *  rows (one wide label block + one flexible value block per row), varying
 *  width slightly per row so the placeholder doesn't look like a solid
 *  block of identical bars. */
export function SkeletonRows({ rows = 4 }) {
    return (
        <div className="sa-skeleton-rows">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="sa-skeleton-row">
                    <SkeletonBlock width={(38 + (i * 19) % 38) + "%"} height={10} />
                    <SkeletonBlock height={8} flex />
                </div>
            ))}
        </div>
    );
}

/** One KpiCard-shaped placeholder — label / big value / sub-line. */
export function KpiCardSkeleton() {
    return (
        <div className="sa-kpi">
            <div className="sa-kpi__head">
                <SkeletonBlock width={70} height={10} />
            </div>
            <span className="sa-kpi__value">
                <SkeletonBlock width={56} height={20} inline />
            </span>
            <span className="sa-kpi__sub">
                <SkeletonBlock width={90} height={8} inline />
            </span>
        </div>
    );
}

/** A whole panel's worth of placeholder — title + N skeleton rows, in the
 *  same .sa-panel wrapper a real panel uses. */
export function PanelSkeleton({ titleWidth = 120, rows = 4 }) {
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">
                <SkeletonBlock width={titleWidth} height={11} />
            </h3>
            <SkeletonRows rows={rows} />
        </div>
    );
}
