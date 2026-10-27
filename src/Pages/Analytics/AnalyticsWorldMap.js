const { useEffect, useMemo, useState } = React;
import { countryCodes } from "../../Components/Charts/WorldMap/countryCodes.js";
import "../../Components/Charts/WorldMap/Style.css";

const MAP_ID = "sa-world-map";

function buildCodeToName() {
    const m = {};
    Object.entries(countryCodes).forEach(([name, code]) => {
        if (code && m[code] == null) m[code] = name;
    });
    return m;
}
const CODE_TO_NAME = buildCodeToName();

// docs/design-audit-plan.md Phase 2 item 8. The caption's "darker =
// higher" claim is accurate — verified live, not just read in code: DK
// (946 events, this period's max) renders at opacity 0.9, US (93 events)
// at 0.233, exactly matching this formula. The scale direction was never
// actually inverted (Phase 0's hypothesis, before it could be rendered).
// What live rendering DID surface: a linear share-of-max scale visually
// compresses every country except the single dominant one into a narrow,
// hard-to-tell-apart low-opacity band whenever one country's count is far
// ahead of the rest — exactly asasoftware.aero's own real distribution
// (946 vs. the next-highest at 93, a >10x gap). sqrt() lifts smaller
// shares up without changing the two endpoints (0 stays 0, max stays 1) —
// a standard choropleth-map technique for skewed distributions, not an
// arbitrary tweak: pct=0.1 (10% of max) now maps to sqrt(0.1)≈0.316
// instead of a flat 0.1, giving real visual separation to every country
// below the dominant one instead of flattening them together.
function colorForShare(pct) {
    const clamped = Math.min(1, Math.max(0, pct));
    const opacity = 0.16 + Math.sqrt(clamped) * 0.74;
    return `rgba(192, 159, 83, ${opacity.toFixed(3)})`;
}

/** Lightweight events-by-country map for Site Analytics — no drawer/compare,
 *  just a color-scaled world view plus a click-to-inspect caption. */
export default function AnalyticsWorldMap({ countries, metricLabel = "Events", formatValue }) {
    const metricLower = metricLabel.toLowerCase();
    const fmt = formatValue || ((v) => v.toLocaleString("de-DE"));
    const rows = useMemo(() => (countries || []).filter((c) => c.code), [countries]);
    const max = useMemo(() => Math.max(...rows.map((c) => c.events), 1), [rows]);
    const [selected, setSelected] = useState(null);
    useEffect(() => { setSelected(null); }, [countries]);

    const values = useMemo(() => {
        const out = {};
        rows.forEach((c) => {
            out[c.code] = {
                events: c.events,
                color: colorForShare(c.events / max),
            };
        });
        return out;
    }, [rows, max]);

    useEffect(() => {
        const el = document.getElementById(MAP_ID);
        if (!el) return undefined;
        if (!rows.length) { el.innerHTML = ""; return undefined; }

        el.innerHTML = "";
        // svgMap has no real "showTooltips" option (it's silently ignored) —
        // this map uses a click-to-inspect caption instead, so the native
        // hover tooltip has to be suppressed by hand. Its tooltip node is a
        // single div appended to <body> when the instance is built, so the
        // freshly-appended one is reliably the last `.svgMap-tooltip` in the
        // document right after construction returns.
        new window.svgMap({
            targetElementID: MAP_ID,
            data: {
                data: {
                    events: {
                        name: metricLabel,
                        format: "{0}",
                        thousandSeparator: ".",
                        thresholdMax: max,
                        thresholdMin: 0,
                    },
                },
                applyData: "events",
                values,
            },
            initialZoom: 1.15,
        });
        const ownTooltips = document.querySelectorAll(".svgMap-tooltip");
        const ownTooltip = ownTooltips[ownTooltips.length - 1];
        if (ownTooltip) ownTooltip.style.display = "none";

        const onMapClick = (e) => {
            const node = e.target.closest?.("[data-id]");
            if (!node || !el.contains(node)) return;
            const code = node.getAttribute("data-id");
            if (code) setSelected(code);
        };
        el.addEventListener("click", onMapClick);
        return () => {
            el.removeEventListener("click", onMapClick);
            // The library never removes its tooltip node on teardown, only
            // toggles a CSS class — without this it can be left behind (and
            // stuck visible) across every re-render (date range change, tick
            // refresh, map-mode toggle).
            ownTooltip?.remove();
        };
    }, [rows, values, max, metricLabel]);

    if (!rows.length) {
        return <div className="sa-map sa-map--empty">No geographic data for this period.</div>;
    }

    const selectedRow = selected ? rows.find((c) => c.code === selected) : null;

    return (
        <div className="sa-map">
            <div id={MAP_ID} className="sa-map__inner" />
            <div className="sa-map__footer">
                <p className="sa-map__caption">
                    {selectedRow
                        ? `${CODE_TO_NAME[selectedRow.code] || selectedRow.code}: ${fmt(selectedRow.events)} ${metricLower}`
                        : `Darker regions had higher ${metricLower} in this period. Click a country for its value.`}
                </p>
                {/* No legend previously existed at all — Phase 0 finding.
                    A labeled gradient bar, not discrete buckets, since the
                    underlying scale (colorForShare above) is continuous,
                    not bucketed. */}
                <div className="sa-map__legend" aria-hidden="true">
                    <span className="sa-map__legend-label">Fewer</span>
                    <span className="sa-map__legend-gradient" />
                    <span className="sa-map__legend-label">More</span>
                </div>
            </div>
        </div>
    );
}
