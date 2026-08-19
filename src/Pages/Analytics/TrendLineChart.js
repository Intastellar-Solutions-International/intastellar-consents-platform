const { useMemo } = React;

// Hand-rolled SVG line chart — kept consistent with DailyChart (index.js)
// and the rest of the dashboard's inline-SVG charts, rather than pulling in
// AnyChart just for one panel. Trimmed to what ConversionsOverview.js's
// "Conversion trend" panel actually needs: a single series + optional
// summary chips. No compare-period overlay or range controls (unlike
// components/Charts/Line, which still backs the CMP/Marketing dashboards).
export default function TrendLineChart({ data, title, showInsights = false, height = 260 }) {
    const series = data || [];

    const W = 900, H = height, PAD = { t: 16, r: 16, b: 30, l: 44 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    const maxVal = Math.max(...series.map(d => Number(d.num) || 0), 1);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

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
                                fontSize="10" fill="rgba(160,160,160,0.6)">{v}</text>
                        </g>
                    );
                })}

                <path d={areaPath} fill="rgba(192,159,83,0.12)" stroke="none" />
                <path d={linePath} fill="none" stroke="rgba(192,159,83,0.85)" strokeWidth="2" />

                {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="rgba(192,159,83,0.95)">
                        <title>{p.d.date}: {(Number(p.d.num) || 0).toLocaleString("de-DE")}</title>
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
                        Total: <b>{insights.total.toLocaleString("de-DE")}</b>
                    </span>
                    <span className="sa-trend-insights__chip">
                        Avg/day: <b>{Math.round(insights.avg).toLocaleString("de-DE")}</b>
                    </span>
                    <span className="sa-trend-insights__chip">
                        Peak: <b>{(Number(insights.peak.num) || 0).toLocaleString("de-DE")} ({(insights.peak.date || "").slice(5)})</b>
                    </span>
                </div>
            )}
        </div>
    );
}
