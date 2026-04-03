import { useEffect, useRef } from "react";
import {
    WORLD_TOPO_URL,
    projectMercator,
    ringToPathD,
    topoToFeatures,
} from "./worldTopoShared.js";

const CALIFORNIA = [
    [-124.4, 42.0], [-120.0, 42.0], [-120.0, 39.0], [-114.6, 35.0],
    [-114.6, 32.5], [-117.1, 32.5], [-118.5, 34.0], [-120.5, 34.5],
    [-122.4, 37.5], [-124.2, 38.8], [-124.4, 42.0],
];

const LABELS = [
    [-96, 50, "Canada", "#c8e8c8", 10],
    [-96, 38, "United States", "#c8e8c8", 10],
    [-119.5, 36.5, "California", "#ffe090", 9],
    [-55, -10, "Brazil", "#a0ffb8", 12],
    [-65, -35, "Argentina", "#c8e8c8", 9],
    [15, 52, "Europe", "#c8e8c8", 10],
    [22, 5, "Africa", "#c8e8c8", 11],
    [60, 60, "Russia", "#c8e8c8", 10],
    [80, 22, "India", "#c8e8c8", 9],
    [105, 35, "China", "#c8e8c8", 10],
    [138, 37, "Japan", "#c8e8c8", 8],
    [134, -25, "Australia", "#c8e8c8", 10],
];

export default function WorldMap({ width = "100%", className = "" }) {
    const svgRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const res = await fetch(WORLD_TOPO_URL);
                const topo = await res.json();
                if (cancelled) return;

                const features = topoToFeatures(topo, "countries");
                const svg = svgRef.current;
                if (!svg) return;

                const ns = "http://www.w3.org/2000/svg";
                const countriesG = svg.querySelector("#wm-countries");
                const highlightsG = svg.querySelector("#wm-highlights");
                const labelsG = svg.querySelector("#wm-labels");

                for (const f of features) {
                    const d = f.rings.map(ringToPathD).join(" ");
                    if (!d.trim()) continue;
                    const path = document.createElementNS(ns, "path");
                    path.setAttribute("d", d);
                    path.setAttribute("stroke", "#0a1929");
                    path.setAttribute("stroke-width", "0.4");

                    if (f.id == 76) {
                        path.setAttribute("fill", "#4fc87a");
                        path.setAttribute("opacity", "0.92");
                        highlightsG.appendChild(path);
                    } else {
                        path.setAttribute("fill", "#2a5c38");
                        countriesG.appendChild(path);
                    }
                }

                const calD =
                    CALIFORNIA.map((c, i) => {
                        const [x, y] = projectMercator(c[0], c[1]);
                        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(" ") + "Z";
                const calPath = document.createElementNS(ns, "path");
                calPath.setAttribute("d", calD);
                calPath.setAttribute("fill", "#f0a030");
                calPath.setAttribute("stroke", "#0a1929");
                calPath.setAttribute("stroke-width", "0.5");
                calPath.setAttribute("opacity", "0.92");
                highlightsG.appendChild(calPath);

                const [, eqY] = projectMercator(0, 0);
                const eq = document.createElementNS(ns, "line");
                eq.setAttribute("x1", "0");
                eq.setAttribute("x2", "2000");
                eq.setAttribute("y1", eqY);
                eq.setAttribute("y2", eqY);
                eq.setAttribute("stroke", "#1e5a8e");
                eq.setAttribute("stroke-width", "0.7");
                eq.setAttribute("stroke-dasharray", "5,4");
                eq.setAttribute("opacity", "0.6");
                labelsG.appendChild(eq);

                for (const [lon, lat, text, color, size] of LABELS) {
                    const [x, y] = projectMercator(lon, lat);
                    const el = document.createElementNS(ns, "text");
                    el.setAttribute("x", x);
                    el.setAttribute("y", y);
                    el.setAttribute("fill", color);
                    el.setAttribute("font-size", size);
                    el.setAttribute("font-family", "sans-serif");
                    el.setAttribute("font-weight", "600");
                    el.setAttribute("text-anchor", "middle");
                    el.setAttribute("pointer-events", "none");
                    el.textContent = text;
                    labelsG.appendChild(el);
                }

                [
                    [20, "#4fc87a", "Brazil"],
                    [90, "#f0a030", "California"],
                ].forEach(([x, col, lbl]) => {
                    const r = document.createElementNS(ns, "rect");
                    r.setAttribute("x", x);
                    r.setAttribute("y", 482);
                    r.setAttribute("width", 12);
                    r.setAttribute("height", 10);
                    r.setAttribute("rx", 2);
                    r.setAttribute("fill", col);
                    labelsG.appendChild(r);

                    const t = document.createElementNS(ns, "text");
                    t.setAttribute("x", x + 16);
                    t.setAttribute("y", 491);
                    t.setAttribute("fill", "#c8e8c8");
                    t.setAttribute("font-size", "9");
                    t.setAttribute("font-family", "sans-serif");
                    t.textContent = lbl;
                    labelsG.appendChild(t);
                });
            } catch (err) {
                console.error("WorldMap: failed to load map data", err);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <svg
            ref={svgRef}
            width={width}
            viewBox="0 0 2000 500"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: "block", background: "#0a1929", borderRadius: 8 }}
        >
            <rect width="2000" height="500" fill="#0a1929" />
            <g id="wm-countries" />
            <g id="wm-highlights" />
            <g id="wm-labels" />
        </svg>
    );
}
