const { useEffect, useRef } = React;
import {
    WORLD_TOPO_URL,
    projectMercator,
    ringToPathD,
    topoToFeatures,
} from "../../Components/World/worldTopoShared.js";
import { countryCoordinates } from "../../Components/Charts/WorldMap/countryCodes.js";
import "./LiveActivityMap.css";

const NS = "http://www.w3.org/2000/svg";

// Crops Mercator-inflated Antarctica from the bottom; trims top slightly —
// same crop src/Pages/Compliance/ComplianceFlowMap.js uses, so both maps
// frame the world identically.
const VIEW = { x: 0, y: 38, w: 1000, h: 465 };

let topoCache = null;

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
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
        path.setAttribute("class", "lam-country");
        landG.appendChild(path);
    }
}

function paintDots(dotG, countries) {
    while (dotG.firstChild) dotG.removeChild(dotG.firstChild);
    const max = Math.max(...countries.map(c => c.activeUsers || 0), 1);
    countries.forEach((c, i) => {
        const pos = centerOf(c.code);
        if (!pos) return;
        // Scale ring/dot size by share of the busiest country's count, not
        // a flat size — a lone active user in one country shouldn't look as
        // prominent as a country with the most.
        const scale = 0.4 + 0.6 * Math.sqrt((c.activeUsers || 0) / max);
        const ringR = (5 + scale * 4).toFixed(1);
        const dotR = (2.5 + scale * 2).toFixed(1);
        const g = svgEl("g", { class: "lam-point", style: `animation-delay:${(i % 6) * 0.15}s` });
        g.appendChild(svgEl("circle", { cx: pos.x, cy: pos.y, r: ringR, class: "lam-ring" }));
        g.appendChild(svgEl("circle", { cx: pos.x, cy: pos.y, r: dotR, class: "lam-dot" }));
        const title = document.createElementNS(NS, "title");
        title.textContent = `${c.code}: ${c.activeUsers} active user${c.activeUsers !== 1 ? "s" : ""}`;
        g.appendChild(title);
        dotG.appendChild(g);
    });
}

/**
 * Live-activity world map — docs/design-audit-plan.md Phase 4, built to the
 * user's request to match the Compliance section's map style
 * (ComplianceFlowMap.js: full-bleed Mercator land fill, muted slate
 * countries on near-black) rather than AnalyticsWorldMap's svgMap-based
 * choropleth. Shares that component's rendering primitives
 * (worldTopoShared.js, the same TopoJSON cache/crop) but plots a pulsing
 * dot per country with live activity instead of flow arcs — there's no
 * origin/destination concept for live visitors, just "these countries have
 * active users right now," sized by how many.
 */
export default function LiveActivityMap({ countries = [] }) {
    const svgRef = useRef(null);
    const landReady = useRef(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                if (!topoCache) {
                    const res = await fetch(WORLD_TOPO_URL);
                    topoCache = await res.json();
                }
                if (cancelled) return;
                const landG = svgRef.current?.querySelector("#lam-land");
                if (landG) {
                    paintLand(landG, topoCache);
                    landReady.current = true;
                }
                const dotG = svgRef.current?.querySelector("#lam-dots");
                if (dotG) paintDots(dotG, countries);
            } catch (e) {
                console.error("LiveActivityMap: failed to load map data", e);
            }
        }
        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Repaint dots whenever live data refreshes (land stays cached).
    useEffect(() => {
        if (!landReady.current) return;
        const dotG = svgRef.current?.querySelector("#lam-dots");
        if (dotG) paintDots(dotG, countries);
    }, [countries]);

    return (
        <svg
            ref={svgRef}
            className="lam"
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="World map showing countries with live visitor activity"
        >
            <g id="lam-land" />
            <g id="lam-dots" />
        </svg>
    );
}
