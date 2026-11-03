import Button from "./Button.js";
import { formatNumber } from "../../Functions/format.js";

/**
 * Pagination — visible page controls for a list.
 * page (0-based), pageSize, total (null when unknown), onChange(page)
 * hasMore: when total is unknown (data loads in batches), Next stays enabled
 *          while more can be fetched.
 */
export default function Pagination({ page, pageSize, total, hasMore = false, onChange, label = "Pagination" }) {
    const pageCount = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
    const first = total === 0 ? 0 : page * pageSize + 1;
    const last = total != null ? Math.min(total, (page + 1) * pageSize) : (page + 1) * pageSize;
    const canNext = pageCount != null ? page < pageCount - 1 : hasMore;
    return (
        <nav aria-label={label} className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-py-3 tw-text-sm tw-text-text-muted">
            <span aria-live="polite" className="tw-tabular-nums">
                {total != null
                    ? `Showing ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)}`
                    : `Showing ${formatNumber(first)}–${formatNumber(last)}`}
            </span>
            <div className="tw-flex tw-items-center tw-gap-2">
                <Button size="sm" variant="secondary" icon="chevron-left" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</Button>
                {pageCount != null && <span className="tw-tabular-nums">Page {formatNumber(page + 1)} of {formatNumber(pageCount)}</span>}
                <Button size="sm" variant="secondary" iconRight="chevron-right" disabled={!canNext} onClick={() => onChange(page + 1)}>Next</Button>
            </div>
        </nav>
    );
}
