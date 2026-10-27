import EmptyState from "./EmptyState.js";
import { SkeletonRows } from "./Skeleton.js";

/**
 * Shared data table — docs/design-audit-plan.md Phase 1. New `.sa-data-table`
 * class rather than reusing the existing `.sa-table` (used at 20+ existing
 * call sites, font-sizes below the 13px accessibility floor found in
 * Phase 0) — this component uses the correct type-scale tokens from day
 * one; retrofitting `.sa-table` itself is Phase 6 rollout work.
 *
 * The scroll wrapper (`min-width: 0` + `overflow-x: auto`) is the direct
 * fix for Phase 0's "Top pages/Form performance overflow at ~1100px" finding
 * — a wide table dropped into a CSS Grid cell can force its track wider
 * than the grid intends unless the cell can shrink and the table can
 * scroll internally instead.
 *
 * `columns`: [{ key, label, align: "num"|undefined, render?: (row) => node }]
 * `getRowKey`: (row, index) => string|number — falls back to index.
 */
export default function DataTable({
    columns, rows, getRowKey, loading, skeletonRows = 4, empty, caption, className,
}) {
    if (loading) {
        return (
            <div className={"sa-data-table" + (className ? " " + className : "")}>
                <SkeletonRows rows={skeletonRows} />
            </div>
        );
    }

    if (!rows || !rows.length) {
        return empty
            ? <EmptyState {...empty} />
            : <EmptyState message="No data for this period." />;
    }

    return (
        <div className={"sa-data-table-scroll" + (className ? " " + className : "")}>
            <table className="sa-data-table">
                {caption && <caption className="sa-data-table__caption">{caption}</caption>}
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                scope="col"
                                className={col.align === "num" ? "sa-data-table__num" : undefined}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={getRowKey ? getRowKey(row, i) : i}>
                            {columns.map(col => (
                                <td
                                    key={col.key}
                                    className={col.align === "num" ? "sa-data-table__num" : undefined}
                                >
                                    {col.render ? col.render(row) : row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
