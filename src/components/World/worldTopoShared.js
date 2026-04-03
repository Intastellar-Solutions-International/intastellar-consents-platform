/** Shared projection + TopoJSON helpers for world-atlas countries-110m. */

export const WORLD_TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export const WORLD_VIEWBOX = { w: 2000, h: 700 };

export function projectMercator(lon, lat) {
    const x = ((lon + 180) / 360) * 1000;
    const latRad = Math.max(-85, Math.min(85, lat)) * (Math.PI / 180);
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = ((1 - mercN / Math.PI) / 2) * 700;
    return [x, Math.max(0, Math.min(700, y))];
}

function fixAntimeridian(coords) {
    const rings = [];
    let current = [];
    for (const curr of coords) {
        if (current.length > 0) {
            const prev = current[current.length - 1];
            if (Math.abs(curr[0] - prev[0]) > 180) {
                rings.push(current);
                current = [];
            }
        }
        current.push(curr);
    }
    if (current.length > 1) rings.push(current);
    return rings;
}

export function ringToPathD(coords) {
    return fixAntimeridian(coords)
        .map((seg) =>
            seg
                .map((c, i) => {
                    const [x, y] = projectMercator(c[0], c[1]);
                    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ") + "Z"
        )
        .join(" ");
}

export function topoToFeatures(topo, objName) {
    const arcs = topo.arcs;
    const geom = topo.objects[objName];
    const [sx, sy] = topo.transform.scale;
    const [tx, ty] = topo.transform.translate;

    function decodeArc(idx) {
        const arc = arcs[idx < 0 ? ~idx : idx];
        let x = 0;
        let y = 0;
        const pts = arc.map((d) => {
            x += d[0];
            y += d[1];
            return [x * sx + tx, y * sy + ty];
        });
        return idx < 0 ? pts.reverse() : pts;
    }

    const buildRing = (arcIdxs) => arcIdxs.flatMap(decodeArc);

    const features = [];
    for (const g of geom.geometries) {
        if (g.type === "Polygon") {
            features.push({ id: g.id, rings: g.arcs.map(buildRing) });
        } else if (g.type === "MultiPolygon") {
            for (const poly of g.arcs) {
                features.push({ id: g.id, rings: poly.map(buildRing) });
            }
        }
    }
    return features;
}
