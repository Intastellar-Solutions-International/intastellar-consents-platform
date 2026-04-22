const { useEffect, useRef } = React;
import "../Line/Style.css";

/*
 * Pie renders an AnyChart pie in a DOM node with a *per-instance* id.
 * Previously the component hard-coded `id="pie-chart"`, which meant two
 * Pie components on the same page collided on the same container and the
 * second one silently overwrote the first. The unique id is generated
 * once per mount via `useRef` so the draw effect can target exactly this
 * instance — and so parents can render as many pies as they need (e.g.
 * the marketing dashboard channel view).
 */
export default function Pie({ data, title }) {
    const chartDomId = useRef(
        `pie-chart-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())}`
    ).current;

    useEffect(() => {
        anychart.onDocumentReady(function () {
            const el = document.getElementById(chartDomId);
            if (el) {
                el.innerHTML = "";
            }
            if (data == null) return;
            const chart = anychart.pie(data);
            chart.background().fill("transparent");
            chart.radius("90%");
            chart.container(chartDomId);
            chart.draw();
        });
    }, [data, chartDomId]);

    return (
        <div className={"widget no-padding"}>
            {title ? <h2>{title}</h2> : null}
            <div className="chart" id={chartDomId}></div>
        </div>
    );
}
