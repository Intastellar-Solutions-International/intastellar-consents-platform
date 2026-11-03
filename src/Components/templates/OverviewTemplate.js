/**
 * Overview page template: needs-attention panel first, then a KPI strip,
 * then the main chart, then anything else (children).
 * attention: <AttentionPanel/>; kpis: array of <KpiTile/>; main: a Card.
 * Each slot loads independently — pass each its own loading/error state.
 */
export default function OverviewTemplate({ attention, kpis, main, children, className = "" }) {
    return (
        <div className={`tw-flex tw-flex-col tw-gap-6 tw-w-full tw-min-w-0 ${className}`}>
            {attention}
            {kpis && kpis.length > 0 && (
                <section aria-label="Key figures" className="tw-grid tw-gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                    {kpis}
                </section>
            )}
            {main}
            {children}
        </div>
    );
}
