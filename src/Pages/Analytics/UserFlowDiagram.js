const { useMemo } = React;

// Layout constants — tuned for readability, not data-driven.
const COL_WIDTH   = 168;
const COL_GAP     = 96;
const NODE_GAP    = 6;
const MIN_NODE_H  = 26;
const MAX_TOTAL_H = 560;

function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Builds one node list per column (channel, then FLOW_DEPTH+1 page columns)
// with each node's population = sum of the edges arriving into it from the
// previous column (column 0's "population" is its own outgoing total, since
// it has no incoming column). This is the same number either way it's
// computed for columns 1..N — incoming into a node always equals its
// outgoing plus whatever exited there — so deriving it from incoming edges
// alone keeps this simple.
function buildColumns(data) {
    const flowDepth = data.flowDepth || 4;
    const columns = [];

    const col0 = new Map();
    for (const e of data.channelEdges) col0.set(e.from, (col0.get(e.from) || 0) + e.sessions);
    columns.push([...col0.entries()].map(([id, population]) => ({ id, population })));

    const col1 = new Map();
    for (const e of data.channelEdges) col1.set(e.to, (col1.get(e.to) || 0) + e.sessions);
    columns.push([...col1.entries()].map(([id, population]) => ({ id, population })));

    for (let depth = 1; depth <= flowDepth; depth++) {
        const map = new Map();
        for (const e of data.transitionEdges) {
            if (e.depth !== depth) continue;
            map.set(e.to, (map.get(e.to) || 0) + e.sessions);
        }
        columns.push([...map.entries()].map(([id, population]) => ({ id, population })));
    }

    for (const col of columns) col.sort((a, b) => b.population - a.population);
    return columns;
}

// Sub-band positions for every edge crossing one column boundary — each
// node's height is divided among its edges (proportional to session share),
// stacked in the order that minimizes crossing (sorted by the position of
// the node on the other side). Real Sankey layouts iterate this a few times
// to further reduce crossings; one deterministic pass is enough for the
// shallow, capped-branching diagrams this endpoint produces.
function layoutBoundary(fromCol, toCol, edges, fromY, toY) {
    const fromIndex = new Map(fromCol.map((n, i) => [n.id, i]));
    const toIndex   = new Map(toCol.map((n, i) => [n.id, i]));

    const byFrom = new Map();
    const byTo   = new Map();
    for (const e of edges) {
        if (!byFrom.has(e.from)) byFrom.set(e.from, []);
        byFrom.get(e.from).push(e);
        if (!byTo.has(e.to)) byTo.set(e.to, []);
        byTo.get(e.to).push(e);
    }
    for (const list of byFrom.values()) list.sort((a, b) => (toIndex.get(a.to) ?? 0) - (toIndex.get(b.to) ?? 0));
    for (const list of byTo.values())   list.sort((a, b) => (fromIndex.get(a.from) ?? 0) - (fromIndex.get(b.from) ?? 0));

    const fromCursor = new Map();
    const toCursor   = new Map();

    return edges.map(e => {
        const fromNode = fromY.get(e.from);
        const toNode   = toY.get(e.to);
        if (!fromNode || !toNode) return null;

        const fromShare = fromNode.population > 0 ? (e.sessions / fromNode.population) * fromNode.height : fromNode.height;
        const toShare   = toNode.population   > 0 ? (e.sessions / toNode.population)   * toNode.height   : toNode.height;

        const fCursor = fromCursor.get(e.from) || 0;
        const tCursor = toCursor.get(e.to) || 0;
        fromCursor.set(e.from, fCursor + fromShare);
        toCursor.set(e.to, tCursor + toShare);

        return {
            edge: e,
            y0: fromNode.y + fCursor + fromShare / 2,
            y1: toNode.y + tCursor + toShare / 2,
            width: Math.max(1, Math.min(fromShare, toShare)),
        };
    }).filter(Boolean);
}

export default function UserFlowDiagram({ data }) {
    const columns = useMemo(() => buildColumns(data), [data]);

    const maxPopulation = useMemo(
        () => Math.max(1, ...columns.flatMap(c => c.map(n => n.population))),
        [columns]
    );

    // A node's height is MIN_NODE_H (a fixed legibility floor) plus a
    // population-proportional "variable" amount, and `scale` compresses only
    // that variable part when a column would otherwise overflow MAX_TOTAL_H.
    // Scaling MIN_NODE_H itself (the previous approach) meant one dominant
    // node forcing compression dragged every OTHER node in that column below
    // it too — including ones already sitting at the floor — which is what
    // pushed most long-tail nodes under the label-visibility threshold and
    // made a capped, correctly-sized column look like it was full of empty
    // boxes. Keeping the floor fixed guarantees every node stays legible
    // regardless of how dominant one flow is or how many nodes share the
    // column (already bounded to TOP_N_PER_COLUMN + 1 by the API).
    const scale = useMemo(() => {
        let worst = 1;
        for (const col of columns) {
            const fixed = col.length * MIN_NODE_H + Math.max(0, col.length - 1) * NODE_GAP;
            const variableTotal = col.reduce((s, n) => {
                const raw = (n.population / maxPopulation) * MAX_TOTAL_H;
                return s + Math.max(0, raw - MIN_NODE_H);
            }, 0);
            if (variableTotal <= 0) continue;
            const budget = MAX_TOTAL_H - fixed;
            worst = Math.min(worst, budget / variableTotal);
        }
        return Math.max(0, worst);
    }, [columns, maxPopulation]);

    // Y-positions (and heights) per column, keyed by node id.
    const columnLayouts = useMemo(() => columns.map(col => {
        const yMap = new Map();
        let cursor = 0;
        for (const node of col) {
            const raw = (node.population / maxPopulation) * MAX_TOTAL_H;
            const variable = Math.max(0, raw - MIN_NODE_H);
            const height = MIN_NODE_H + variable * scale;
            yMap.set(node.id, { y: cursor, height, population: node.population });
            cursor += height + NODE_GAP;
        }
        return { nodes: col, yMap, totalHeight: cursor - NODE_GAP };
    }), [columns, maxPopulation, scale]);

    const totalHeight = Math.max(...columnLayouts.map(c => c.totalHeight), 40);
    const svgWidth = columns.length * COL_WIDTH + (columns.length - 1) * COL_GAP + 24;
    const svgHeight = totalHeight + 24;

    const ribbons = useMemo(() => {
        const out = [];
        for (let c = 0; c < columns.length - 1; c++) {
            const edges = c === 0
                ? data.channelEdges
                : data.transitionEdges.filter(e => e.depth === c);
            const laid = layoutBoundary(columns[c], columns[c + 1], edges, columnLayouts[c].yMap, columnLayouts[c + 1].yMap);
            for (const r of laid) out.push({ ...r, col: c });
        }
        return out;
    }, [columns, columnLayouts, data]);

    const maxEdgeSessions = Math.max(1, ...ribbons.map(r => r.edge.sessions));

    return (
        <div className="sa-flow-scroll">
            <svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                role="img"
                aria-label="Visitor flow from acquisition channel through subsequent pages"
            >
                {ribbons.map((r, i) => {
                    const x0 = 12 + r.col * (COL_WIDTH + COL_GAP) + COL_WIDTH;
                    const x1 = x0 + COL_GAP;
                    const y0 = 12 + r.y0;
                    const y1 = 12 + r.y1;
                    const midX = (x0 + x1) / 2;
                    const opacity = 0.12 + 0.35 * (r.edge.sessions / maxEdgeSessions);
                    return (
                        <path
                            key={i}
                            d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1}`}
                            stroke={`rgba(192,159,83,${opacity.toFixed(2)})`}
                            strokeWidth={r.width}
                            fill="none"
                        >
                            <title>{`${r.edge.from} → ${r.edge.to}: ${r.edge.sessions.toLocaleString("de-DE")} sessions`}</title>
                        </path>
                    );
                })}

                {columnLayouts.map((col, c) => (
                    <g key={c}>
                        {col.nodes.map(node => {
                            const layout = col.yMap.get(node.id);
                            const x = 12 + c * (COL_WIDTH + COL_GAP);
                            const y = 12 + layout.y;
                            return (
                                <g key={node.id}>
                                    <rect
                                        x={x} y={y} width={COL_WIDTH} height={layout.height}
                                        rx="4"
                                        fill="rgba(192,159,83,0.16)"
                                        stroke="rgba(192,159,83,0.4)"
                                    >
                                        <title>{`${node.id}: ${node.population.toLocaleString("de-DE")} sessions`}</title>
                                    </rect>
                                    <text
                                        x={x + 8} y={y + layout.height / 2}
                                        dominantBaseline="middle"
                                        fontSize="10.5"
                                        fill="rgba(240,235,225,0.9)"
                                    >
                                        {truncate(node.id, 20)}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                ))}
            </svg>
        </div>
    );
}
