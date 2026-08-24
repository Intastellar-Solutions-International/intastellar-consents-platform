const { useState, useMemo, useRef, useEffect, useLayoutEffect } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders } from "./_shared.js";

// Layout constants — tuned for readability, not data-driven. COL_WIDTH/
// COL_GAP are floors, not fixed values — see the column-width calc in the
// component body for how spare container width grows them.
const MIN_COL_WIDTH = 168;
const MAX_COL_WIDTH = 168 * 1.6;
const MIN_COL_GAP   = 96;
const NODE_GAP    = 6;
const MIN_NODE_H  = 26;
const MAX_TOTAL_H = 560;

function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function nodeKey(col, id) {
    return `${col}|${id}`;
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

    // Trailing columns with zero nodes (e.g. reverse mode has few converting
    // sessions whose pageview history reaches that far back) still reserved
    // their full column-width slot otherwise, stretching the diagram out
    // with dead space on the right instead of showing only what's actually
    // there. Emptiness only ever cascades forward — a column can't have
    // nodes if the column its edges come from is empty — so trimming from
    // the first empty column onward is always safe.
    const firstEmpty = columns.findIndex(c => c.length === 0);
    if (firstEmpty > 0) columns.length = firstEmpty;

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

// Every ribbon that's part of any path passing through the clicked node —
// not just its immediate neighbors. Walks forward from the node (following
// its outgoing edges, then their targets' outgoing edges, and so on to the
// last column) and backward (following incoming edges back to column 0), so
// clicking a page in the middle of the diagram traces its full journey: the
// channels/pages that fed it AND everywhere sessions went from there.
function traceFlow(selectedKey, ribbonIndex) {
    const edges = new Set();
    const nodes = new Set([selectedKey]);

    let frontier = [selectedKey];
    while (frontier.length) {
        const next = [];
        for (const key of frontier) {
            for (const r of (ribbonIndex.outgoing.get(key) || [])) {
                edges.add(r);
                const tk = nodeKey(r.col + 1, r.edge.to);
                if (!nodes.has(tk)) { nodes.add(tk); next.push(tk); }
            }
        }
        frontier = next;
    }

    frontier = [selectedKey];
    while (frontier.length) {
        const next = [];
        for (const key of frontier) {
            for (const r of (ribbonIndex.incoming.get(key) || [])) {
                edges.add(r);
                const fk = nodeKey(r.col, r.edge.from);
                if (!nodes.has(fk)) { nodes.add(fk); next.push(fk); }
            }
        }
        frontier = next;
    }

    return { edges, nodes };
}

const DEFAULT_ARIA_LABEL = "Visitor flow from acquisition channel through subsequent pages — click a page to trace its full path";

export default function UserFlowDiagram({ data, conversionNode = null, ariaLabel = DEFAULT_ARIA_LABEL }) {
    const [selected, setSelected] = useState(null); // nodeKey(col, id) or null

    // Exact full-path attribution for the selected node, fetched from
    // api/analytics-user-flow.js's traceCol/traceNode mode — see that file's
    // doc comment for why the aggregate response this component otherwise
    // renders can't answer "how many of THIS node's sessions reached page X"
    // on its own. `trace.key` is tagged with the selection it answers so a
    // stale in-flight response for a since-abandoned selection is never
    // applied — `ignore` alone isn't enough because a second click before
    // the first fetch resolves would otherwise let either one win the race.
    const [trace, setTrace] = useState(null); // { key, channelEdges, transitionEdges } | null
    const [traceLoading, setTraceLoading] = useState(false);

    useEffect(() => {
        // Only the all-traffic diagram has per-session paths to trace back
        // to — a goal-filtered flow is already scoped to converters, and the
        // synthetic "(goal: …)"/"(other)" nodes aren't real DB-filterable
        // values (no single event or pathname to match sessions against).
        if (!selected || data.goal) { setTrace(null); setTraceLoading(false); return; }
        const sep = selected.indexOf("|");
        const col = parseInt(selected.slice(0, sep), 10);
        const id = selected.slice(sep + 1);
        if (id === "(other)" || (conversionNode != null && id === conversionNode)) {
            setTrace(null); setTraceLoading(false); return;
        }

        let ignore = false;
        setTraceLoading(true);
        const qs = new URLSearchParams({
            domain: data.domain, from: data.from, to: data.to, traceCol: col, traceNode: id,
        }).toString();
        fetch(`${ScannerHost}/api/analytics-user-flow?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (ignore) return;
                if (d?.trace) setTrace({ key: selected, channelEdges: d.channelEdges || [], transitionEdges: d.transitionEdges || [] });
                else setTrace(null);
            })
            .catch(() => { if (!ignore) setTrace(null); })
            .finally(() => { if (!ignore) setTraceLoading(false); });
        return () => { ignore = true; };
    }, [selected, data, conversionNode]);

    // Same clientWidth + resize-listener measurement ClickOverlay uses in
    // Heatmap.js. Real container width, not a CSS/viewBox stretch — SVG's
    // viewBox scaling is *uniform* by nature, so stretching only the X axis
    // via preserveAspectRatio="none" was tried and reverted: it distorts
    // stroke width and glyph shapes along with everything else (visible as
    // warped-looking text and ribbon curves that no longer line up with
    // their nodes). Recomputing the actual layout in real pixels instead —
    // wider columns, wider gaps — keeps a 1:1 SVG-unit-to-CSS-pixel mapping
    // so text and strokes render exactly as authored regardless of size.
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useLayoutEffect(() => {
        function measure() {
            setContainerWidth(containerRef.current?.clientWidth || 0);
        }
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    const columns = useMemo(() => buildColumns(data), [data]);

    // Grow column width and gap together (capped, so boxes don't balloon on
    // an ultra-wide panel) when the container has more room than the
    // minimum layout needs; never shrink below the floor — narrower than
    // that falls back to the container's horizontal scroll instead.
    const { colWidth, colGap } = useMemo(() => {
        const n = Math.max(1, columns.length);
        const naturalWidth = n * MIN_COL_WIDTH + Math.max(0, n - 1) * MIN_COL_GAP + 24;
        const rawScale = containerWidth > naturalWidth ? containerWidth / naturalWidth : 1;
        const scale = Math.min(rawScale, MAX_COL_WIDTH / MIN_COL_WIDTH);
        return { colWidth: MIN_COL_WIDTH * scale, colGap: MIN_COL_GAP * scale };
    }, [containerWidth, columns.length]);

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
    const svgWidth = columns.length * colWidth + Math.max(0, columns.length - 1) * colGap + 24;
    // Extra bottom padding so exit-drop ribbons (which extend ~22px below nodes)
    // don't get clipped — without this, the last row of nodes only has ~12px of
    // breathing room below them in the SVG canvas.
    const svgHeight = totalHeight + 24 + (data.exitCounts?.length > 0 ? 22 : 0);

    // How many characters fit a node label before truncating — scales with
    // the actual box width now that it's no longer a fixed 168px, so wider
    // columns show more of a long pathname instead of cutting off at the
    // same point regardless of how much room there actually is.
    const labelChars = Math.max(8, Math.floor((colWidth - 16) / 6));

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

    // Indexed by the node a ribbon leaves from / arrives at, for tracing a
    // clicked node's full path in both directions.
    const ribbonIndex = useMemo(() => {
        const outgoing = new Map(); // nodeKey(col, from) -> ribbons leaving that node
        const incoming = new Map(); // nodeKey(col+1, to) -> ribbons arriving at that node
        for (const r of ribbons) {
            const outKey = nodeKey(r.col, r.edge.from);
            const inKey  = nodeKey(r.col + 1, r.edge.to);
            if (!outgoing.has(outKey)) outgoing.set(outKey, []);
            outgoing.get(outKey).push(r);
            if (!incoming.has(inKey)) incoming.set(inKey, []);
            incoming.get(inKey).push(r);
        }
        return { outgoing, incoming };
    }, [ribbons]);

    const highlight = useMemo(
        () => selected ? traceFlow(selected, ribbonIndex) : null,
        [selected, ribbonIndex]
    );

    // When a node is selected, compute the session count each highlighted node
    // contributes within the traced subgraph — not its total population.
    //
    // Selected node: its own full population (anchor).
    // Upstream (col < selCol): sum of highlighted outgoing ribbons — accurate,
    //   because traceFlow adds only the ribbons that lead to the selected node.
    // Direct downstream (col = selCol + 1): sum of highlighted incoming ribbons
    //   from the selected node — accurate edge sessions.
    // Further downstream (col > selCol + 1): the data only has pairwise edge
    //   counts, not 3-way attribution, so we can't know exactly how many of
    //   "adwords → /" sessions then went to "/contact". Instead we propagate
    //   proportionally: for each incoming ribbon, take the fraction of the
    //   source node that belongs to the selected flow and apply it to the
    //   ribbon's session count. Nodes MUST be processed column by column so
    //   each column's filtered values are ready when the next column reads them.
    const filteredPopMap = useMemo(() => {
        if (!highlight || !selected) return null;
        const selSep = selected.indexOf("|");
        const selCol = parseInt(selected.slice(0, selSep), 10);
        const map = new Map();

        // Group highlighted nodes by column, then sort columns so upstream
        // values are computed before downstream columns read them.
        const byCol = new Map();
        for (const key of highlight.nodes) {
            const c = parseInt(key.slice(0, key.indexOf("|")), 10);
            if (!byCol.has(c)) byCol.set(c, []);
            byCol.get(c).push(key);
        }
        const sortedCols = [...byCol.keys()].sort((a, b) => a - b);

        for (const col of sortedCols) {
            for (const key of byCol.get(col)) {
                const nid = key.slice(key.indexOf("|") + 1);

                if (col === selCol) {
                    map.set(key, columnLayouts[col]?.yMap.get(nid)?.population ?? 0);

                } else if (col < selCol) {
                    // Upstream: only the highlighted outgoing ribbons lead toward
                    // the selected node, so their sum is the exact count.
                    map.set(key,
                        (ribbonIndex.outgoing.get(key) || [])
                            .filter(r => highlight.edges.has(r))
                            .reduce((s, r) => s + r.edge.sessions, 0));

                } else if (col === selCol + 1) {
                    // First hop downstream: highlighted incoming ribbons come
                    // directly from the selected node — exact sessions.
                    map.set(key,
                        (ribbonIndex.incoming.get(key) || [])
                            .filter(r => highlight.edges.has(r))
                            .reduce((s, r) => s + r.edge.sessions, 0));

                } else {
                    // Further downstream: proportional estimate. Each incoming
                    // highlighted ribbon contributes (fromFiltered / fromTotal)
                    // of its session count, preserving the filter ratio from
                    // the previous column.
                    let est = 0;
                    for (const r of (ribbonIndex.incoming.get(key) || [])) {
                        if (!highlight.edges.has(r)) continue;
                        const fromKey   = nodeKey(r.col, r.edge.from);
                        const fromFilt  = map.get(fromKey) ?? 0;
                        const fromTotal = columnLayouts[r.col]?.yMap.get(r.edge.from)?.population ?? 1;
                        if (fromTotal > 0) est += r.edge.sessions * (fromFilt / fromTotal);
                    }
                    map.set(key, Math.round(est));
                }
            }
        }
        return map;
    }, [highlight, selected, columnLayouts, ribbonIndex]);

    // Further-downstream columns above are a *proportional estimate*, not an
    // exact count — a real edge can still round down to 0 attributed
    // sessions once the selected flow is a small slice of a busy page. Left
    // as "highlighted", those ribbons draw at full gold opacity into a node
    // that the selection didn't actually reach, implying a connection that
    // isn't there. Tracked separately from filteredPopMap itself (rather
    // than deleting the 0-entries) since the map is also read by name below
    // to decide whether a node is "in the traced subgraph" at all.
    const zeroFilteredKeys = useMemo(() => {
        if (!filteredPopMap) return null;
        const s = new Set();
        for (const [key, sessions] of filteredPopMap) if (sessions === 0) s.add(key);
        return s;
    }, [filteredPopMap]);

    // Exact per-edge attribution from the trace fetch above, once it resolves
    // for the CURRENT selection (trace.key === selected guards against a
    // response landing after the selection already moved on — see that
    // effect's comment). Remapped through `columns` the same way the backend
    // remaps raw pathnames to "(other)" — a trace can return a raw pathname
    // that individually never made this column's top-N cap, and it needs to
    // land on the same "(other)" box the uncapped view already folded it
    // into, or the ribbon has nowhere on-diagram to attach to.
    const traceEdgeSessions = useMemo(() => {
        if (!trace || trace.key !== selected) return null;
        const map = new Map(); // JSON.stringify([col, from, to]) -> sessions
        const remap = (col, id) => (columns[col]?.some(n => n.id === id) ? id : "(other)");
        const add = (col, from, to, sessions) => {
            const key = JSON.stringify([col, remap(col, from), remap(col + 1, to)]);
            map.set(key, (map.get(key) || 0) + sessions);
        };
        for (const e of trace.channelEdges) add(0, e.from, e.to, e.sessions);
        for (const e of trace.transitionEdges) add(e.depth, e.from, e.to, e.sessions);
        return map;
    }, [trace, selected, columns]);

    // Per-node totals derived from the same exact edges — unlike
    // filteredPopMap's estimate, this needs no special-casing for the
    // selected node itself: since the trace query is filtered to exactly the
    // sessions that pass through it, summing its incoming (or, for a channel
    // node, outgoing) edges already equals its true attributed population.
    const exactPopMap = useMemo(() => {
        if (!traceEdgeSessions) return null;
        const map = new Map(); // nodeKey(col, id) -> sessions
        for (const [key, sessions] of traceEdgeSessions) {
            const [col, from, to] = JSON.parse(key);
            if (col === 0) map.set(nodeKey(0, from), (map.get(nodeKey(0, from)) || 0) + sessions);
            map.set(nodeKey(col + 1, to), (map.get(nodeKey(col + 1, to)) || 0) + sessions);
        }
        return map;
    }, [traceEdgeSessions]);

    const maxEdgeSessions = Math.max(1, ...ribbons.map(r => r.edge.sessions));

    // exitCount.depth from the API maps directly to the frontend column index:
    // depth=1 → columns[1] (first pages), depth=2 → columns[2], etc.
    const exitMap = useMemo(() => {
        const m = new Map();
        for (const e of (data.exitCounts || [])) m.set(nodeKey(e.depth, e.node), e.sessions);
        return m;
    }, [data]);

    // Reserve ~44px on the right for the exit badge when present
    const exitLabelChars = Math.max(8, Math.floor((colWidth - 52) / 6));

    function toggleNode(col, id) {
        const key = nodeKey(col, id);
        setSelected(prev => prev === key ? null : key);
    }

    return (
        <div>
            {selected && (
                <button type="button" className="sa-flow-clear" onClick={() => setSelected(null)}>
                    &times; Clear selection
                </button>
            )}
            {traceLoading && <span className="sa-flow-trace-loading">Computing exact path counts&hellip;</span>}
            <div className="sa-flow-scroll" ref={containerRef}>
                <svg
                    width={svgWidth}
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    role="img"
                    aria-label={ariaLabel}
                >
                    {ribbons.map((r, i) => {
                        const wouldBeOn = highlight?.edges.has(r);
                        // Whether a "highlighted" ribbon actually gets drawn: exact
                        // attribution when the trace for this selection has resolved
                        // (a real edge among qualifying sessions, or it simply isn't
                        // in traceEdgeSessions at all — no rounding involved), else
                        // the proportional estimate's own 0-drop as an immediate
                        // fallback while the trace is loading. Dropped outright rather
                        // than dimmed either way — it's not "less emphasized
                        // background traffic" like a genuinely off-path ribbon, it's a
                        // link the selection didn't actually produce any visitors on.
                        if (wouldBeOn) {
                            if (traceEdgeSessions) {
                                const key = JSON.stringify([r.col, r.edge.from, r.edge.to]);
                                if (!traceEdgeSessions.get(key)) return null;
                            } else if (zeroFilteredKeys?.has(nodeKey(r.col + 1, r.edge.to))) {
                                return null;
                            }
                        }
                        const x0 = 12 + r.col * (colWidth + colGap) + colWidth;
                        const x1 = x0 + colGap;
                        const y0 = 12 + r.y0;
                        const y1 = 12 + r.y1;
                        const midX = (x0 + x1) / 2;
                        const baseOpacity = 0.12 + 0.35 * (r.edge.sessions / maxEdgeSessions);
                        const isOn = wouldBeOn;
                        const opacity = !highlight ? baseOpacity : (isOn ? Math.min(1, baseOpacity + 0.5) : baseOpacity * 0.15);
                        const stroke = isOn ? `rgba(240,205,120,${opacity.toFixed(2)})` : `rgba(192,159,83,${opacity.toFixed(2)})`;
                        return (
                            <path
                                key={i}
                                d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1}`}
                                stroke={stroke}
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
                                const x = 12 + c * (colWidth + colGap);
                                const y = 12 + layout.y;
                                const key = nodeKey(c, node.id);
                                const isSelected = selected === key;
                                // Same "dropped, not dimmed" treatment as the ribbons
                                // above — a node the selection only reaches via a
                                // rounds-to-0 proportional estimate (or, once exact
                                // data has loaded, zero real attributed sessions) isn't
                                // really part of this flow, so it shouldn't get the
                                // gold highlight (or a misleading session count) either.
                                const isOn = highlight
                                    ? isSelected || (exactPopMap
                                        ? (exactPopMap.get(key) ?? 0) > 0
                                        : highlight.nodes.has(key) && !zeroFilteredKeys?.has(key))
                                    : true;
                                const isGoal = conversionNode != null && node.id === conversionNode;
                                const fillOpacity = isOn ? (isSelected ? 0.36 : 0.16) : 0.05;
                                const strokeOpacity = isOn ? (isSelected ? 0.9 : 0.4) : 0.12;
                                const textOpacity = isOn ? 0.9 : 0.25;
                                // Goal node uses the same green already used for
                                // "success"/consent-yes states elsewhere in this
                                // dashboard (rgba(74,222,128,...)) — distinct from
                                // the gold used for every real page node, and from
                                // the brighter gold used for the active selection.
                                const rgb = isGoal ? "74,222,128" : isSelected ? "240,205,120" : "192,159,83";

                                // Drop-off: sessions that arrived at this node but didn't continue.
                                // Suppress on the last rendered column — those exits mean "end of
                                // tracking depth", not a real bounce signal.
                                const exitSessions = c < columns.length - 1 ? exitMap.get(key) : undefined;
                                const exitPct = exitSessions != null && node.population > 0
                                    ? exitSessions / node.population * 100 : null;
                                const exitPctStr = exitPct == null ? null
                                    : exitPct < 1 ? "<1%"
                                    : exitPct >= 99.5 ? "100%"
                                    : exitPct.toFixed(1) + "%";

                                // When a selection is active, display the filtered session
                                // count for this node (how many of the selected sessions
                                // passed through here) instead of the total population —
                                // exact once the trace has resolved, the proportional
                                // estimate until then.
                                const filteredPop = exactPopMap ? (exactPopMap.get(key) ?? 0) : (filteredPopMap?.get(key) ?? null);
                                const displayPop  = filteredPop !== null ? filteredPop : node.population;

                                // Right-side label: filtered session count while a selection
                                // is active (replaces exit %, which isn't meaningful on a
                                // filtered sub-graph); exit % when nothing is selected.
                                const rightLabel = highlight && isOn
                                    ? displayPop.toLocaleString("de-DE")
                                    : exitPctStr ? `↓ ${exitPctStr}` : null;
                                const rightLabelColor = highlight && isOn
                                    ? `rgba(240,235,225,${textOpacity * 0.75})`
                                    : `rgba(248,113,113,${isOn ? 0.9 : 0.2})`;

                                const tooltipText = highlight && isOn
                                    ? `${node.id}: ${displayPop.toLocaleString("de-DE")} of ${node.population.toLocaleString("de-DE")} sessions`
                                    : exitPctStr
                                        ? `${node.id}: ${node.population.toLocaleString("de-DE")} sessions · ↓ ${exitPctStr} drop-off (${exitSessions.toLocaleString("de-DE")} left)`
                                        : `${node.id}: ${node.population.toLocaleString("de-DE")} sessions`;

                                // Drop-off ribbon: a closed "fin" shape that starts from the
                                // exit portion of the node's right edge (bottom fraction),
                                // curves right and down, then back to the node edge. Using
                                // a filled closed path instead of a thick stroke avoids the
                                // blob effect you get when strokeWidth is proportional to
                                // a large exit height on a short bezier curve.
                                //
                                // Shape: two quadratic beziers forming a sideways D:
                                //   top edge: (xRight, yExitTop) → curves right → (xRight+spread, yEnd)
                                //   bottom edge: (xRight+spread, yEnd+endH) → curves back → (xRight, yExitBot)
                                //   closed by a straight line up the node right edge.
                                const exitRibbon = exitPctStr ? (() => {
                                    const exitRatio = exitSessions / node.population;
                                    const exitH = Math.max(3, exitRatio * layout.height);
                                    const yExitTop = y + layout.height - exitH;
                                    const yExitBot = y + layout.height;
                                    const spread = Math.min(14, exitH * 0.25 + 4);
                                    const drop   = Math.max(6,  exitH * 0.2  + 4);
                                    const yEnd   = yExitBot + drop;
                                    const endH   = Math.max(2,  exitH * 0.08);
                                    const yMid   = (yExitTop + yEnd) / 2;
                                    const xRight = x + colWidth;
                                    const fOpacity = isOn ? 0.22 : 0.05;
                                    const sOpacity = isOn ? 0.6  : 0.12;
                                    return (
                                        <path
                                            d={[
                                                `M ${xRight} ${yExitTop}`,
                                                `Q ${xRight + spread} ${yMid} ${xRight + spread} ${yEnd}`,
                                                `L ${xRight + spread} ${yEnd + endH}`,
                                                `Q ${xRight + spread} ${yMid + endH} ${xRight} ${yExitBot}`,
                                                "Z",
                                            ].join(" ")}
                                            fill={`rgba(248,113,113,${fOpacity})`}
                                            stroke={`rgba(248,113,113,${sOpacity})`}
                                            strokeWidth="0.8"
                                        />
                                    );
                                })() : null;

                                return (
                                    <g
                                        key={node.id}
                                        onClick={() => toggleNode(c, node.id)}
                                        style={{ cursor: "pointer" }}
                                        tabIndex={0}
                                        role="button"
                                        aria-pressed={isSelected}
                                        aria-label={`${node.id}, ${displayPop.toLocaleString("de-DE")} sessions${!highlight && exitPctStr ? `, ${exitPctStr} drop-off` : ""}`}
                                        onKeyDown={e => {
                                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleNode(c, node.id); }
                                        }}
                                    >
                                        {exitRibbon}
                                        <rect
                                            x={x} y={y} width={colWidth} height={layout.height}
                                            rx="4"
                                            fill={`rgba(${rgb},${fillOpacity})`}
                                            stroke={`rgba(${rgb},${strokeOpacity})`}
                                            strokeWidth={isSelected || isGoal ? 1.6 : 1}
                                        >
                                            <title>{tooltipText}</title>
                                        </rect>
                                        <text
                                            x={x + 8} y={y + layout.height / 2}
                                            dominantBaseline="middle"
                                            fontSize="10.5"
                                            fill={`rgba(240,235,225,${textOpacity})`}
                                        >
                                            {truncate(node.id, rightLabel ? exitLabelChars : labelChars)}
                                        </text>
                                        {rightLabel && (
                                            <text
                                                x={x + colWidth - 6}
                                                y={y + layout.height / 2}
                                                textAnchor="end"
                                                dominantBaseline="middle"
                                                fontSize="9"
                                                fill={rightLabelColor}
                                            >
                                                {rightLabel}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}
