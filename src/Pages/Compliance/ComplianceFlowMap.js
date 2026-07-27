import { useEffect, useRef } from "react";
import {
    WORLD_TOPO_URL,
    projectMercator,
    ringToPathD,
    topoToFeatures,
} from "../../Components/World/worldTopoShared.js";
import { countryCoordinates } from "../../Components/Charts/WorldMap/countryCodes.js";
import "./ComplianceFlowMap.css";

const NS  = "http://www.w3.org/2000/svg";
const XNS = "http://www.w3.org/1999/xlink";

// Crops Mercator-inflated Antarctica from the bottom; trims top slightly
const VIEW = { x: 0, y: 38, w: 1000, h: 465 };

let topoCache = null;

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "xlink:href") el.setAttributeNS(XNS, k, v);
        else el.setAttribute(k, v);
    }
    return el;
}

function centerOf(alpha2) {
    const c = countryCoordinates?.[alpha2];
    if (!c) return null;
    const [x, y] = projectMercator(c.lng, c.lat);
    return { x, y };
}

function paintLand(landG, topo) {
    while (landG.firstChild) landG.removeChild(landG.firstChild);
    const features = topoToFeatures(topo, "countries");
    for (const f of features) {
        const d = f.rings.map(ringToPathD).join(" ");
        if (!d.trim()) continue;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "cfm-country");
        landG.appendChild(path);
    }
}

function paintFlows(flowG, flowCountries, originCode) {
    while (flowG.firstChild) flowG.removeChild(flowG.firstChild);

    const origin = centerOf(originCode);
    if (!origin) return;

    flowG.appendChild(svgEl("circle", { cx: origin.x, cy: origin.y, r: "6",   class: "cfm-origin-ring" }));
    flowG.appendChild(svgEl("circle", { cx: origin.x, cy: origin.y, r: "3.5", class: "cfm-origin-dot"  }));

    const seen = new Set();
    flowCountries.forEach((code, i) => {
        if (seen.has(code) || code === originCode) return;
        seen.add(code);

        const dest = centerOf(code);
        if (!dest) return;

        const dx = dest.x - origin.x;
        const dy = dest.y - origin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cpx = origin.x + dx * 0.5;
        const cpy = origin.y + dy * 0.5 - dist * 0.35;

        const pathId = `cfm-arc-${code}`;
        const d = `M ${origin.x} ${origin.y} Q ${cpx} ${cpy} ${dest.x} ${dest.y}`;

        flowG.appendChild(svgEl("path", {
            id: pathId, d, fill: "none", class: "cfm-arc",
            style: `animation-delay:${i * 0.18}s`,
        }));

        const dot = svgEl("circle", { r: "2.5", class: "cfm-dot" });
        const anim = svgEl("animateMotion", {
            dur: `${2.8 + (i % 4) * 0.6}s`,
            repeatCount: "indefinite",
            begin: `${i * 0.45}s`,
            keyPoints: "0;1",
            keyTimes: "0;1",
            calcMode: "spline",
            keySplines: "0.3 0 0.7 1",
        });
        anim.appendChild(svgEl("mpath", { "xlink:href": `#${pathId}` }));
        dot.appendChild(anim);
        flowG.appendChild(dot);

        flowG.appendChild(svgEl("circle", { cx: dest.x, cy: dest.y, r: "5",   class: "cfm-dest-ring" }));
        flowG.appendChild(svgEl("circle", { cx: dest.x, cy: dest.y, r: "2.8", class: "cfm-dest-dot"  }));
    });
}

export default function ComplianceFlowMap({ dataFlowCountries = [], dataFlowOrigin = "DE" }) {
    const svgRef    = useRef(null);
    const landReady = useRef(false);

    // Load TopoJSON and paint the base map once
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                if (!topoCache) {
                    const res = await fetch(WORLD_TOPO_URL);
                    topoCache = await res.json();
                }
                if (cancelled) return;
                const landG = svgRef.current?.querySelector("#cfm-land");
                if (landG) {
                    paintLand(landG, topoCache);
                    landReady.current = true;
                }
                // Paint flows after land is ready
                const flowG = svgRef.current?.querySelector("#cfm-flows");
                if (flowG) paintFlows(flowG, dataFlowCountries, dataFlowOrigin);
            } catch (e) {
                console.error("ComplianceFlowMap: failed to load map data", e);
            }
        }
        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Repaint flows whenever countries change (land stays cached)
    useEffect(() => {
        if (!landReady.current) return;
        const flowG = svgRef.current?.querySelector("#cfm-flows");
        if (flowG) paintFlows(flowG, dataFlowCountries, dataFlowOrigin);
    }, [dataFlowCountries, dataFlowOrigin]);

    return (
        <svg
            ref={svgRef}
            className="cfm"
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
        >
            <g id="cfm-land"  />
            <g id="cfm-flows" />
        </svg>
    );
}
