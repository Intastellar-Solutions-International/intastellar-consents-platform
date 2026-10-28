const { useEffect, useRef } = React;
import {
    WORLD_TOPO_URL,
    ringToPathD,
    topoToFeatures,
} from "../../Components/World/worldTopoShared.js";
import { numericToAlpha2 } from "../../Functions/isoNumericToAlpha2.js";
import "./LiveActivityMap.css";

const NS = "http://www.w3.org/2000/svg";

// Crops Mercator-inflated Antarctica from the bottom; trims top slightly —
// same crop src/Pages/Compliance/ComplianceFlowMap.js uses, so both maps
// frame the world identically.
const VIEW = { x: 0, y: 38, w: 1000, h: 465 };

let topoCache = null;

function topoIdToNumeric(id) {
    if (id == null) return null;
    const n = typeof id === "number" ? id : Number.parseInt(String(id), 10);
    return Number.isFinite(n) ? n : null;
}

// Fill opacity for an active country — scaled by its share of the busiest
// country's active-user count (sqrt, not linear, so a lone dominant country
// doesn't flatten every other active one into the same low-visibility band
// — same technique AnalyticsWorldMap.js's colorForShare() uses).
function activeOpacity(share) {
    const clamped = Math.min(1, Math.max(0, share));
    return 0.35 + Math.sqrt(clamped) * 0.55;
}

function paintLand(landG, topo, countries) {
    while (landG.firstChild) landG.removeChild(landG.firstChild);

    const byAlpha2 = new Map((countries || []).map(c => [c.code, c.activeUsers || 0]));
    const maxUsers = Math.max(...(countries || []).map(c => c.activeUsers || 0), 1);

    const features = topoToFeatures(topo, "countries");
    for (const f of features) {
        const d = f.rings.map(ringToPathD).join(" ");
        if (!d.trim()) continue;

        const alpha2 = numericToAlpha2(topoIdToNumeric(f.id));
        const activeUsers = alpha2 ? byAlpha2.get(alpha2) : null;
        const isActive = activeUsers != null;

        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "lam-country" + (isActive ? " lam-country--active" : ""));
        if (isActive) {
            path.style.fillOpacity = activeOpacity(activeUsers / maxUsers);
            const title = document.createElementNS(NS, "title");
            title.textContent = `${alpha2}: ${activeUsers} active user${activeUsers !== 1 ? "s" : ""}`;
            path.appendChild(title);
        }
        landG.appendChild(path);
    }
}

/**
 * Live-activity world map — docs/design-audit-plan.md Phase 4, built to the
 * user's request to match the Compliance section's map style
 * (ComplianceFlowMap.js: full-bleed Mercator land fill, muted slate
 * countries on near-black) rather than AnalyticsWorldMap's svgMap-based
 * choropleth, then simplified further per a follow-up request: highlight
 * the actual country shapes that have live activity (filled green, opacity
 * scaled by share of the busiest country's count) instead of plotting
 * marker dots. Country-code matching reuses the same numeric-ISO→alpha-2
 * lookup (isoNumericToAlpha2.js) AuditComplianceWorldMap.js already
 * established for this exact TopoJSON source.
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
                    paintLand(landG, topoCache, countries);
                    landReady.current = true;
                }
            } catch (e) {
                console.error("LiveActivityMap: failed to load map data", e);
            }
        }
        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Repaint whenever live data refreshes (topo itself stays cached).
    useEffect(() => {
        if (!landReady.current || !topoCache) return;
        const landG = svgRef.current?.querySelector("#lam-land");
        if (landG) paintLand(landG, topoCache, countries);
    }, [countries]);

    return (
        <svg
            ref={svgRef}
            className="lam"
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="World map highlighting countries with live visitor activity"
        >
            <g id="lam-land" />
        </svg>
    );
}
