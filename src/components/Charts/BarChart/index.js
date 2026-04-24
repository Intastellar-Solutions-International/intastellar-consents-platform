const { useEffect, useRef } = React;
import "../Line/Style.css";

/*
 * BarChart renders an AnyChart horizontal-bar chart into a DOM node with
 * a *per-instance* id. The previous version hard-coded `id="bar-chart"`,
 * so rendering two BarCharts on the same page collided on the same
 * container. Generating a unique id via `useRef` lets parents stack
 * multiple bars (e.g. top campaigns / top countries / top paths on the
 * marketing dashboard) without DOM collisions.
 *
 * Props:
 *  - data:     array of {x, value} items (AnyChart "name/value" shape also accepted)
 *  - title:    optional chart title rendered above the container
 *  - xTitle:   optional label for the category axis
 *  - yTitle:   optional label for the numeric axis
 *  - fill:     optional bar fill color (defaults to the platform gold)
 *  - tooltipFormat: optional AnyChart tooltip format string
 */
export default function BarChart({
    data,
    title,
    xTitle = "",
    yTitle = "",
    fill = "#C09F53",
    tooltipFormat = "{%Value}",
    chartCard = false,
}) {
    const chartDomId = useRef(
        `bar-chart-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())}`
    ).current;

    useEffect(() => {
        anychart.onDocumentReady(function () {
            const el = document.getElementById(chartDomId);
            if (el) {
                el.innerHTML = "";
            }
            if (data == null) return;
            const dataSet = anychart.data.set(data);
            const chart = anychart.bar();
            chart.background().fill("transparent");
            if (xTitle) chart.xAxis().title(xTitle);
            if (yTitle) chart.yAxis().title(yTitle);
            chart.title().fontColor("#626262");
            chart.animation(true);
            chart.padding([10, 20, 5, 20]);
            chart.tooltip().titleFormat(function () {
                return "";
            });
            chart.tooltip().format(tooltipFormat);
            chart.xScale().mode("continuous");
            const series = chart.bar(dataSet);
            series.normal().stroke(fill);
            series.normal().fill(fill);
            chart.container(chartDomId);
            chart.draw();
        });
    }, [data, chartDomId, xTitle, yTitle, fill, tooltipFormat]);

    return (
        <div className={(chartCard ? "chart-card chart-card--horizontal" : "widget no-padding")}>
            {title ? <h2>{title}</h2> : null}
            <div className="chart" id={chartDomId}></div>
        </div>
    );
}
