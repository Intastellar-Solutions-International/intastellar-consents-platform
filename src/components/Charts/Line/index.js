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
            chart.tooltip().format(title + ": {%Value}");
            chart.xScale().mode("continuous");

            const series1 = chart.line(mapping);
            series1.name("Current period");
            series1.normal().stroke("#C09F53");
            series1.hovered().stroke("#C09F53", 2, "10 5", "round");
            series1.selected().stroke("#C09F53", 4, "10 5", "round");

            if (compareEnabled && hasComparePoints && dailyData2.length > 0) {
                const dataSet2 = anychart.data.set(dailyData2);
                const series2 = chart.line(dataSet2.mapAs({ x: "name", value: "domain" }));
                series2.name("Comparison period");
                series2.normal().stroke("rgb(220, 209, 154)", 1, "8 4", "round");
                series2.hovered().stroke("#C09F53", 2, "10 5", "round");
                series2.selected().stroke("#C09F53", 4, "10 5", "round");
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