// The map beside the Locations table. Countries use the existing world map
// (svgMap); one country's regions and cities are drawn here as plain SVG from
// api/geo-regions.js outlines: regions shaded by the chosen metric, cities as
// dots sized by it. Clicking a country or region drills down like the table.
const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import AnalyticsWorldMap, { colorForShare } from "./AnalyticsWorldMap.js";
import { t } from "../../i18n/index.js";

const OTHER_KEY = "__other";
const W = 600, H = 420, PAD = 12;
const shapeCache = new Map(); // country → Promise<{ regions } | null>

function loadShapes(country) {
    if (!shapeCache.has(country)) {
        shapeCache.set(country, fetch(`${ScannerHost}/api/geo-regions?${new URLSearchParams({ country })}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => { shapeCache.delete(country); return null; }));
    }
    return shapeCache.get(country);
}

function useShapes(country) {
    const [state, setState] = useState({ country: null, regions: null, loading: false });
    useEffect(() => {
        if (!country) return undefined;
        let cancelled = false;
        setState({ country, regions: null, loading: true });
        loadShapes(country).then((data) => { if (!cancelled) setState({ country, regions: data?.regions || null, loading: false }); });
        return () => { cancelled = true; };
    }, [country]);
    return state;
}

/**
 * Fit lon/lat outlines into the W×H box: equirectangular with the x axis
 * scaled by cos(middle latitude), which is close enough at country scale.
 * Countries across the antimeridian (Russia, Fiji, the US with the
 * Aleutians) are unwrapped by shifting western longitudes east.
 */
export function makeProjection(regions, focus) {
    const all = [];
    for (const r of regions) for (const poly of r.coordinates) for (const ring of poly) for (const p of ring) all.push(p);
    if (!all.length) return null;
    const lons = all.map((p) => p[0]);
    const wrap = Math.max(...lons) - Math.min(...lons) > 180;
    const lonOf = (lon) => (wrap && lon < 0 ? lon + 360 : lon);

    const box = (points) => {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [lon, lat] of points) {
            const x = lonOf(lon);
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (lat < y0) y0 = lat; if (lat > y1) y1 = lat;
        }
        return { x0, x1, y0, y1 };
    };
    // Zoom to one region (city view of a region) when asked, else the country.
    const focusPoints = [];
    if (focus) for (const poly of focus.coordinates) for (const ring of poly) for (const p of ring) focusPoints.push(p);
    const b = box(focusPoints.length ? focusPoints : all);
    const k = Math.cos((((b.y0 + b.y1) / 2) * Math.PI) / 180) || 1;
    const spanX = Math.max((b.x1 - b.x0) * k, 1e-6), spanY = Math.max(b.y1 - b.y0, 1e-6);
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
    return ([lon, lat]) => [offX + (lonOf(lon) - b.x0) * k * scale, offY + (b.y1 - lat) * scale];
}

function pathFor(coordinates, project) {
    let d = "";
    for (const poly of coordinates) {
        for (const ring of poly) {
            ring.forEach((p, i) => {
                const [x, y] = project(p);
                d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
            });
            d += "Z";
        }
    }
    return d;
}

function RegionMap({ view, rows, metricLabel, formatValue, onRegion }) {
    const { regions, loading } = useShapes(view.country);
    const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
    const focus = view.level === "city" && view.region ? regions?.find((r) => r.code === view.region) : null;
    const project = useMemo(() => (regions ? makeProjection(regions, focus) : null), [regions, focus]);
    const [hover, setHover] = useState(null);

    if (loading) return <div className="sa-map sa-map--empty">{t("Loading map…")}</div>;
    if (!regions || !project) return <div className="sa-map sa-map--empty">{t("No map of this country's regions.")}</div>;

    const named = rows.filter((r) => r.key && r.key !== OTHER_KEY);
    const max = Math.max(...named.map((r) => r.value), 1);
    const cities = view.level === "city" ? named.filter((r) => r.lat != null && r.lon != null) : [];
    const unplaced = view.level === "city" ? named.length - cities.length : 0;

    const caption = hover
        ? (hover.value == null ? hover.name : `${hover.name}: ${formatValue(hover.value)} · ${metricLabel}`)
        : view.level === "region"
            ? t("{metric}: darker regions are higher. Click a region to see its cities.", { metric: metricLabel })
            : unplaced > 0
                ? t("{metric}: bigger dots are higher. {count} cities have no map position yet.", { metric: metricLabel, count: unplaced })
                : t("{metric}: bigger dots are higher.", { metric: metricLabel });

    return (
        <div className="sa-map">
            <svg className="sa-regionmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Map")} onMouseLeave={() => setHover(null)}>
                {regions.map((r) => {
                    const row = view.level === "region" ? byKey.get(r.code) : null;
                    const fill = row ? colorForShare(row.value / max) : undefined;
                    const active = view.level === "city" && view.region === r.code;
                    const clickable = !!onRegion && (view.level === "region" ? !!row : !active);
                    return (
                        <path
                            key={r.code}
                            d={pathFor(r.coordinates, project)}
                            className={"sa-regionmap__region" + (active ? " sa-regionmap__region--active" : "") + (clickable ? " sa-regionmap__region--link" : "")}
                            style={fill ? { fill } : undefined}
                            onMouseEnter={() => setHover({ name: r.name, value: row ? row.value : null })}
                            onClick={clickable ? () => onRegion(r.code) : undefined}
                        >
                            <title>{row ? `${r.name}: ${formatValue(row.value)}` : r.name}</title>
                        </path>
                    );
                })}
                {cities.map((c) => {
                    const [x, y] = project([c.lon, c.lat]);
                    const radius = 3 + Math.sqrt(c.value / max) * 13;
                    return (
                        <circle key={c.key} cx={x} cy={y} r={radius} className="sa-regionmap__city"
                            onMouseEnter={() => setHover({ name: c.label, value: c.value })}>
                            <title>{`${c.label}: ${formatValue(c.value)}`}</title>
                        </circle>
                    );
                })}
            </svg>
            <div className="sa-map__footer">
                <p className="sa-map__caption">{caption}</p>
                {view.level === "region" && (
                    <div className="sa-map__legend" aria-hidden="true">
                        <span className="sa-map__legend-label">{t("Fewer")}</span>
                        <span className="sa-map__legend-gradient" />
                        <span className="sa-map__legend-label">{t("More")}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Map for the current Locations view; `onDrill(key)` goes one level down. */
export default function LocationMap({ view, rows, metricLabel, formatValue, onDrill, onRegion }) {
    if (view.level === "country") {
        const countries = rows.filter((r) => r.key && r.key !== OTHER_KEY).map((r) => ({ code: r.key, events: r.value }));
        return (
            <AnalyticsWorldMap
                countries={countries}
                metricLabel={metricLabel}
                formatValue={formatValue}
                onSelect={onDrill}
                hint={t("{metric}: darker countries are higher. Click a country to see its regions.", { metric: metricLabel })}
            />
        );
    }
    return <RegionMap view={view} rows={rows} metricLabel={metricLabel} formatValue={formatValue} onRegion={onRegion} />;
}
