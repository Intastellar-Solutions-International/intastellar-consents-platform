const { useState, useMemo, useRef, useEffect, useLayoutEffect } = React;
import { ScannerHost } from "../../API/host.js";
import { t } from "../../i18n/index.js";
import { authHeaders } from "./_shared.js";

// Layout constants — tuned for readability, not data-driven. COL_WIDTH/
// COL_GAP are floors, not fixed values — see the column-width calc in the
// component body for how spare container width grows them. Below
// COMPACT_BREAKPOINT (phones, narrow panels) the floors drop to the COMPACT_
// values so far more of the flow fits before the sideways scroll kicks in.
const MIN_COL_WIDTH = 168;
const MAX_COL_WIDTH = 168 * 1.6;
const MIN_COL_GAP   = 96;
const COMPACT_BREAKPOINT = 720;
const COMPACT_COL_WIDTH  = 124;
const COMPACT_COL_GAP    = 48;
const NODE_GAP    = 6;
const MIN_NODE_H  = 26;
const MAX_TOTAL_H = 560;
// Column header row drawn above the nodes, inside the SVG so it scrolls
// sideways together with the columns it labels.
const HEADER_H = 22;
const PAD      = 12;
const TOP      = PAD + HEADER_H;
// Barycenter passes for crossing reduction — see reduceCrossings().
const ORDER_SWEEPS = 6;

const fmt = n => n.toLocaleString("de-DE");

// Colors come from the Analytics.css tokens (RGB triplets) so the diagram
// follows the same palette as every other Analytics page. SVG presentation
// attributes (fill="…") don't resolve var(), so these go through `style`.
function tone(token, alpha) {
    return `rgba(var(--${token}),${alpha.toFixed(2)})`;
}

function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function nodeKey(col, id) {
    return `${col}|${id}`;
}

function boundaryEdges(data, c) {
    return c === 0 ? data.channelEdges : data.transitionEdges.filter(e => e.depth === c);
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

// Normalized vertical centre (0..1) of every node in a column, weighted by
// population — what a node's on-screen position actually tracks, since
// heights are population-proportional.
function centres(col) {
    const total = col.reduce((s, n) => s + n.population, 0) || 1;
    const m = new Map();
    let acc = 0;
    for (const n of col) {
        m.set(n.id, (acc + n.population / 2) / total);
        acc += n.population;
    }
    return m;
}

// Re-sorts one column by the session-weighted average position of the
// nodes it's connected to on the other side. "(other)" always stays at the
// bottom — it's a catch-all, and moving it around reads as if it were a
// real page.
function sortByBarycenter(col, edges, selfOf, otherCentre) {
    const sum = new Map();
    const weight = new Map();
    for (const e of edges) {
        const p = otherCentre(e);
        if (p == null) continue;
        const id = selfOf(e);
        sum.set(id, (sum.get(id) || 0) + p * e.sessions);
        weight.set(id, (weight.get(id) || 0) + e.sessions);
    }
    const current = centres(col);
    const bary = id => weight.get(id) ? sum.get(id) / weight.get(id) : current.get(id);
    col.sort((a, b) =>
        (a.id === "(other)") - (b.id === "(other)")
        || bary(a.id) - bary(b.id)
        || b.population - a.population);
}

// Session-weighted crossing count across every column boundary: two
// ribbons cross when their order flips between the left and right side.
// Edge counts per boundary are capped by the API (TOP_N_PER_COLUMN), so the
// pairwise loop stays small.
function countCrossings(columns, edgesByBoundary) {
    let total = 0;
    for (let c = 0; c < columns.length - 1; c++) {
        const fromIdx = new Map(columns[c].map((n, i) => [n.id, i]));
        const toIdx   = new Map(columns[c + 1].map((n, i) => [n.id, i]));
        const edges = edgesByBoundary[c].filter(e => fromIdx.has(e.from) && toIdx.has(e.to));
        for (let i = 0; i < edges.length; i++) {
            for (let j = i + 1; j < edges.length; j++) {
                const a = edges[i], b = edges[j];
                const df = fromIdx.get(a.from) - fromIdx.get(b.from);
                const dt = toIdx.get(a.to) - toIdx.get(b.to);
                if (df * dt < 0) total += a.sessions * b.sessions;
            }
        }
    }
    return total;
}

// Classic layered-graph barycenter heuristic: alternate forward sweeps
// (order each column by where its incoming ribbons come from) and backward
// sweeps (by where its outgoing ribbons go), keeping whichever ordering had
// the fewest weighted crossings. Starting from the population sort and only
// ever accepting improvements means the result is never more tangled than
// the plain biggest-first layout this replaced.
function reduceCrossings(columns, data) {
    if (columns.length < 2) return columns;
    const edgesByBoundary = columns.slice(0, -1).map((_, c) => boundaryEdges(data, c));
    const snapshot = () => columns.map(col => col.slice());
    let best = snapshot();
    let bestScore = countCrossings(columns, edgesByBoundary);

    for (let s = 0; s < ORDER_SWEEPS && bestScore > 0; s++) {
        for (let c = 1; c < columns.length; c++) {
            const pos = centres(columns[c - 1]);
            sortByBarycenter(columns[c], edgesByBoundary[c - 1], e => e.to, e => pos.get(e.from));
        }
        for (let c = columns.length - 2; c >= 0; c--) {
            const pos = centres(columns[c + 1]);
            sortByBarycenter(columns[c], edgesByBoundary[c], e => e.from, e => pos.get(e.to));
        }
        const score = countCrossings(columns, edgesByBoundary);
        if (score < bestScore) { bestScore = score; best = snapshot(); }
    }
    return best;
}

// What each column means — differs by mode. Forward (all traffic or
// "Forward, filtered"): channel, then pages in session order. Backward from
// goal: columns count down the pages before converting and end in the
// synthetic goal node (see api/analytics-user-flow.js's direction=to doc).
function columnLabels(data, count) {
    const reverse = data.goal && data.direction !== "from";
    const R = (data.flowDepth || 4) + 1;
    return Array.from({ length: count }, (_, c) => {
        if (reverse) {
            const before = R - c;
            if (before <= 0) return t("Goal");
            return before === 1 ? t("1 page before") : t("{n} pages before", { n: before });
        }
        if (c === 0) return t("Channel");
        if (c === 1) return t("Landing page");
        return t("Page {n}", { n: c });
    });
}

// "+12%", "−3.4%", "new" — a node or path that had no sessions in the
// previous period has no meaningful percentage.
function formatDelta(cur, prev) {
    if (!prev) return cur > 0 ? { text: t("new"), sign: 1 } : null;
    const pct = (cur - prev) / prev * 100;
    const abs = Math.abs(pct);
    if (abs < 0.5) return { text: "±0%", sign: 0 };
    return {
        text: `${pct > 0 ? "+" : "−"}${abs >= 10 ? Math.round(abs) : abs.toFixed(1)}%`,
        sign: Math.sign(pct),
    };
}

function deltaToken(delta) {
    return !delta || delta.sign === 0 ? "sa-neutral" : delta.sign > 0 ? "sa-good" : "sa-bad";
}

// Sub-band positions for every edge crossing one column boundary — each
// node's height is divided among its edges (proportional to session share),
// stacked in the order that minimizes crossing (sorted by the position of
// the node on the other side).
function layoutBoundary(fromCol, toCol, edges, fromY, toY) {
    const fromIndex = new Map(fromCol.map((n, i) => [n.id, i]));
    const toIndex   = new Map(toCol.map((n, i) => [n.id, i]));

    const sorted = edges.slice().sort((a, b) =>
        (fromIndex.get(a.from) ?? 0) - (fromIndex.get(b.from) ?? 0)
        || (toIndex.get(a.to) ?? 0) - (toIndex.get(b.to) ?? 0));

    const fromCursor = new Map();
    const toCursor   = new Map();
    // Incoming bands are stacked by source position, so allocate the
    // arriving side in that order rather than the leaving side's order.
    const toOffset = new Map();
    for (const e of edges.slice().sort((a, b) =>
        (toIndex.get(a.to) ?? 0) - (toIndex.get(b.to) ?? 0)
        || (fromIndex.get(a.from) ?? 0) - (fromIndex.get(b.from) ?? 0))) {
        const toNode = toY.get(e.to);
        if (!toNode) continue;
        const toShare = toNode.population > 0 ? (e.sessions / toNode.population) * toNode.height : toNode.height;
        const tCursor = toCursor.get(e.to) || 0;
        toCursor.set(e.to, tCursor + toShare);
        toOffset.set(e, { offset: tCursor, share: toShare });
    }

    return sorted.map(e => {
        const fromNode = fromY.get(e.from);
        const toNode   = toY.get(e.to);
        if (!fromNode || !toNode) return null;

        const fromShare = fromNode.population > 0 ? (e.sessions / fromNode.population) * fromNode.height : fromNode.height;
        const fCursor = fromCursor.get(e.from) || 0;
        fromCursor.set(e.from, fCursor + fromShare);
        const { offset: tCursor, share: toShare } = toOffset.get(e);

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

// One title + label/value rows — rendered both as the hover card (mouse)
// and as the selection panel above the diagram (touch and keyboard users,
// who never get a hover).
function FlowDetail({ detail, className }) {
    return (
        <div className={className}>
            <div className="sa-flow-detail__title">{detail.title}</div>
            <dl className="sa-flow-detail__rows">
                {detail.rows.map(row => (
                    <div key={row.label} className="sa-flow-detail__row">
                        <dt>{row.label}</dt>
                        <dd style={row.token ? { color: tone(row.token, 0.95) } : undefined}>{row.value}</dd>
                    </div>
                ))}
            </dl>
            {detail.hint && <div className="sa-flow-detail__hint">{detail.hint}</div>}
        </div>
    );
}

export default function UserFlowDiagram({ data, compareData = null, conversionNode = null, ariaLabel }) {
    const [selected, setSelected] = useState(null); // nodeKey(col, id) or null
    // Mouse hover / keyboard focus. `x`/`y` (container-relative pixels) are
    // only set for a real pointer — focus previews the path without a card,
    // since the selection panel is the keyboard-accessible version.
    const [hover, setHover] = useState(null); // { kind: "node"|"ribbon", key|index, x?, y? } | null

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

    // A new data set (date range, goal, direction) re-lays-out every column,
    // so any key pointing into the previous layout is meaningless.
    useEffect(() => { setSelected(null); setHover(null); }, [data]);

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
    const canvasRef = useRef(null);
    const scrollRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);
    // Which edges have more diagram hidden behind the sideways scroll —
    // drives the fade shown on that side so it's obvious there's more.
    const [overflow, setOverflow] = useState({ left: false, right: false });

    function measureOverflow() {
        const el = scrollRef.current;
        if (!el) return;
        const left = el.scrollLeft > 2;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
        setOverflow(prev => prev.left === left && prev.right === right ? prev : { left, right });
    }

    useLayoutEffect(() => {
        function measure() {
            setContainerWidth(scrollRef.current?.clientWidth || 0);
            measureOverflow();
        }
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    const columns = useMemo(() => reduceCrossings(buildColumns(data), data), [data]);
    const headers = useMemo(() => columnLabels(data, columns.length), [data, columns.length]);

    // Grow column width and gap together (capped, so boxes don't balloon on
    // an ultra-wide panel) when the container has more room than the
    // minimum layout needs; never shrink below the floor — narrower than
    // that falls back to the container's horizontal scroll instead.
    const compact = containerWidth > 0 && containerWidth < COMPACT_BREAKPOINT;
    const { colWidth, colGap } = useMemo(() => {
        const minW = compact ? COMPACT_COL_WIDTH : MIN_COL_WIDTH;
        const minG = compact ? COMPACT_COL_GAP : MIN_COL_GAP;
        const n = Math.max(1, columns.length);
        const naturalWidth = n * minW + Math.max(0, n - 1) * minG + PAD * 2;
        const rawScale = containerWidth > naturalWidth ? containerWidth / naturalWidth : 1;
        const scale = Math.min(rawScale, MAX_COL_WIDTH / minW);
        return { colWidth: minW * scale, colGap: minG * scale };
    }, [containerWidth, columns.length, compact]);

    useLayoutEffect(measureOverflow, [colWidth, colGap, columns.length]);

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
    const svgWidth = columns.length * colWidth + Math.max(0, columns.length - 1) * colGap + PAD * 2;
    // Extra bottom padding so exit-drop ribbons (which extend ~22px below nodes)
    // don't get clipped — without this, the last row of nodes only has ~12px of
    // breathing room below them in the SVG canvas.
    const svgHeight = totalHeight + TOP + PAD + (data.exitCounts?.length > 0 ? 22 : 0);
    const colX = c => PAD + c * (colWidth + colGap);

    // How many characters fit a node label before truncating — scales with
    // the actual box width now that it's no longer a fixed 168px, so wider
    // columns show more of a long pathname instead of cutting off at the
    // same point regardless of how much room there actually is.
    const labelChars = Math.max(8, Math.floor((colWidth - 16) / 6));
    // Reserve ~44px on the right for the exit badge when present
    const exitLabelChars = Math.max(8, Math.floor((colWidth - 52) / 6));

    const ribbons = useMemo(() => {
        const out = [];
        for (let c = 0; c < columns.length - 1; c++) {
            const laid = layoutBoundary(columns[c], columns[c + 1], boundaryEdges(data, c), columnLayouts[c].yMap, columnLayouts[c + 1].yMap);
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

    // A click selection wins; otherwise hovering (or focusing) a node
    // previews its path. Only a selection switches node labels to per-path
    // counts and fetches the exact trace — a hover is just a quick look.
    const hoveredNodeKey = hover?.kind === "node" ? hover.key : null;
    const pathKey = selected ?? hoveredNodeKey;
    const highlight = useMemo(
        () => pathKey ? traceFlow(pathKey, ribbonIndex) : null,
        [pathKey, ribbonIndex]
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

    // Previous-period populations for the compare header control, keyed the
    // same way as the current layout. Matched by (column, id) — "(other)" is
    // left out since it's a different mix of long-tail pages in each period
    // and a delta between two unrelated buckets would mean nothing.
    const prevNodeMap = useMemo(() => {
        if (!compareData || compareData.noSiteKey || !compareData.channelEdges) return null;
        const m = new Map();
        buildColumns(compareData).forEach((col, c) => {
            for (const n of col) m.set(nodeKey(c, n.id), n.population);
        });
        return m;
    }, [compareData]);

    const prevEdgeMap = useMemo(() => {
        if (!prevNodeMap) return null;
        const m = new Map(); // JSON.stringify([col, from, to]) -> sessions
        for (const e of compareData.channelEdges) m.set(JSON.stringify([0, e.from, e.to]), e.sessions);
        for (const e of compareData.transitionEdges) m.set(JSON.stringify([e.depth, e.from, e.to]), e.sessions);
        return m;
    }, [prevNodeMap, compareData]);

    function nodeDelta(key, id, population) {
        if (!prevNodeMap || id === "(other)") return null;
        const prev = prevNodeMap.get(key) || 0;
        return { prev, delta: formatDelta(population, prev) };
    }

    const maxEdgeSessions = Math.max(1, ...ribbons.map(r => r.edge.sessions));

    // exitCount.depth from the API maps directly to the frontend column index:
    // depth=1 → columns[1] (first pages), depth=2 → columns[2], etc.
    const exitMap = useMemo(() => {
        const m = new Map();
        for (const e of (data.exitCounts || [])) m.set(nodeKey(e.depth, e.node), e.sessions);
        return m;
    }, [data]);

    // Validation errors per pathname — form_error events fired on sessions
    // that visited that page. Only present in all-traffic mode (goal views
    // don't include this field). Keyed by pathname (the node id for page
    // columns), not by (depth, node), since errors are a property of the
    // page itself and the same count applies wherever that page appears.
    const validationErrorMap = useMemo(() => {
        const m = new Map(); // pathname -> { occurrences, sessions }
        for (const e of (data.validationErrors || [])) {
            m.set(e.node, { occurrences: e.occurrences, sessions: e.sessions });
        }
        return m;
    }, [data]);

    // Same depth→column mapping as exitMap, keyed to a node's per-host
    // session split — a bare pathname like "/" is ambiguous once a site key
    // is shared across a root domain and a booking/white-label subdomain
    // (see api/analytics-user-flow.js's doc comment on this field), so
    // the detail card shows which host(s) a node's traffic actually came from.
    // Empty (host breakdown is only computed in all-traffic mode) rather
    // than missing for goal/reverse views, so lookups below stay unconditional.
    const hostMap = useMemo(() => {
        const m = new Map(); // nodeKey(col, id) -> [{host, sessions}] sorted desc
        for (const e of (data.hostBreakdown || [])) {
            const key = nodeKey(e.depth, e.node);
            if (!m.has(key)) m.set(key, []);
            m.get(key).push({ host: e.host, sessions: e.sessions });
        }
        for (const list of m.values()) list.sort((a, b) => b.sessions - a.sessions);
        return m;
    }, [data]);

    // "example.com" for a single-host node, "example.com: 80, sub.example.com: 20"
    // once a node's traffic actually splits across hosts — the common case
    // (one host) stays terse rather than always showing a redundant count.
    function hostList(key) {
        const hosts = hostMap.get(key);
        if (!hosts || !hosts.length) return null;
        if (hosts.length === 1) return hosts[0].host;
        return hosts.map(h => `${h.host}: ${fmt(h.sessions)}`).join(", ");
    }

    // Everything the diagram knows about one node, computed once and shared
    // by the SVG rendering, its aria-label and the detail card.
    function nodeInfo(c, node) {
        const key = nodeKey(c, node.id);
        const layout = columnLayouts[c].yMap.get(node.id);
        const isSelected = selected === key;
        // Same "dropped, not dimmed" treatment as the ribbons — a node the
        // selection only reaches via a rounds-to-0 proportional estimate (or,
        // once exact data has loaded, zero real attributed sessions) isn't
        // really part of this flow, so it shouldn't get the gold highlight
        // (or a misleading session count) either.
        const isOn = highlight
            ? key === pathKey || (exactPopMap
                ? (exactPopMap.get(key) ?? 0) > 0
                : highlight.nodes.has(key) && !zeroFilteredKeys?.has(key))
            : true;

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

        // With a selection active, how many of the selected sessions passed
        // through here — exact once the trace has resolved, the proportional
        // estimate until then.
        const filteredPop = selected
            ? (exactPopMap ? (exactPopMap.get(key) ?? 0) : (filteredPopMap?.get(key) ?? null))
            : null;
        const displayPop = filteredPop !== null ? filteredPop : node.population;

        // Validation errors for this page node (page columns only — col 0 is
        // acquisition channels, not real pathnames). "(other)" nodes are
        // skipped since they're a heterogeneous bucket with no single page to
        // attribute errors to.
        const err = c > 0 && node.id !== "(other)" ? validationErrorMap.get(node.id) ?? null : null;

        return {
            key, layout, isSelected, isOn, exitSessions, exitPctStr, filteredPop, displayPop, err,
            compare: nodeDelta(key, node.id, node.population),
        };
    }

    function nodeDetail(c, node) {
        const info = nodeInfo(c, node);
        const rows = [];
        if (selected && info.isOn && !info.isSelected && info.filteredPop !== null) {
            rows.push({
                label: t("Selected flow"),
                value: t("{n} of {total} sessions", { n: fmt(info.displayPop), total: fmt(node.population) }),
            });
        } else {
            rows.push({ label: t("Sessions"), value: fmt(node.population) });
        }
        if (info.compare) {
            rows.push({
                label: t("Previous period"),
                value: `${fmt(info.compare.prev)} (${info.compare.delta?.text ?? "±0%"})`,
                token: deltaToken(info.compare.delta),
            });
        }
        if (info.exitPctStr) {
            rows.push({
                label: t("Drop-off"),
                value: t("{pct} ({n} left)", { pct: info.exitPctStr, n: fmt(info.exitSessions) }),
                token: "sa-bad",
            });
        }
        if (info.err) {
            rows.push({
                label: t("Validation errors"),
                value: t("{sessions} sessions · {total} total", { sessions: fmt(info.err.sessions), total: fmt(info.err.occurrences) }),
                token: "sa-warn",
            });
        }
        const hosts = hostList(info.key);
        if (hosts) rows.push({ label: t("Hosts"), value: hosts });
        return {
            title: `${headers[c]} · ${node.id}`,
            rows,
            hint: info.isSelected ? t("Click again to clear the selection") : t("Click to trace every path through this step"),
        };
    }

    function ribbonDetail(r) {
        const fromPop = columnLayouts[r.col].yMap.get(r.edge.from)?.population || 0;
        const rows = [
            { label: t("Sessions"), value: fmt(r.edge.sessions) },
        ];
        if (fromPop > 0) {
            rows.push({
                label: t("Share of {node}", { node: truncate(r.edge.from, 28) }),
                value: `${(r.edge.sessions / fromPop * 100).toFixed(1)}%`,
            });
        }
        if (prevEdgeMap && r.edge.from !== "(other)" && r.edge.to !== "(other)") {
            const prev = prevEdgeMap.get(JSON.stringify([r.col, r.edge.from, r.edge.to])) || 0;
            const delta = formatDelta(r.edge.sessions, prev);
            rows.push({ label: t("Previous period"), value: `${fmt(prev)} (${delta?.text ?? "±0%"})`, token: deltaToken(delta) });
        }
        const hosts = hostList(nodeKey(r.col + 1, r.edge.to));
        if (hosts) rows.push({ label: t("Hosts"), value: hosts });
        return { title: `${r.edge.from} → ${r.edge.to}`, rows };
    }

    function toggleNode(col, id) {
        const key = nodeKey(col, id);
        setSelected(prev => prev === key ? null : key);
    }

    function pointerAt(e) {
        const rect = canvasRef.current?.getBoundingClientRect();
        return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : {};
    }

    // Touch has no hover — a tap is a click (selection), and the selection
    // panel shows the same details, so touch pointers never open the card.
    function hoverHandlers(target) {
        return {
            onPointerEnter: e => { if (e.pointerType !== "touch") setHover({ ...target, ...pointerAt(e) }); },
            onPointerMove:  e => { if (e.pointerType !== "touch") setHover({ ...target, ...pointerAt(e) }); },
            onPointerLeave: () => setHover(null),
        };
    }

    const selectedNode = useMemo(() => {
        if (!selected) return null;
        const sep = selected.indexOf("|");
        const c = parseInt(selected.slice(0, sep), 10);
        const node = columns[c]?.find(n => n.id === selected.slice(sep + 1));
        return node ? { c, node } : null;
    }, [selected, columns]);

    let hoverCard = null;
    if (hover && hover.x != null) {
        let detail = null;
        if (hover.kind === "node") {
            const sep = hover.key.indexOf("|");
            const c = parseInt(hover.key.slice(0, sep), 10);
            const node = columns[c]?.find(n => n.id === hover.key.slice(sep + 1));
            if (node) detail = nodeDetail(c, node);
        } else if (ribbons[hover.index]) {
            detail = ribbonDetail(ribbons[hover.index]);
        }
        if (detail) {
            // Flip to the pointer's left/top near the far edges so the card
            // never runs off the panel.
            const width = canvasRef.current?.clientWidth || 0;
            const flipX = hover.x > width - 300;
            const flipY = hover.y > svgHeight - 120;
            hoverCard = (
                <div
                    className="sa-flow-tip"
                    style={{
                        left: hover.x,
                        top: hover.y,
                        transform: `translate(${flipX ? "calc(-100% - 14px)" : "14px"}, ${flipY ? "calc(-100% - 14px)" : "14px"})`,
                    }}
                    aria-hidden="true"
                >
                    <FlowDetail detail={detail} className="sa-flow-detail sa-flow-detail--tip" />
                </div>
            );
        }
    }

    const defaultAria = t("Visitor flow from acquisition channel through subsequent pages — click a page to trace its full path");

    return (
        <div>
            <div className="sa-flow-toolbar">
                {selected && (
                    <button type="button" className="sa-flow-clear" onClick={() => setSelected(null)}>
                        &times; {t("Clear selection")}
                    </button>
                )}
                {traceLoading && <span className="sa-flow-trace-loading">{t("Computing exact path counts…")}</span>}
                {prevNodeMap && (
                    <span className="sa-flow-compare-note">
                        {t("Compared with {from} – {to}", { from: compareData.from, to: compareData.to })}
                    </span>
                )}
            </div>
            {selectedNode && (
                <FlowDetail
                    detail={{ ...nodeDetail(selectedNode.c, selectedNode.node), hint: null }}
                    className="sa-flow-detail sa-flow-detail--panel"
                />
            )}
            <div
                ref={canvasRef}
                className={"sa-flow-canvas" + (overflow.left ? " --fade-left" : "") + (overflow.right ? " --fade-right" : "")}
            >
                <div className="sa-flow-scroll" ref={scrollRef} onScroll={measureOverflow}>
                    <svg
                        width={svgWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        role="img"
                        aria-label={ariaLabel || defaultAria}
                    >
                        {headers.map((label, c) => (
                            <text
                                key={`h${c}`}
                                className="sa-flow-colhead"
                                x={colX(c)}
                                y={PAD + 8}
                                dominantBaseline="middle"
                                style={{ fill: tone("sa-text-muted", 0.8) }}
                            >
                                {truncate(label, labelChars)}
                            </text>
                        ))}

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
                            const x0 = colX(r.col) + colWidth;
                            const x1 = x0 + colGap;
                            const y0 = TOP + r.y0;
                            const y1 = TOP + r.y1;
                            const midX = (x0 + x1) / 2;
                            const isHovered = hover?.kind === "ribbon" && hover.index === i;
                            const baseOpacity = 0.12 + 0.35 * (r.edge.sessions / maxEdgeSessions);
                            const opacity = isHovered ? Math.min(1, baseOpacity + 0.4)
                                : !highlight ? baseOpacity
                                : wouldBeOn ? Math.min(1, baseOpacity + 0.5)
                                : baseOpacity * 0.15;
                            return (
                                <path
                                    key={i}
                                    d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1}`}
                                    style={{ stroke: tone(wouldBeOn || isHovered ? "sa-accent-bright" : "sa-accent", opacity) }}
                                    strokeWidth={r.width}
                                    fill="none"
                                    {...hoverHandlers({ kind: "ribbon", index: i })}
                                />
                            );
                        })}

                        {columnLayouts.map((col, c) => (
                            <g key={c}>
                                {col.nodes.map(node => {
                                    const info = nodeInfo(c, node);
                                    const { key, layout, isSelected, isOn, exitSessions, exitPctStr, displayPop, err } = info;
                                    const x = colX(c);
                                    const y = TOP + layout.y;
                                    const isGoal = conversionNode != null && node.id === conversionNode;
                                    const fillOpacity = isOn ? (isSelected ? 0.36 : 0.16) : 0.05;
                                    const strokeOpacity = isOn ? (isSelected ? 0.9 : 0.4) : 0.12;
                                    const textOpacity = isOn ? 0.9 : 0.25;
                                    // Goal node uses the "good" status green — distinct
                                    // from the gold used for every real page node, and
                                    // from the brighter gold of the active selection.
                                    const nodeToken = isGoal ? "sa-good" : isSelected ? "sa-accent-bright" : "sa-accent";

                                    // Right-side label: per-path session count while a
                                    // selection is active (replaces exit %, which isn't
                                    // meaningful on a filtered sub-graph); exit % otherwise.
                                    const counting = selected && isOn;
                                    const rightLabel = counting
                                        ? fmt(displayPop)
                                        : exitPctStr ? `↓ ${exitPctStr}` : null;
                                    const rightLabelStyle = counting
                                        ? { fill: tone("sa-text-bright", textOpacity * 0.75) }
                                        : { fill: tone("sa-bad", isOn ? 0.9 : 0.2) };

                                    // Compare delta in the bottom-right corner — only on
                                    // nodes tall enough for a second line, same rule as
                                    // the validation-error badge on the left.
                                    const delta = info.compare?.delta;
                                    const showDelta = delta && layout.height >= 38;

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
                                        return (
                                            <path
                                                d={[
                                                    `M ${xRight} ${yExitTop}`,
                                                    `Q ${xRight + spread} ${yMid} ${xRight + spread} ${yEnd}`,
                                                    `L ${xRight + spread} ${yEnd + endH}`,
                                                    `Q ${xRight + spread} ${yMid + endH} ${xRight} ${yExitBot}`,
                                                    "Z",
                                                ].join(" ")}
                                                style={{ fill: tone("sa-bad", isOn ? 0.22 : 0.05), stroke: tone("sa-bad", isOn ? 0.6 : 0.12) }}
                                                strokeWidth="0.8"
                                            />
                                        );
                                    })() : null;

                                    const ariaParts = [node.id, t("{n} sessions", { n: fmt(displayPop) })];
                                    if (!selected && exitPctStr) ariaParts.push(t("{pct} drop-off", { pct: exitPctStr }));
                                    if (err) ariaParts.push(t("{n} error sessions", { n: fmt(err.sessions) }));
                                    if (delta) ariaParts.push(t("{delta} vs. previous period", { delta: delta.text }));

                                    return (
                                        <g
                                            key={node.id}
                                            className="sa-flow-node"
                                            onClick={() => toggleNode(c, node.id)}
                                            tabIndex={0}
                                            role="button"
                                            aria-pressed={isSelected}
                                            aria-label={ariaParts.join(", ")}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleNode(c, node.id); }
                                                if (e.key === "Escape") setSelected(null);
                                            }}
                                            onFocus={() => setHover(h => h?.key === key ? h : { kind: "node", key })}
                                            onBlur={() => setHover(null)}
                                            {...hoverHandlers({ kind: "node", key })}
                                        >
                                            {exitRibbon}
                                            <rect
                                                x={x} y={y} width={colWidth} height={layout.height}
                                                rx="4"
                                                style={{ fill: tone(nodeToken, fillOpacity), stroke: tone(nodeToken, strokeOpacity) }}
                                                strokeWidth={isSelected || isGoal ? 1.6 : 1}
                                            />
                                            <text
                                                x={x + 8} y={y + layout.height / 2}
                                                dominantBaseline="middle"
                                                fontSize="10.5"
                                                style={{ fill: tone("sa-text-bright", textOpacity) }}
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
                                                    style={rightLabelStyle}
                                                >
                                                    {rightLabel}
                                                </text>
                                            )}
                                            {err && layout.height >= 38 && (
                                                <text
                                                    x={x + 8}
                                                    y={y + layout.height - 5}
                                                    dominantBaseline="auto"
                                                    fontSize="8"
                                                    style={{ fill: tone("sa-warn", isOn ? 0.9 : 0.3) }}
                                                >
                                                    {`⚠ ${fmt(err.sessions)}`}
                                                </text>
                                            )}
                                            {showDelta && (
                                                <text
                                                    x={x + colWidth - 6}
                                                    y={y + layout.height - 5}
                                                    textAnchor="end"
                                                    dominantBaseline="auto"
                                                    fontSize="8"
                                                    style={{ fill: tone(deltaToken(delta), isOn ? 0.9 : 0.3) }}
                                                >
                                                    {delta.text}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        ))}
                    </svg>
                </div>
                {hoverCard}
            </div>
            {compact && overflow.right && (
                <p className="sa-flow-scroll-hint">{t("Scroll sideways to see every step")}</p>
            )}
        </div>
    );
}
