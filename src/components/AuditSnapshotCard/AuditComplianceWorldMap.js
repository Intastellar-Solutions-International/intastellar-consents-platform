import { useEffect, useRef } from "react";
import { EU_EEA_UK , EU_EEA_UK_NUMERIC} from "./complianceRegions.js";
import {
    WORLD_TOPO_URL,
    WORLD_VIEWBOX,
    projectMercator,
    ringToPathD,
    topoToFeatures,
} from "../World/worldTopoShared.js";
import "./AuditComplianceWorldMap.css";

const NS = "http://www.w3.org/2000/svg";

const FILL = {
    base: "#343d4a",
    none: "#3a4555",
    observed: "rgba(72, 128, 92, 0.92)",
    watch: "rgba(145, 108, 52, 0.9)",
    risk: "rgba(130, 58, 58, 0.92)",
};

const LABEL = [
    { fw: "GDPR", lon: 12, lat: 54 },
    { fw: "LGPD", lon: -53, lat: -12 },
    { fw: "CCPA", lon: -99, lat: 40 },
    { fw: "POPIA", lon: 25, lat: -28 },
];

const LABEL_COLOR = {
    observed: "#b5e8c8",
    watch: "#f0d9a8",
    risk: "#f0b0b0",
    none: "#8a939e",
};

/* function buildFrameworkNumericSets() {
    const gdpr = new Set();
    for (const n of EU_EEA_UK_NUMERIC) {
        const n = countries.numericToAlpha2(n);
        if (n != null) gdpr.add(Number(n));
    }
    const nUs = countries.alpha2ToNumeric("US");
    const nBr = countries.alpha2ToNumeric("BR");
    const nZa = countries.alpha2ToNumeric("ZA");
    return {
        GDPR: gdpr,
        CCPA: nUs != null ? new Set([Number(nUs)]) : new Set(),
        LGPD: nBr != null ? new Set([Number(nBr)]) : new Set(),
        POPIA: nZa != null ? new Set([Number(nZa)]) : new Set(),
    };
} */

const FRAMEWORK_BY_NUMERIC = {
    GDPR: new Set(EU_EEA_UK_NUMERIC),
    CCPA: new Set([840]),  // US
    LGPD: new Set([76]),   // Brazil
    POPIA: new Set([710]), // South Africa
};

function topoIdToNumeric(id) {
    if (id == null) return null;
    const n = typeof id === "number" ? id : Number.parseInt(String(id), 10);
    return Number.isFinite(n) ? n : null;
}

function frameworkForNumeric(num) {
    if (num == null) return null;
    if (FRAMEWORK_BY_NUMERIC.GDPR.has(num)) return "GDPR";
    if (FRAMEWORK_BY_NUMERIC.CCPA.has(num)) return "CCPA";
    if (FRAMEWORK_BY_NUMERIC.LGPD.has(num)) return "LGPD";
    if (FRAMEWORK_BY_NUMERIC.POPIA.has(num)) return "POPIA";
    return null;
}

function clearGroup(g) {
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
}

/**
 * @param {object} props
 * @param {Record<string, { status: string }>} props.regionStatus
 */
export default function AuditComplianceWorldMap({ regionStatus }) {
    const svgRef = useRef(null);
    const regionStatusRef = useRef(regionStatus);
    const topoRef = useRef(null);

    regionStatusRef.current = regionStatus;

    const statusKey = [
        regionStatus?.GDPR?.status,
        regionStatus?.LGPD?.status,
        regionStatus?.CCPA?.status,
        regionStatus?.POPIA?.status,
    ].join("|");

    function paintFromTopo(topo) {
        const rs = regionStatusRef.current;
        const stOf = (fw) => rs?.[fw]?.status ?? "none";
        const features = topoToFeatures(topo, "countries");
        const svg = svgRef.current;
        if (!svg) return;

        const landG = svg.querySelector("#acwm-land");
        const labelsG = svg.querySelector("#acwm-labels");
        clearGroup(landG);
        clearGroup(labelsG);

        for (const f of features) {
            const d = f.rings.map(ringToPathD).join(" ");
            if (!d.trim()) continue;
            const num = topoIdToNumeric(f.id);
            const fw = frameworkForNumeric(num);
            const path = document.createElementNS(NS, "path");
            path.setAttribute("d", d);
            path.setAttribute("stroke", "rgba(8, 12, 18, 0.85)");
            path.setAttribute("stroke-width", "0.45");
            if (fw) {
                const st = stOf(fw);
                path.setAttribute("fill", FILL[st] ?? FILL.none);
                path.setAttribute("data-fw", fw);
            } else {
                path.setAttribute("fill", FILL.base);
            }
            landG.appendChild(path);
        }

        for (const { fw, lon, lat } of LABEL) {
            const st = stOf(fw);
            const [x, y] = projectMercator(lon, lat);
            const el = document.createElementNS(NS, "text");
            el.setAttribute("x", x);
            el.setAttribute("y", y);
            el.setAttribute("fill", LABEL_COLOR[st] ?? LABEL_COLOR.none);
            el.setAttribute("font-size", "13");
            el.setAttribute("font-family", "system-ui, sans-serif");
            el.setAttribute("font-weight", "700");
            el.setAttribute("letter-spacing", "0.08em");
            el.setAttribute("text-anchor", "middle");
            el.setAttribute("pointer-events", "none");
            el.setAttribute("class", "audit-compliance-world-map__fw-label");
            el.textContent = fw;
            labelsG.appendChild(el);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                if (topoRef.current) {
                    if (cancelled) return;
                    paintFromTopo(topoRef.current);
                    return;
                }
                const res = await fetch(WORLD_TOPO_URL);
                const topo = await res.json();
                if (cancelled) return;
                topoRef.current = topo;
                paintFromTopo(topo);
            } catch (err) {
                console.error("AuditComplianceWorldMap: failed to load map data", err);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [statusKey]);

    const { w, h } = WORLD_VIEWBOX;

    return (
        <svg
            ref={svgRef}
            className="audit-compliance-world-map"
            viewBox={`0 0 ${w} ${h}`}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
        >
            <rect width={w} height={h} className="audit-compliance-world-map__ocean" />
            <g id="acwm-land" />
            <g id="acwm-labels" />
        </svg>
    );
}
