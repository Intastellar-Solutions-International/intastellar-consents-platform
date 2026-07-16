import API from "../../API/api.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import "./Style.css";

const { useState, useEffect, useCallback, useRef } = React;

const CATEGORIES = ["necessary", "analytics", "marketing", "functional", "security"];

function CategoryBadge({ category }) {
    const cat = (category || "").toLowerCase();
    return (
        <span className={`cdb-badge --${CATEGORIES.includes(cat) ? cat : "pending"}`}>
            {category || "—"}
        </span>
    );
}

function Toast({ message, onDone }) {
    useEffect(() => {
        const t = setTimeout(onDone, 2600);
        return () => clearTimeout(t);
    }, [message]);
    if (!message) return null;
    return <div className="cdb-toast">{message}</div>;
}

function DiscoveriesTab({ discoveries, onAction, onBatchAction }) {
    const [filter, setFilter] = useState("");
    const [busy, setBusy] = useState({});
    const [edits, setEdits] = useState({});

    function mergedRow(row) {
        const e = edits[row.name] || {};
        return {
            name:        row.name,
            is_prefix:   e.is_prefix   ?? false,
            vendor:      e.vendor      ?? row.enriched_vendor      ?? null,
            category:    e.category    ?? row.enriched_category    ?? null,
            description: e.description ?? row.enriched_description ?? null,
        };
    }

    function hasData(row) {
        const m = mergedRow(row);
        return !!(m.vendor || m.category);
    }

    function batchPromote() {
        const items = discoveries.filter(hasData).map(mergedRow);
        onBatchAction("batch_promote", { items },
            `Promote ${items.length} cookie${items.length !== 1 ? "s" : ""} with vendor or category?`);
    }

    function batchDismissEmpty() {
        const names = discoveries.filter(d => !hasData(d)).map(d => d.name);
        onBatchAction("batch_dismiss_empty", { names },
            `Dismiss ${names.length} cookie${names.length !== 1 ? "s" : ""} with no data?`);
    }

    const filtered = discoveries.filter(d =>
        !filter || d.name.toLowerCase().includes(filter.toLowerCase())
    );

    function edit(name, field, val) {
        setEdits(prev => ({
            ...prev,
            [name]: { ...(prev[name] || {}), [field]: val },
        }));
    }

    function getEdit(name, field, fallback = "") {
        return edits[name]?.[field] ?? fallback;
    }

    async function promote(row) {
        setBusy(b => ({ ...b, [row.name]: true }));
        const e = edits[row.name] || {};
        await onAction("promote", {
            name:               row.name,
            is_prefix:          e.is_prefix ?? false,
            vendor:             e.vendor    ?? row.enriched_vendor    ?? "",
            category:           e.category  ?? row.enriched_category  ?? "",
            description:        e.description ?? row.enriched_description ?? "",
        });
        setBusy(b => ({ ...b, [row.name]: false }));
    }

    async function dismiss(row) {
        setBusy(b => ({ ...b, [row.name]: true }));
        await onAction("dismiss", { name: row.name });
        setBusy(b => ({ ...b, [row.name]: false }));
    }

    return (
        <>
            <div className="cdb-filter-row">
                <input
                    className="cdb-filter-input"
                    placeholder="Filter by name…"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <span className="cdb-count">{filtered.length} cookie{filtered.length !== 1 ? "s" : ""}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                    <button className="cdb-btn --promote" onClick={batchPromote}>
                        Promote all with data ({discoveries.filter(hasData).length})
                    </button>
                    <button className="cdb-btn --dismiss" onClick={batchDismissEmpty}>
                        Dismiss all without data ({discoveries.filter(d => !hasData(d)).length})
                    </button>
                </div>
            </div>

            <div className="cdb-table-wrap">
                <table className="cdb-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Seen</th>
                            <th>Suggested vendor</th>
                            <th>Vendor (edit)</th>
                            <th>Category (edit)</th>
                            <th>Description (edit)</th>
                            <th>Prefix?</th>
                            <th>Source</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={9} className="cdb-empty">No pending cookie discoveries.</td></tr>
                        )}
                        {filtered.map(row => (
                            <tr key={row.name}>
                                <td><span className="cdb-name">{row.name}</span></td>
                                <td><span className="cdb-times-seen">{row.times_seen}×</span></td>
                                <td>
                                    <span style={{ fontSize: "0.775rem", color: "rgba(255,255,255,0.55)" }}>
                                        {row.enriched_vendor || "—"}
                                    </span>
                                    {row.enriched_category && (
                                        <CategoryBadge category={row.enriched_category} />
                                    )}
                                </td>
                                <td>
                                    <input
                                        className="cdb-input"
                                        style={{ minWidth: 110 }}
                                        placeholder={row.enriched_vendor || "Vendor"}
                                        value={getEdit(row.name, "vendor", row.enriched_vendor || "")}
                                        onChange={e => edit(row.name, "vendor", e.target.value)}
                                    />
                                </td>
                                <td>
                                    <select
                                        className="cdb-select"
                                        value={getEdit(row.name, "category", row.enriched_category || "")}
                                        onChange={e => edit(row.name, "category", e.target.value)}
                                    >
                                        <option value="">—</option>
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="cdb-desc-cell">
                                    <input
                                        className="cdb-input"
                                        style={{ minWidth: 200 }}
                                        placeholder={row.enriched_description || "Description…"}
                                        value={getEdit(row.name, "description", row.enriched_description || "")}
                                        onChange={e => edit(row.name, "description", e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={getEdit(row.name, "is_prefix", false)}
                                        onChange={e => edit(row.name, "is_prefix", e.target.checked)}
                                    />
                                </td>
                                <td>
                                    <span className="cdb-source-tag">{row.enriched_source || "none"}</span>
                                </td>
                                <td>
                                    <div className="cdb-actions">
                                        <button
                                            className="cdb-btn --promote"
                                            disabled={!!busy[row.name]}
                                            onClick={() => promote(row)}
                                        >
                                            Promote
                                        </button>
                                        <button
                                            className="cdb-btn --dismiss"
                                            disabled={!!busy[row.name]}
                                            onClick={() => dismiss(row)}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function DefinitionsTab({ definitions, onAction }) {
    const [filter, setFilter] = useState("");
    const [busy, setBusy] = useState({});
    const [edits, setEdits] = useState({});
    const [dirty, setDirty] = useState({});

    const filtered = definitions.filter(d =>
        !filter || d.name.toLowerCase().includes(filter.toLowerCase())
    );

    function edit(name, field, val) {
        setEdits(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [field]: val } }));
        setDirty(prev => ({ ...prev, [name]: true }));
    }

    function getEdit(name, field, fallback = "") {
        return edits[name]?.[field] ?? fallback;
    }

    async function save(row) {
        setBusy(b => ({ ...b, [row.name]: true }));
        const e = edits[row.name] || {};
        await onAction("promote", {
            name:        row.name,
            is_prefix:   e.is_prefix   ?? row.is_prefix  ?? false,
            vendor:      e.vendor      ?? row.vendor      ?? "",
            category:    e.category    ?? row.category    ?? "",
            description: e.description ?? row.description ?? "",
        });
        setDirty(prev => ({ ...prev, [row.name]: false }));
        setBusy(b => ({ ...b, [row.name]: false }));
    }

    async function deleteDefinition(name) {
        if (!window.confirm(`Remove "${name}" from promoted definitions?`)) return;
        setBusy(b => ({ ...b, [name]: true }));
        await onAction("delete_definition", { name });
        setBusy(b => ({ ...b, [name]: false }));
    }

    return (
        <>
            <div className="cdb-filter-row">
                <input
                    className="cdb-filter-input"
                    placeholder="Filter by name…"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <span className="cdb-count">{filtered.length} definition{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="cdb-table-wrap">
                <table className="cdb-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Prefix?</th>
                            <th>Vendor</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Promoted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} className="cdb-empty">No promoted definitions yet.</td></tr>
                        )}
                        {filtered.map(row => (
                            <tr key={row.name}>
                                <td><span className="cdb-name">{row.name}{row.is_prefix ? "*" : ""}</span></td>
                                <td style={{ textAlign: "center" }}>
                                    <input
                                        type="checkbox"
                                        checked={getEdit(row.name, "is_prefix", row.is_prefix ?? false)}
                                        onChange={e => edit(row.name, "is_prefix", e.target.checked)}
                                    />
                                </td>
                                <td>
                                    <input
                                        className="cdb-input"
                                        style={{ minWidth: 110 }}
                                        value={getEdit(row.name, "vendor", row.vendor || "")}
                                        onChange={e => edit(row.name, "vendor", e.target.value)}
                                    />
                                </td>
                                <td>
                                    <select
                                        className="cdb-select"
                                        value={getEdit(row.name, "category", row.category || "")}
                                        onChange={e => edit(row.name, "category", e.target.value)}
                                    >
                                        <option value="">—</option>
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="cdb-desc-cell">
                                    <input
                                        className="cdb-input"
                                        style={{ minWidth: 200 }}
                                        value={getEdit(row.name, "description", row.description || "")}
                                        onChange={e => edit(row.name, "description", e.target.value)}
                                    />
                                </td>
                                <td style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
                                    {row.promoted_at ? new Date(row.promoted_at).toLocaleDateString() : "—"}
                                </td>
                                <td>
                                    <div className="cdb-actions">
                                        {dirty[row.name] && (
                                            <button
                                                className="cdb-btn --promote"
                                                disabled={!!busy[row.name]}
                                                onClick={() => save(row)}
                                            >
                                                Save
                                            </button>
                                        )}
                                        <button
                                            className="cdb-btn --delete"
                                            disabled={!!busy[row.name]}
                                            onClick={() => deleteDefinition(row.name)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

export default function CookieDatabase() {
    const [tab, setTab] = useState("discoveries");
    const [discoveries, setDiscoveries] = useState([]);
    const [definitions, setDefinitions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [backfilling, setBackfilling] = useState(false);
    const [toast, setToast] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        fetch(API.cookieDiscoveries.get.url, {
            method: "GET",
            headers: API.cookieDiscoveries.get.headers,
        })
            .then(r => r.json())
            .then(data => {
                setDiscoveries(data.discoveries || []);
                setDefinitions(data.definitions || []);
            })
            .catch(() => setToast("Failed to load data."))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, []);

    async function runBackfill() {
        setBackfilling(true);
        try {
            const res = await fetch(API.cookieDiscoveries.action.url, {
                method: "POST",
                headers: API.cookieDiscoveries.action.headers,
                body: JSON.stringify({ action: "backfill" }),
            });
            const data = await res.json();
            if (!res.ok) {
                setToast(data.error || "Backfill failed.");
            } else {
                setToast(`Backfill complete — ${data.scansProcessed} scans, ${data.cookiesUpserted} cookies indexed.`);
                load();
            }
        } catch {
            setToast("Network error during backfill.");
        } finally {
            setBackfilling(false);
        }
    }

    async function runBatchAction(action, body, confirmMsg) {
        if (!window.confirm(confirmMsg)) return;
        try {
            const res = await fetch(API.cookieDiscoveries.action.url, {
                method: "POST",
                headers: API.cookieDiscoveries.action.headers,
                body: JSON.stringify({ action, ...body }),
            });
            const data = await res.json();
            if (!res.ok) {
                setToast(data.error || "Action failed.");
            } else if (action === "batch_promote") {
                setToast(`Promoted ${data.promoted} cookies.`);
                load();
            } else if (action === "batch_dismiss_empty") {
                setToast(`Dismissed ${data.dismissed} cookies with no data.`);
                load();
            }
        } catch {
            setToast("Network error.");
        }
    }

    async function onAction(action, body) {
        try {
            const res = await fetch(API.cookieDiscoveries.action.url, {
                method: "POST",
                headers: API.cookieDiscoveries.action.headers,
                body: JSON.stringify({ action, ...body }),
            });
            const data = await res.json();
            if (!res.ok) {
                setToast(data.error || "Action failed.");
                return;
            }
            setToast(
                action === "promote"          ? `"${body.name}" promoted to definitions.` :
                action === "dismiss"          ? `"${body.name}" dismissed.` :
                action === "delete_definition" ? `"${body.name}" removed from definitions.` :
                "Done."
            );
            load();
        } catch {
            setToast("Network error.");
        }
    }

    return (
        <>
            <StickyPageTitle>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <h1>Cookie Database</h1>
                    <button
                        className="cdb-btn --promote"
                        style={{ fontSize: "0.8rem", padding: "6px 14px" }}
                        disabled={backfilling}
                        onClick={runBackfill}
                    >
                        {backfilling ? "Backfilling…" : "Backfill from scan history"}
                    </button>
                </div>
            </StickyPageTitle>
            <main className="dashboard-content">
                <div className="cdb-tabs">
                    <button
                        className={`cdb-tab${tab === "discoveries" ? " --active" : ""}`}
                        onClick={() => setTab("discoveries")}
                    >
                        Discovered
                        <span className="cdb-count">{discoveries.length}</span>
                    </button>
                    <button
                        className={`cdb-tab${tab === "definitions" ? " --active" : ""}`}
                        onClick={() => setTab("definitions")}
                    >
                        Promoted
                        <span className="cdb-count">{definitions.length}</span>
                    </button>
                </div>

                {loading ? (
                    <div className="cdb-empty">Loading…</div>
                ) : tab === "discoveries" ? (
                    <DiscoveriesTab discoveries={discoveries} onAction={onAction} onBatchAction={runBatchAction} />
                ) : (
                    <DefinitionsTab definitions={definitions} onAction={onAction} />
                )}
            </main>
            <Toast message={toast} onDone={() => setToast(null)} />
        </>
    );
}
