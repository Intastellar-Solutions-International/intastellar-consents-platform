/**
 * Skeletons shaped like the content they stand in for, so the layout doesn't
 * jump when data arrives. Each preset is announced once as "Loading …";
 * the shimmer is off under prefers-reduced-motion.
 */
const BLOCK = "tw-block tw-bg-white/10 tw-rounded-md motion-safe:tw-animate-pulse";

export default function Skeleton({ className = "" }) {
    return <span aria-hidden="true" className={`${BLOCK} ${className}`} />;
}

function Loading({ label, className = "", children }) {
    return (
        <div role="status" className={className}>
            <span className="tw-sr-only">{label}</span>
            {children}
        </div>
    );
}

export function SkeletonText({ lines = 3, label = "Loading…" }) {
    return (
        <Loading label={label} className="tw-flex tw-flex-col tw-gap-2">
            {Array.from({ length: lines }, (_, i) => (
                <Skeleton key={i} className={`tw-h-3 ${i === lines - 1 ? "tw-w-2/3" : "tw-w-full"}`} />
            ))}
        </Loading>
    );
}

/** Same footprint as <KpiTile>: label, big value, delta line. */
export function SkeletonKpiTile({ label = "Loading metric…" }) {
    return (
        <Loading label={label} className="tw-flex tw-flex-col tw-gap-3 tw-p-5 tw-rounded-xl tw-bg-bg-raised tw-border tw-border-solid tw-border-border-subtle">
            <Skeleton className="tw-h-3 tw-w-1/3" />
            <Skeleton className="tw-h-8 tw-w-1/2" />
            <Skeleton className="tw-h-3 tw-w-1/4" />
        </Loading>
    );
}

/** Rows of a dense <Table>: one bar per column. */
export function SkeletonTableRows({ rows = 6, columns = 4, label = "Loading rows…" }) {
    return (
        <Loading label={label} className="tw-flex tw-flex-col">
            {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="tw-grid tw-gap-4 tw-px-3 tw-py-3 tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                    {Array.from({ length: columns }, (_, c) => <Skeleton key={c} className={`tw-h-3 ${c === 0 ? "tw-w-3/4" : "tw-w-1/2"}`} />)}
                </div>
            ))}
        </Loading>
    );
}

/** A card with a title and a chart/body area. */
export function SkeletonCard({ height = 160, label = "Loading…" }) {
    return (
        <Loading label={label} className="tw-flex tw-flex-col tw-gap-4 tw-p-5 tw-rounded-xl tw-bg-bg-raised tw-border tw-border-solid tw-border-border-subtle">
            <Skeleton className="tw-h-4 tw-w-1/3" />
            <span aria-hidden="true" className="tw-block tw-w-full tw-bg-white/10 tw-rounded-md motion-safe:tw-animate-pulse" style={{ height }} />
        </Loading>
    );
}
