const { useState, useEffect, useRef, useContext } = React;
import "./Style.css";

export default function Line({ data, data2, title, fromDate, toDate }) {
    const dailyData = data?.map((d, i) => {
        return {
            "name": (fromDate === toDate) ? new Intl.DateTimeFormat('de-DE', {
                hour: 'numeric',
                minute: 'numeric',
            }).format(new Date(d.date)) : new Intl.DateTimeFormat('de-DE').format(new Date(d.date)),
            "domain": d.num
        }
    })

    const dailyData2 = data2?.map((d, i) => {
        return {
            "name": (fromDate === toDate) ? new Intl.DateTimeFormat('de-DE', {
                hour: 'numeric',
                minute: 'numeric',
            }).format(new Date(d.previousPeriod.date)) : new Intl.DateTimeFormat('de-DE').format(new Date(d.previousPeriod.date)),
            "domain": d.previousPeriod.num
        }
    })

    useEffect(() => {

        anychart.onDocumentReady(function () {
            // The main JS line charting code will be here.
            let dataSet = anychart.data.set(dailyData);
            const mapping = dataSet.mapAs({ x: "name", value: "domain" });
            if (dataSet.oc != dailyData) {
                document.getElementById("line-chart").innerHTML = "";
            }

            let dataSet2 = anychart.data.set(dailyData2);

            let chart = anychart.line();

            chart.background().fill("transparent");
            chart.xAxis().title("Day");
            chart.yAxis().title(title);
            chart.tooltip().format(title + ": {%Value}");
            chart.xScale().mode("continuous");

            const series = chart.line(mapping);
            const series2 = chart.line(dataSet2.mapAs({ x: "name", value: "domain" }));

            series.name("Current Period");
            series.normal().stroke("#C09F53");
            series.hovered().stroke("#C09F53", 2, "10 5", "round");
            series.selected().stroke("#C09F53", 4, "10 5", "round");

            series2.name("Previous Period");
            series2.normal().stroke("rgb(220,209,154)", 1, "10 5", "round");
            series2.hovered().stroke("#C09F53", 2, "10 5", "round");
            series2.selected().stroke("#C09F53", 4, "10 5", "round");

            chart.container("line-chart");
            if (data !== null) {
                chart.draw();
            }
        });
    }, [dailyData, dailyData2]);

    return (
        <div className={"no-padding"}>
            <div className="chart" id="line-chart">
            </div>
        </div>
    )
}