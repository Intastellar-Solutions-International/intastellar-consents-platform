/**
 * List page template: summary line, filter bar, dense table, pagination,
 * a side drawer for the selected row, and bulk actions that stay pinned to
 * the bottom of the viewport while rows are selected.
 *
 * summary: short text/node above the filters (counts)
 * filters: <FilterBar/>; children: the <Table/> (inside a Card)
 * pagination: <Pagination/>; drawer: <Drawer/>
 * bulk: { count, actions } — rendered only when count > 0
 */
export default function ListTemplate({ summary, filters, children, pagination, drawer, bulk, className = "" }) {
    return (
        <div className={`tw-flex tw-flex-col tw-gap-2 tw-w-full tw-min-w-0 ${className}`}>
            {summary && <div className="tw-text-sm tw-text-text-muted">{summary}</div>}
            {filters}
            {children}
            {pagination}
            {bulk && bulk.count > 0 && (
                <div role="region" aria-label="Bulk actions" className="tw-sticky tw-bottom-0 tw-z-20 tw-flex tw-items-center tw-justify-between tw-gap-3 tw-px-4 tw-py-3 tw-rounded-lg tw-bg-bg-raised tw-border tw-border-solid tw-border-border tw-shadow-lg">
                    <span aria-live="polite" className="tw-text-sm tw-text-text-primary tw-font-semibold">{bulk.count} selected</span>
                    <div className="tw-flex tw-items-center tw-gap-2">{bulk.actions}</div>
                </div>
            )}
            {drawer}
        </div>
    );
}
