const { useState, useEffect, useRef, useContext } = React;
import { use } from "i18next";
import "../Line/Style.css";

export default function BarChart({ data, data2, title, fromDate, toDate }) {
    const dailyData = data;

    useEffect(() => {

        anychart.onDocumentReady(function () {
            // The main JS line charting code will be here.
            let dataSet = anychart.data.set(dailyData);
            let dataSet2 = anychart.data.set(data2);
            if (dataSet.oc != dailyData) {
                document.getElementById("bar-chart").innerHTML = "";
            }

            let chart = anychart.bar();

            chart.background().fill("transparent");
            chart.xAxis().title("Number of users");
            chart.tooltip().format("{%Value}%");
            chart.xScale().mode("continuous");

            const series = chart.bar(dataSet2);

            /* series.name("Current Period"); */
            series.normal().stroke("#C09F53");
            series.normal().fill("#C09F53");
            series.hovered().stroke("#C09F53", 2, "10 5", "round");
            series.selected().stroke("#C09F53", 4, "10 5", "round");

            // Loop through all document.getElementById("pie-chart") elements
            // and set the chart container to the container for each element
            chart.container("bar-chart");

            if (data !== null || data !== undefined) {
                chart.draw();
            }
        });
    }, [dailyData]);

    return (
        <div className={"widget no-padding"}>
            {
                (title) ? <h2>{title}</h2> : null
            }
            <div className="chart" id="bar-chart">
            </div>
        </div>
    )
}