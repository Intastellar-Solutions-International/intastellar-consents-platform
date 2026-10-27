const { useMemo } = React;
import { formatCount, toIsoDate } from "./_shared.js";

// docs/design-audit-plan.md Phase 2 item 7: the backing `daily`-shaped
// queries (api/analytics-report.js and friends) only produce a row for
// days that actually had events — a GROUP BY with no zero-fill join
// against the full date range. A day with zero events simply doesn't
// exist as a row, which silently broke two things here: "Avg/day" divided
// by `series.length` (active days, not days in the range — see
// docs/analytics-audit-plan.md Phase 0), and a sparse period (e.g. 3
// active days in 30) rendered as a connected line across only those 3
// points, evenly spaced, as if they were consecutive days.
//
// Fixing this in the backend SQL would mean changing a query — out of
// scope for a presentation-only pass. This reindexes the already-fetched
// series against the full requested range, inserting explicit zeros for
// missing days, entirely client-side. `fromDate`/`toDate` are optional:
// omit them and this is a no-op (the series renders exactly as before) —
// every current caller already has these from useAnalyticsPageChrome(),
// so there's no reason not to pass them, but nothing breaks for a
// hypothetical caller that doesn't.
function zeroFillSeries(series, fromDate, toDate) {
    if (!fromDate || !toDate) return series || [];
    const byDate = new Map((series || []).map(d => [d.date, d]));
    const out = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
        const key = toIsoDate(cursor);
        out.push(byDate.get(key) || { date: key, num: 0 });
        cursor.setDate(cursor.getDate() + 1);
    }
    return out;
}

// Proper "nice ticks" generation — the previous [0,.25,.5,.75,1].map(f =>
// Math.round(maxVal*f)) independently rounded each fraction, which skips
// or duplicates values for small ranges (e.g. maxVal=5 produced
// [0,1,3,4,5] — no "2"). This picks a round step size (1/2/5 × a power of
// 10) first, then derives evenly-spaced ticks from it — standard
// chart-axis behavior. Returns at least [0, 1] so a maxVal of 0 still
// renders a sane two-tick axis instead of a single "0".
export function niceTicks(maxVal, targetCount = 5) {
    if (!Number.isFinite(maxVal) || maxVal <= 0) return [0, 1];
    const rawStep = maxVal / targetCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;
    const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
    const step = niceResidual * magnitude;
    // Walk past maxVal by one more step rather than stopping at/before it —
    // a `v <= maxVal` style condition can leave the last tick short of the
    // actual data peak (e.g. maxVal=413 would stop at 400), which would
    // clip the plotted line above the topmost gridline.
    const ticks = [0];
    let v = 0;
    while (v < maxVal) {
        v += step;
        ticks.push(Math.round(v));
    }
    return ticks;
}

// Hand-rolled SVG line chart — kept consistent with DailyChart (index.js)
// and the rest of the dashboard's inline-SVG charts, rather than pulling in
// AnyChart just for one panel. Trimmed to what ConversionsOverview.js's
// "Conversion trend" panel actually needs: a single series + optional
// summary chips. No compare-period overlay or range controls (unlike
// components/Charts/Line, which still backs the CMP/Marketing dashboards).
export default function TrendLineChart({ data, fromDate, toDate, title, showInsights = false, height = 260 }) {
    const series = useMemo(() => zeroFillSeries(data, fromDate, toDate), [data, fromDate, toDate]);

    const W = 900, H = height, PAD = { t: 16, r: 16, b: 30, l: 44 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    const rawMax = Math.max(...series.map(d => Number(d.num) || 0), 1);
    const yTicks = useMemo(() => niceTicks(rawMax), [rawMax]);
    // The axis's actual top — the highest tick, not the raw data max — so
    // gridlines and the plotted line share one coordinate scale.
    const maxVal = yTicks[yTicks.length - 1];

    const points = useMemo(() => series.map((d, i) => ({
        x: PAD.l + (series.length > 1 ? (i / (series.length - 1)) * cW : cW / 2),
        y: PAD.t + cH - ((Number(d.num) || 0) / maxVal) * cH,
        d,
    })), [series, maxVal, cW, cH]);

    const linePath = useMemo(
        () => points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" "),
        [points]
    );
    const areaPath = useMemo(() => {
        if (!points.length) return "";
        const base = (PAD.t + cH).toFixed(1);
        return `${linePath} L${points[points.length - 1].x.toFixed(1)},${base} L${points[0].x.toFixed(1)},${base} Z`;
    }, [linePath, points, cH]);

    const insights = useMemo(() => {
        if (!showInsights || !series.length) return null;
        const total = series.reduce((s, d) => s + (Number(d.num) || 0), 0);
        const peak = series.reduce((best, d) => ((Number(d.num) || 0) > (Number(best.num) || 0) ? d : best), series[0]);
        // series.length is now the full requested range (when fromDate/
        // toDate are passed), not just days that happened to have events —
        // see zeroFillSeries above. This is the actual Avg/day fix.
        return { total, avg: total / series.length, peak };
    }, [series, showInsights]);

    const labelIdxs = [0, Math.floor((series.length - 1) / 2), series.length - 1]
        .filter((v, i, a) => v >= 0 && a.indexOf(v) === i);

    if (!series.length) return <div className="sa-chart sa-chart--empty">No data for this period</div>;

    return (
        <div className="sa-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}
                 role="img" aria-label={title ? `${title} trend chart` : "Trend chart"}>
                {yTicks.map((v, i) => {
                    const y = PAD.t + cH - (v / maxVal) * cH;
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                                fontSize="10" fill="rgba(160,160,160,0.6)">{formatCount(v)}</text>
                        </g>
                    );
                })}

                <path d={areaPath} fill="rgba(192,159,83,0.12)" stroke="none" />
                <path d={linePath} fill="none" stroke="rgba(192,159,83,0.85)" strokeWidth="2" />

                {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="rgba(192,159,83,0.95)">
                        <title>{p.d.date}: {formatCount(Number(p.d.num) || 0)}</title>
                    </circle>
                ))}

                {labelIdxs.map(i => (
                    <text key={i} x={points[i].x} y={H - PAD.b + 16}
                        textAnchor="middle" fontSize="10" fill="rgba(160,160,160,0.7)">
                        {(series[i].date || "").slice(5)}
                    </text>
                ))}
            </svg>

            {insights && (
                <div className="sa-trend-insights" aria-label="Displayed line chart summary">
                    <span className="sa-trend-insights__chip">
                        Total: <b>{formatCount(insights.total)}</b>
                    </span>
                    <span className="sa-trend-insights__chip">
                        Avg/day: <b>{formatCount(insights.avg)}</b>
                    </span>
                    <span className="sa-trend-insights__chip">
                        Peak: <b>{formatCount(Number(insights.peak.num) || 0)} ({(insights.peak.date || "").slice(5)})</b>
                    </span>
                </div>
            )}
        </div>
    );
}
