const { useEffect, useRef } = React;
import "./Style.css";

function formatXLabel(d, fromDate, toDate) {
    const t = new Date(d?.date);
    if (!Number.isFinite(t.getTime())) return "";
    return fromDate === toDate
        ? new Intl.DateTimeFormat("de-DE", { hour: "numeric", minute: "numeric" }).format(t)
        : new Intl.DateTimeFormat("de-DE").format(t);
}

export default function Line({ data, data2, title, fromDate, toDate, compareEnabled = false }) {
    const chartDomId = useRef(
        `line-chart-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`
    ).current;

    const series = data ?? [];
    const compareSeries = data2 ?? series;

    const dailyData = series.map((d) => ({
        name: formatXLabel(d, fromDate, toDate),
        domain: Number(d?.num) || 0,
    }));

    // Same x-axis as current period (day in range); y = aligned baseline count from API previousPeriod
    const dailyData2 = compareSeries.map((d) => {
        const prev = d?.previousPeriod;
        const n = prev != null && prev.num != null ? Number(prev.num) : null;
        return {
            name: formatXLabel(d, fromDate, toDate),
            domain: Number.isFinite(n) ? n : 0,
        };
    });

    const hasComparePoints = compareSeries.some(
        (d) => d?.previousPeriod != null && d.previousPeriod.num != null && Number.isFinite(Number(d.previousPeriod.num))
    );

    useEffect(() => {
        anychart.onDocumentReady(function () {
            const el = document.getElementById(chartDomId);
            if (el) {
                el.innerHTML = "";
            }

            const dataSet = anychart.data.set(dailyData);
            const mapping = dataSet.mapAs({ x: "name", value: "domain" });

            const chart = anychart.line();
            chart.background().fill("transparent");
            chart.xAxis().title(fromDate === toDate ? "Time" : "Day");
            chart.yAxis().title(title);
            chart.xScale().mode("continuous");

            const compareActive = compareEnabled && hasComparePoints && dailyData2.length > 0;
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
                const dataSet2 = anychart.data.set(dailyData2);
                const series2 = chart.line(dataSet2.mapAs({ x: "name", value: "domain" }));
                series2.name("Comparison period");
                series2.normal().stroke(compareStroke, 1.5, "6 4", "round");
                series2.hovered().stroke(compareStrokeHover, 2.5, "6 4", "round");
                series2.selected().stroke(compareStrokeHover, 4, "6 4", "round");
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
            if (data != null && dailyData.length > 0) {
                chart.draw();
            }
        });
    }, [dailyData, dailyData2, hasComparePoints, compareEnabled, chartDomId, data, fromDate, toDate, title]);

    return (
        <div className={"no-padding"}>
            <div className="chart" id={chartDomId} />
        </div>
    );
}