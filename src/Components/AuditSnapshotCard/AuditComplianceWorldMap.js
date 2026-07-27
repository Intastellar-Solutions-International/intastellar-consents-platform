import { useEffect, useRef } from "react";
import { numericToAlpha2 } from "../../Functions/isoNumericToAlpha2.js";
import { EU_EEA_UK_NUMERIC } from "./complianceRegions.js";
import {
    WORLD_TOPO_URL,
    US_STATES_TOPO_URL,
    PROJECTED_MAP_VIEWBOX,
    projectMercator,
    ringToPathD,
    topoToFeatures,
} from "../World/worldTopoShared.js";
import "./AuditComplianceWorldMap.css";

const NS = "http://www.w3.org/2000/svg";

/**
 * Visible SVG viewBox inside projected user space (still 0…w, 0…h from {@link PROJECTED_MAP_VIEWBOX}).
 * Crops the bottom (Mercator-inflated Antarctica / far south) and trims the top slightly so the map reads larger.
 */
const MAP_VIEW_CROP = { x: 0, y: 38, width: 1000, height: 465 };

const FILL = {
    base: "#343d4a",
    /** Regulated jurisdiction, no consent evidence in this sample — visibility / risk lens */
    potential: "rgba(118, 88, 48, 0.78)",
    observed: "rgba(62, 115, 78, 0.78)",
    observedSample: "rgba(82, 145, 98, 0.95)",
    watch: "rgba(145, 108, 52, 0.9)",
    risk: "rgba(130, 58, 58, 0.92)",
};

const LABEL = [
    { fw: "GDPR",   lon: 12,     lat: 54   },
    { fw: "LGPD",   lon: -53,    lat: -12  },
    /** CCPA / CPRA scope shown as California only on this map */
    { fw: "CCPA",   lon: -119.2, lat: 36.5 },
    { fw: "POPIA",  lon: 25,     lat: -28  },
    { fw: "PDPA",   lon: 101.5,  lat: 3.1  },
    { fw: "APA",    lon: 134,    lat: -26  },
    { fw: "PDPL",   lon: 45,     lat: 24   },
    { fw: "PIPEDA", lon: -96,    lat: 60   },
];

const LABEL_COLOR = {
    observed: "#b5e8c8",
    watch: "#f0d9a8",
    risk: "#f0b0b0",
    none: "#c9a057",
    potential: "#d4a574",
};

const US_NUMERIC = 840;

/**
 * Country-level ISO numeric → framework.
 * CCPA, CDPA, CPA, UCPA, CTDPA are all empty here — they are drawn from US states TopoJSON.
 */
const FRAMEWORK_BY_NUMERIC = {
    GDPR:   new Set(EU_EEA_UK_NUMERIC),
    LGPD:   new Set([76]),
    POPIA:  new Set([710]),
    PDPA:   new Set([764, 702]),  // Thailand (764), Singapore (702)
    APA:    new Set([36]),        // Australia
    PDPL:   new Set([682]),       // Saudi Arabia
    PIPEDA: new Set([124]),       // Canada (federal — LAW25 shares this territory)
    // US state laws drawn from states TopoJSON:
    CCPA:   new Set(),
    CDPA:   new Set(),
    CPA:    new Set(),
    UCPA:   new Set(),
    CTDPA:  new Set(),
};

function topoIdToNumeric(id) {
    if (id == null) return null;
    const n = typeof id === "number" ? id : Number.parseInt(String(id), 10);
    return Number.isFinite(n) ? n : null;
}

function frameworkForNumeric(num) {
    if (num == null) return null;
    if (FRAMEWORK_BY_NUMERIC.GDPR.has(num))   return "GDPR";
    if (FRAMEWORK_BY_NUMERIC.LGPD.has(num))   return "LGPD";
    if (FRAMEWORK_BY_NUMERIC.POPIA.has(num))  return "POPIA";
    if (FRAMEWORK_BY_NUMERIC.PDPA.has(num))   return "PDPA";
    if (FRAMEWORK_BY_NUMERIC.APA.has(num))    return "APA";
    if (FRAMEWORK_BY_NUMERIC.PDPL.has(num))   return "PDPL";
    if (FRAMEWORK_BY_NUMERIC.PIPEDA.has(num)) return "PIPEDA";
    return null;
}


function fillForFrameworkStatus(st, inSample) {
    if (st === "observed") {
        return { fill: inSample ? FILL.observedSample : FILL.observed, stroke: "rgba(8, 12, 18, 0.85)", strokeW: "0.45" };
    }
    if (st === "watch") {
        return { fill: FILL.watch, stroke: "rgba(8, 12, 18, 0.85)", strokeW: "0.45" };
    }
    if (st === "risk") {
        return { fill: FILL.risk, stroke: "rgba(8, 12, 18, 0.85)", strokeW: "0.45" };
    }
    return { fill: FILL.potential, stroke: "rgba(8, 12, 18, 0.85)", strokeW: "0.45" };
}

function alpha2FromTopoNumeric(num) {
    const a2 = numericToAlpha2(num);
    return a2 ? String(a2).toUpperCase() : null;
}

function clearGroup(g) {
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
}

/**
 * @param {object} props
 * @param {Record<string, { status: string }>} props.regionStatus
 * @param {string} props.sampleCountryCodesKey — comma-separated uppercase alpha-2 (stable key)
 * @param {string|null} props.selectedCountryCode
 * @param {(alpha2: string | null) => void} props.onSelectCountry
 * @param {(fw: string) => void} [props.onSelectFramework] — GDPR / LGPD / CCPA / POPIA label clicks
 */
export default function AuditComplianceWorldMap({
    regionStatus,
    sampleCountryCodesKey,
    selectedCountryCode,
    onSelectCountry,
    onSelectFramework,
}) {
    const svgRef = useRef(null);
    const regionStatusRef = useRef(regionStatus);
    const onSelectCountryRef = useRef(onSelectCountry);
    const onSelectFrameworkRef = useRef(onSelectFramework);
    const topoRef = useRef(null);
    const statesTopoRef = useRef(null);

    regionStatusRef.current = regionStatus;
    onSelectCountryRef.current = onSelectCountry;
    onSelectFrameworkRef.current = onSelectFramework;

    const selectedUpper = selectedCountryCode ? String(selectedCountryCode).toUpperCase() : null;

    const paintKey = [
        regionStatus?.GDPR?.status,
        regionStatus?.LGPD?.status,
        regionStatus?.CCPA?.status,
        regionStatus?.CDPA?.status,
        regionStatus?.CPA?.status,
        regionStatus?.UCPA?.status,
        regionStatus?.CTDPA?.status,
        regionStatus?.POPIA?.status,
        regionStatus?.PDPA?.status,
        regionStatus?.APA?.status,
        regionStatus?.PDPL?.status,
        regionStatus?.PIPEDA?.status,
        regionStatus?.LAW25?.status,
        sampleCountryCodesKey,
        selectedUpper ?? "",
    ].join("|");

    function paintFromTopo(topo, statesTopo, sampleKey, selUpper) {
        const sampleAlpha2Set = new Set(
            sampleKey
                ? sampleKey.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
                : []
        );
        const rs = regionStatusRef.current;
        const stOf = (fw) => rs?.[fw]?.status ?? "none";
        const features = topoToFeatures(topo, "countries");
        const svg = svgRef.current;
        if (!svg) return;

        const landG = svg.querySelector("#acwm-land");
        const labelsG = svg.querySelector("#acwm-labels");
        clearGroup(landG);
        clearGroup(labelsG);

        const pathsWithMeta = [];
        const inSampleUS = sampleAlpha2Set.has("US");

        for (const f of features) {
            const d = f.rings.map(ringToPathD).join(" ");
            if (!d.trim()) continue;
            const num = topoIdToNumeric(f.id);
            let fw = frameworkForNumeric(num);
            if (num === US_NUMERIC && !statesTopo) fw = "CCPA";
            const alpha2 = alpha2FromTopoNumeric(num);
            const inSample = alpha2 != null && sampleAlpha2Set.has(alpha2);
            const isSelected = alpha2 != null && selUpper != null && alpha2 === selUpper;

            const path = document.createElementNS(NS, "path");
            path.setAttribute("d", d);
            path.setAttribute("class", "audit-compliance-world-map__country");
            if (alpha2) path.setAttribute("data-cc", alpha2);

            const st = fw ? stOf(fw) : null;
            let fill = FILL.base;
            let stroke = "rgba(8, 12, 18, 0.85)";
            let strokeW = "0.45";

            if (fw) {
                const o = fillForFrameworkStatus(st, inSample);
                fill = o.fill;
                stroke = o.stroke;
                strokeW = o.strokeW;
            } else if (inSample) {
                fill = FILL.base;
                stroke = "rgba(192, 159, 83, 0.65)";
                strokeW = "1.1";
            }

            if (isSelected) {
                stroke = "rgba(192, 159, 83, 0.98)";
                strokeW = "2.4";
                path.classList.add("audit-compliance-world-map__country--selected");
            }

            path.setAttribute("fill", fill);
            path.setAttribute("stroke", stroke);
            path.setAttribute("stroke-width", strokeW);

            const clickable = alpha2 && (fw != null || inSample);
            if (clickable) {
                path.classList.add("audit-compliance-world-map__country--clickable");
                path.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = alpha2;
                    onSelectCountryRef.current?.((prev) => {
                        const p = prev ? String(prev).toUpperCase() : null;
                        return p === next ? null : next;
                    });
                });
            }

            pathsWithMeta.push({ path, isSelected });
        }

        pathsWithMeta.sort((a, b) => Number(a.isSelected) - Number(b.isSelected));
        for (const { path } of pathsWithMeta) landG.appendChild(path);

        if (statesTopo) {
            // Each entry maps a US state FIPS code to the framework it represents.
            const US_STATE_LAYERS = [
                { fips: "06", fw: "CCPA",  cls: "audit-compliance-world-map__ccpa-california" },
                { fips: "51", fw: "CDPA",  cls: null },  // Virginia
                { fips: "08", fw: "CPA",   cls: null },  // Colorado
                { fips: "49", fw: "UCPA",  cls: null },  // Utah
                { fips: "09", fw: "CTDPA", cls: null },  // Connecticut
            ];
            const allStateFeatures = topoToFeatures(statesTopo, "states");
            const isUSSelected = selUpper === "US";

            for (const { fips, fw, cls } of US_STATE_LAYERS) {
                const fwStatus = stOf(fw);
                const stateFeats = allStateFeatures.filter(
                    (feat) => String(feat.id ?? "").padStart(2, "0") === fips
                );
                for (const feat of stateFeats) {
                    const dSt = feat.rings.map(ringToPathD).join(" ");
                    if (!dSt.trim()) continue;
                    const pSt = document.createElementNS(NS, "path");
                    pSt.setAttribute("d", dSt);
                    pSt.setAttribute("class", ["audit-compliance-world-map__country", cls].filter(Boolean).join(" "));
                    pSt.setAttribute("data-cc", "US");
                    pSt.setAttribute("data-subdivision", `US-${fips}`);
                    const o = fillForFrameworkStatus(fwStatus, inSampleUS);
                    let { fill: fillSt, stroke: strokeSt, strokeW: strokeWSt } = o;
                    if (isUSSelected) {
                        strokeSt  = "rgba(192, 159, 83, 0.98)";
                        strokeWSt = "2.4";
                        pSt.classList.add("audit-compliance-world-map__country--selected");
                    }
                    pSt.setAttribute("fill", fillSt);
                    pSt.setAttribute("stroke", strokeSt);
                    pSt.setAttribute("stroke-width", strokeWSt);
                    pSt.classList.add("audit-compliance-world-map__country--clickable");
                    pSt.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectCountryRef.current?.((prev) => {
                            const pr = prev ? String(prev).toUpperCase() : null;
                            return pr === "US" ? null : "US";
                        });
                    });
                    landG.appendChild(pSt);
                }
            }
        }

        for (const { fw, lon, lat } of LABEL) {
            const st = stOf(fw);
            const colorKey =
                st === "observed"
                    ? "observed"
                    : st === "watch"
                      ? "watch"
                      : st === "risk"
                        ? "risk"
                        : "potential";
            const [x, y] = projectMercator(lon, lat);
            const el = document.createElementNS(NS, "text");
            el.setAttribute("x", x);
            el.setAttribute("y", y);
            el.setAttribute("fill", LABEL_COLOR[colorKey] ?? LABEL_COLOR.potential);
            el.setAttribute("font-size", "13");
            el.setAttribute("font-family", "system-ui, sans-serif");
            el.setAttribute("font-weight", "700");
            el.setAttribute("letter-spacing", "0.08em");
            el.setAttribute("text-anchor", "middle");
            el.setAttribute("class", "audit-compliance-world-map__fw-label");
            if (onSelectFrameworkRef.current) {
                el.setAttribute("pointer-events", "auto");
                el.classList.add("audit-compliance-world-map__fw-label--clickable");
                el.style.cursor = "pointer";
                el.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectFrameworkRef.current?.(fw);
                });
            } else {
                el.setAttribute("pointer-events", "none");
            }
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
                    paintFromTopo(topoRef.current, statesTopoRef.current, sampleCountryCodesKey, selectedUpper);
                    return;
                }
                const worldRes = await fetch(WORLD_TOPO_URL);
                const topo = await worldRes.json();
                if (cancelled) return;
                topoRef.current = topo;
                statesTopoRef.current = null;
                try {
                    const statesRes = await fetch(US_STATES_TOPO_URL);
                    if (statesRes.ok) {
                        statesTopoRef.current = await statesRes.json();
                    }
                } catch (e) {
                    console.warn("AuditComplianceWorldMap: US states map unavailable, CCPA falls back to whole US", e);
                }
                if (cancelled) return;
                paintFromTopo(topo, statesTopoRef.current, sampleCountryCodesKey, selectedUpper);
            } catch (err) {
                console.error("AuditComplianceWorldMap: failed to load map data", err);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [paintKey, sampleCountryCodesKey, selectedUpper, onSelectFramework]);

    const { w, h } = PROJECTED_MAP_VIEWBOX;
    const vb = MAP_VIEW_CROP;

    return (
        <svg
            ref={svgRef}
            className="audit-compliance-world-map"
            viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Regulatory world map; CCPA shown for California; click a country or framework label for details"
        >
            <rect width={w} height={h} className="audit-compliance-world-map__ocean" />
            <g id="acwm-land" />
            <g id="acwm-labels" />
        </svg>
    );
}
