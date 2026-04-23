const { useEffect, useMemo, useRef, useState } = React;
import "./Style.css";

function formatXLabel(d, fromDate, toDate) {
    const t = new Date(d?.date);
    if (!Number.isFinite(t.getTime())) return "";
    return fromDate === toDate
        ? new Intl.DateTimeFormat("de-DE", { hour: "numeric", minute: "numeric" }).format(t)
        : new Intl.DateTimeFormat("de-DE").format(t);
}

function formatMetric(value) {
    return new Intl.NumberFormat("de-DE").format(Number(value) || 0);
}

function formatPeakDate(rawDate, fallbackLabel) {
    const t = new Date(rawDate);
    if (!Number.isFinite(t.getTime())) return fallbackLabel || "—";
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(t);
}

export default function Line({
    data,
    data2,
    title,
    fromDate,
    toDate,
    compareEnabled = false,
    showInsights = false,
    showRangeControls = false,
}) {
    const chartDomId = useRef(
        `line-chart-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`
    ).current;
    const [windowSize, setWindowSize] = useState("all");

    const series = data ?? [];
    const compareSeries = data2 ?? series;

    const dailyData = useMemo(
        () =>
            series.map((d) => ({
                name: formatXLabel(d, fromDate, toDate),
                rawDate: d?.date,
                domain: Number(d?.num) || 0,
            })),
        [series, fromDate, toDate]
    );

    // Same x-axis as current period (day in range); y = aligned baseline count from API previousPeriod
    const dailyData2 = useMemo(
        () =>
            compareSeries.map((d) => {
                const prev = d?.previousPeriod;
                const n = prev != null && prev.num != null ? Number(prev.num) : null;
                return {
                    name: formatXLabel(d, fromDate, toDate),
                    rawDate: d?.date,
                    domain: Number.isFinite(n) ? n : 0,
                };
            }),
        [compareSeries, fromDate, toDate]
    );

    const visibleDailyData = useMemo(() => {
        if (windowSize === "all") return dailyData;
        const n = Number(windowSize);
        if (!Number.isFinite(n) || n <= 0) return dailyData;
        return dailyData.slice(-n);
    }, [dailyData, windowSize]);

    const visibleStartIndex = Math.max(0, dailyData.length - visibleDailyData.length);
    const visibleDailyData2 = useMemo(
        () => dailyData2.slice(visibleStartIndex),
        [dailyData2, visibleStartIndex]
    );

    const hasComparePoints = useMemo(
        () =>
            compareSeries.some(
                (d) =>
                    d?.previousPeriod != null &&
                    d.previousPeriod.num != null &&
                    Number.isFinite(Number(d.previousPeriod.num))
            ),
        [compareSeries]
    );

    const insights = useMemo(() => {
        if (visibleDailyData.length === 0) return null;
        const total = visibleDailyData.reduce((sum, d) => sum + (Number(d.domain) || 0), 0);
        const avg = total / visibleDailyData.length;
        const peak = visibleDailyData.reduce(
            (best, point) => (point.domain > best.domain ? point : best),
            visibleDailyData[0]
        );
        const compareTotal = visibleDailyData2.reduce((sum, d) => sum + (Number(d.domain) || 0), 0);
        const deltaPct = compareTotal > 0 ? ((total - compareTotal) / compareTotal) * 100 : null;
        return {
            total,
            avg,
            peakValue: peak.domain,
            peakDate: formatPeakDate(peak.rawDate, peak.name),
            compareTotal,
            deltaPct,
        };
    }, [visibleDailyData, visibleDailyData2]);

    useEffect(() => {
        anychart.onDocumentReady(function () {
            const el = document.getElementById(chartDomId);
            if (el) {
                el.innerHTML = "";
            }

            const dataSet = anychart.data.set(visibleDailyData);
            const mapping = dataSet.mapAs({ x: "name", value: "domain" });

            const chart = anychart.line();
            chart.background().fill("transparent");
            chart.xAxis().title(fromDate === toDate ? "Time" : "Day");
            chart.yAxis().title(title);
            chart.xScale().mode("continuous");
            chart.animation(true);
            chart.yScale().minimum(0);

            const interactivity = chart.interactivity?.();
            if (interactivity?.hoverMode) interactivity.hoverMode("by-x");
            if (interactivity?.zoomOnMouseWheel) interactivity.zoomOnMouseWheel(true);
            if (interactivity?.scrollOnMouseWheel) interactivity.scrollOnMouseWheel(true);

            const crosshair = chart.crosshair?.();
            if (crosshair?.enabled) crosshair.enabled(true);
            if (crosshair?.xStroke) crosshair.xStroke("#8f7f57", 1, "3 3");
            if (crosshair?.yStroke) crosshair.yStroke("#4a4a56", 1, "3 3");

            const compareActive = compareEnabled && hasComparePoints && visibleDailyData2.length > 0;
            const currentStroke = "#C09F53";
            const compareStroke = "#6eb3e0";
            const compareStrokeHover = "#9ad4ff";

            const tooltip = chart.tooltip();
            tooltip.useHtml(true);
            tooltip.fontSize(12);
            tooltip.fontColor("#f0f0f5");

            if (compareActive) {
                tooltip.displayMode("union");
                tooltip.titleFormat("<span style=\"color:#c4c4cc;font-weight:600\">{%x}</span>");
                tooltip.separator(true);
                chart.legend().enabled(true);
                chart.legend().position("bottom");
                chart.legend().align("center");
                chart.legend().itemsLayout("horizontal");
                chart.legend().fontSize(11);
                chart.legend().fontColor("#e8e8ee");
                chart.legend().padding(10, 0, 0, 0);
                chart.legend().iconSize(10);
            } else {
                tooltip.displayMode("single");
                tooltip.titleFormat(false);
                tooltip.format(
                    "<span style=\"color:#C09F53;font-weight:600\">" +
                        title +
                        "</span><br/><b>{%value}</b>"
                );
                chart.legend().enabled(false);
            }

            const series1 = chart.line(mapping);
            series1.name("Current period");
            series1.normal().stroke(currentStroke);
            series1.hovered().stroke(currentStroke, 2, "10 5", "round");
            series1.selected().stroke(currentStroke, 4, "10 5", "round");
            series1.markers().enabled(true);
            series1.markers().size(2.8);
            series1.hovered().markers().enabled(true);
            series1.hovered().markers().size(4.2);
            if (compareActive) {
                series1.legendItem().iconType("circle");
                series1.legendItem().iconFill(currentStroke);
                series1.tooltip().format(
                    "<span style=\"color:" +
                        currentStroke +
                        ";font-weight:700\">Current period</span>" +
                        " · <b>{%value}</b>"
                );
            }

            if (compareActive) {
                const dataSet2 = anychart.data.set(visibleDailyData2);
                const series2 = chart.line(dataSet2.mapAs({ x: "name", value: "domain" }));
                series2.name("Comparison period");
                series2.normal().stroke(compareStroke, 1.5, "6 4", "round");
                series2.hovered().stroke(compareStrokeHover, 2.5, "6 4", "round");
                series2.selected().stroke(compareStrokeHover, 4, "6 4", "round");
                series2.markers().enabled(true);
                series2.markers().size(2.4);
                series2.hovered().markers().enabled(true);
                series2.hovered().markers().size(3.8);
                series2.legendItem().iconType("circle");
                series2.legendItem().iconFill(compareStroke);
                series2.tooltip().format(
                    "<span style=\"color:" +
                        compareStroke +
                        ";font-weight:700\">Comparison period</span>" +
                        " · <b>{%value}</b>"
                );
            }

            chart.container(chartDomId);
            if (data != null && visibleDailyData.length > 0) {
                chart.draw();
            }
        });
    }, [
        visibleDailyData,
        visibleDailyData2,
        hasComparePoints,
        compareEnabled,
        chartDomId,
        data,
        fromDate,
        toDate,
        title,
    ]);

    return (
        <div className={"no-padding"}>
            {showInsights && insights ? (
                <div className="line-chart__insights" aria-label="Displayed line chart summary">
                    <span className="line-chart__insight-chip">
                        Total: <b>{formatMetric(insights.total)}</b>
                    </span>
                    <span className="line-chart__insight-chip">
                        Avg/day: <b>{formatMetric(Math.round(insights.avg))}</b>
                    </span>
                    <span className="line-chart__insight-chip">
                        Peak:{" "}
                        <b>
                            {formatMetric(insights.peakValue)} ({insights.peakDate})
                        </b>
                    </span>
                    {compareEnabled && insights.deltaPct != null ? (
                        <span
                            className={`line-chart__insight-chip ${
                                insights.deltaPct >= 0
                                    ? "line-chart__insight-chip--up"
                                    : "line-chart__insight-chip--down"
                            }`}
                        >
                            Vs compare: <b>{insights.deltaPct >= 0 ? "+" : ""}{insights.deltaPct.toFixed(1)}%</b>
                        </span>
                    ) : null}
                </div>
            ) : null}
            {showRangeControls ? (
                <div className="line-chart__controls" role="group" aria-label="Trend range">
                    <button
                        type="button"
                        className={`line-chart__control-btn ${windowSize === "7" ? "is-active" : ""}`}
                        onClick={() => setWindowSize("7")}
                    >
                        7d
                    </button>
                    <button
                        type="button"
                        className={`line-chart__control-btn ${windowSize === "30" ? "is-active" : ""}`}
                        onClick={() => setWindowSize("30")}
                    >
                        30d
                    </button>
                    <button
                        type="button"
                        className={`line-chart__control-btn ${windowSize === "all" ? "is-active" : ""}`}
                        onClick={() => setWindowSize("all")}
                    >
                        All
                    </button>
                </div>
            ) : null}
            <div className="chart" id={chartDomId} />
        </div>
    );
}