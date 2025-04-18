const { useState, useEffect, useRef, useContext } = React;
import { use } from "i18next";
import "../Line/Style.css";

export default function BarChart({ data, title, fromDate, toDate }) {
    const dailyData = data;

    useEffect(() => {

        anychart.onDocumentReady(function () {
            // The main JS line charting code will be here.
            let dataSet = anychart.data.set(dailyData);
            if (dataSet.oc != dailyData) {
                document.getElementById("bar-chart").innerHTML = "";
            }
            let chart = anychart.bar(dailyData);
            chart.background().fill("transparent");
            chart.xAxis().title("Device");


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