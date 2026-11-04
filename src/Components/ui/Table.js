import { Icon } from "./icons.js";
import EmptyState from "./EmptyState.js";
import ErrorState from "./ErrorState.js";
import { SkeletonTableRows } from "./Skeleton.js";
import { t } from "../../i18n/index.js";

/**
 * Table — dense data table.
 *
 * columns: [{ key, header, align: "left"|"right", width, sortable, render(row) }]
 * rows, getRowKey(row)
 * sort: { key, direction: "asc"|"desc" } + onSortChange(key) — headers get aria-sort
 * onRowClick(row): rows become focusable; Enter/Space activate (e.g. open a Drawer)
 * selectedKey: highlights the row whose details are open
 * states: loading (skeleton rows), error ({ message, onRetry }), empty ({ title, message })
 * caption: accessible name for the table (visually hidden)
 */
export default function Table({
    columns, rows = [], getRowKey = (r, i) => i, sort, onSortChange, onRowClick, selectedKey,
    loading = false, error, empty = { title: t("No results"), message: t("Nothing matches the current filters.") },
    caption, stickyHeader = true, className = "",
}) {
    if (loading) return <SkeletonTableRows columns={Math.min(columns.length, 6)} />;
    if (error) return <ErrorState title={error.title || t("Couldn't load the table")} message={error.message} onRetry={error.onRetry} />;
    if (!rows.length) return <EmptyState compact title={empty.title} message={empty.message} action={empty.action} />;

    const ariaSort = (col) => (sort && sort.key === col.key ? (sort.direction === "asc" ? "ascending" : "descending") : col.sortable ? "none" : undefined);
    return (
        <div className={`tw-w-full tw-overflow-x-auto ${className}`}>
            <table className="tw-w-full tw-border-collapse tw-text-sm tw-text-text-secondary">
                {caption && <caption className="tw-sr-only">{caption}</caption>}
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                scope="col"
                                aria-sort={ariaSort(col)}
                                style={col.width ? { width: col.width } : undefined}
                                className={`${stickyHeader ? "tw-sticky tw-top-0 tw-z-10" : ""} tw-bg-bg-raised tw-px-3 tw-py-2 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-text-muted tw-border-0 tw-border-b tw-border-solid tw-border-border ${col.align === "right" ? "tw-text-right" : "tw-text-left"}`}
                            >
                                {col.sortable && onSortChange ? (
                                    <button
                                        type="button"
                                        onClick={() => onSortChange(col.key)}
                                        className="tw-inline-flex tw-items-center tw-gap-1 tw-p-0 tw-border-0 tw-bg-transparent tw-font-semibold tw-uppercase tw-tracking-wide tw-text-xs tw-text-text-muted tw-cursor-pointer hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm"
                                    >
                                        {col.header}
                                        {sort && sort.key === col.key
                                            ? <Icon name={sort.direction === "asc" ? "arrow-up" : "arrow-down"} size={12} />
                                            : <Icon name="chevron-down" size={12} className="tw-opacity-40" />}
                                    </button>
                                ) : col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => {
                        const key = getRowKey(row, i);
                        const selected = selectedKey != null && key === selectedKey;
                        const interactive = Boolean(onRowClick);
                        return (
                            <tr
                                key={key}
                                tabIndex={interactive ? 0 : undefined}
                                aria-selected={interactive ? selected : undefined}
                                onClick={interactive ? () => onRowClick(row) : undefined}
                                onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                                className={`tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle ${interactive ? "tw-cursor-pointer hover:tw-bg-white/5 focus-visible:tw-outline-none focus-visible:tw-shadow-focus" : ""} ${selected ? "tw-bg-accent-subtle" : ""}`}
                            >
                                {columns.map((col) => (
                                    <td key={col.key} className={`tw-px-3 tw-py-2 tw-align-middle ${col.align === "right" ? "tw-text-right tw-tabular-nums" : ""}`}>
                                        {col.render ? col.render(row) : row[col.key] ?? "—"}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
