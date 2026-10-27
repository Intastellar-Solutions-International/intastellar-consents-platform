/**
 * Compact single-row page header — docs/design-audit-plan.md Phase 1,
 * built for Phase 3's "compact the sticky header (single row: title, date
 * range, compare toggle, view switch)" requirement.
 *
 * Deliberately NOT a replacement for src/Components/Header/Sticky/index.js
 * (StickyPageTitle) — that component is shared across the whole app (CMP
 * pages too, not just Analytics), has its own scroll-driven sticky
 * behavior and date-range picker wired into routing, and redesigning it is
 * out of scope for an Analytics-dashboard visual pass. This is a parallel,
 * Analytics-only layout shell: it provides the compact single-row slots
 * (title, view switch, date-range control, actions) without reimplementing
 * date-picking logic — the actual Filter component (or whatever a page
 * already uses for its date range) is passed in as `dateRange`, not
 * rebuilt here. Wiring individual Analytics pages onto this in place of
 * StickyPageTitle is Phase 3/6 rollout work, not this commit.
 */
export default function PageHeader({ title, subtitle, viewSwitch, dateRange, actions, loading, children, className }) {
    return (
        <div className={"sa-page-header" + (className ? " " + className : "")}>
            {loading && <div className="sa-page-header__loading-bar" aria-hidden="true" />}
            <div className="sa-page-header__row">
                <div className="sa-page-header__title-group">
                    <h1 className="sa-page-header__title">{title}</h1>
                    {subtitle && <span className="sa-page-header__subtitle">{subtitle}</span>}
                </div>
                {viewSwitch && <div className="sa-page-header__view-switch">{viewSwitch}</div>}
                {(dateRange || actions) && (
                    <div className="sa-page-header__controls">
                        {dateRange}
                        {actions}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}
