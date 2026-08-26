const { useState, useEffect, useCallback, useContext, useMemo, useRef } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain, analyticsPageExperimentsPath } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../API/host.js";
import { authHeaders, InfoTip, formatPercent } from "./_shared.js";
import { IconPlus, IconTrash, IconClock, IconUsers, IconTrendingUp, IconBarChart, IconAlertTriangle } from "./Icons.js";
import "./Analytics.css";

const CHANGE_TYPE_LABEL = {
    text: "Text", html: "HTML", style: "Style",
    attribute: "Attribute", class: "Add class", remove: "Remove",
};

// A change is keyed by (selector, type, property) — editing the same
// property of the same element twice replaces the earlier edit rather than
// stacking two conflicting entries for it.
function changeKey(c) {
    return `${c.selector}::${c.type}::${c.property || ""}`;
}

// Kept in sync with STYLE_PROPS in api/ab-test-proxy.js's bridge script —
// that's the curated set actually computed and sent per element selection;
// this is the same set, with how each one should be edited.
const STYLE_PROPERTIES = [
    { group: "Typography", key: "color", label: "Text color", type: "color" },
    { group: "Typography", key: "font-size", label: "Font size", type: "text" },
    { group: "Typography", key: "font-weight", label: "Font weight", type: "select", options: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"] },
    { group: "Typography", key: "font-family", label: "Font family", type: "text" },
    { group: "Typography", key: "line-height", label: "Line height", type: "text" },
    { group: "Typography", key: "text-align", label: "Text align", type: "select", options: ["left", "center", "right", "justify"] },
    { group: "Background & border", key: "background-color", label: "Background color", type: "color" },
    { group: "Background & border", key: "border", label: "Border", type: "text" },
    { group: "Background & border", key: "border-radius", label: "Border radius", type: "text" },
    { group: "Spacing & size", key: "padding", label: "Padding", type: "text" },
    { group: "Spacing & size", key: "margin", label: "Margin", type: "text" },
    { group: "Spacing & size", key: "width", label: "Width", type: "text" },
    { group: "Spacing & size", key: "height", label: "Height", type: "text" },
    { group: "Layout", key: "display", label: "Display", type: "select", options: ["block", "inline", "inline-block", "flex", "grid", "none"] },
    { group: "Layout", key: "visibility", label: "Visibility", type: "select", options: ["visible", "hidden"] },
    { group: "Layout", key: "opacity", label: "Opacity", type: "range" },
];
const STYLE_GROUPS = [...new Set(STYLE_PROPERTIES.map(p => p.group))];

// <input type="color"> requires a hex value — computed styles come back as
// rgb()/rgba(). Alpha is dropped (color inputs can't represent it); good
// enough for a swatch preview, callers that need transparency can still get
// there by typing a raw value elsewhere (this panel is a convenience layer,
// not the only way to author a change).
function toHexColor(rgbString) {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgbString || "");
    if (!m) return "#000000";
    const toHex = n => Number(n).toString(16).padStart(2, "0");
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

function upsertChange(changes, change) {
    const key = changeKey(change);
    const idx = changes.findIndex(c => changeKey(c) === key);
    if (idx === -1) return [...changes, change];
    const next = changes.slice();
    next[idx] = change;
    return next;
}

export default function PageExperimentEditor() {
    const { handle, testId: testIdParam } = useParams();
    const testId = parseInt(testIdParam, 10);
    const history = useHistory();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [test, setTest] = useState(null);
    const [variants, setVariants] = useState([]);
    const [activeVariantId, setActiveVariantId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [proxyUrl, setProxyUrl] = useState(null);
    const [proxyError, setProxyError] = useState(null);
    const [iframeReady, setIframeReady] = useState(false);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedElement, setSelectedElement] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    // Pending, unsaved edits for the active variant — seeded from the
    // fetched variant's persisted `changes` and diverges locally until Save.
    const [changes, setChanges] = useState([]);

    const iframeRef = useRef(null);
    const iframeOriginRef = useRef(null); // origin the proxy's response is served from — set once from proxyUrl

    const [mode, setMode] = useState("editor"); // "editor" | "results"
    const [durationDays, setDurationDays] = useState("");
    const [results, setResults] = useState(null);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [eventDefs, setEventDefs] = useState([]);

    // URL split test state — label + redirect URL per variant (variantId → string)
    const [splitUrls, setSplitUrls] = useState({});
    const [splitLabels, setSplitLabels] = useState({});

    // Traffic split percentages, keyed by variantKey (matching how
    // traffic_split is stored server-side and read by api/ab-test-active.js).
    // Applies to both test types — bucketing is shared logic, not specific
    // to url_split.
    const [splitPct, setSplitPct] = useState({});
    const [splitSaving, setSplitSaving] = useState(false);
    const [splitError, setSplitError] = useState(null);

    document.title = test ? `${test.name} | Page Experiments` : "Page Experiments";

    const activeVariant = useMemo(() => variants.find(v => v.id === activeVariantId) || null, [variants, activeVariantId]);

    // ── Load test + variants ───────────────────────────────────────────────────
    const fetchTest = useCallback(() => {
        if (!domain || !testId) return;
        setLoading(true);
        setError(null);
        fetch(`${ScannerHost}/api/ab-tests?domain=${encodeURIComponent(domain)}&testId=${testId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(d => {
                setTest(d.test);
                setVariants(d.variants || []);
                setActiveVariantId(prev => prev && d.variants.some(v => v.id === prev) ? prev : (d.variants[0]?.id || null));
            })
            .catch(() => setError("Could not load this test."))
            .finally(() => setLoading(false));
    }, [domain, testId]);

    useEffect(() => { fetchTest(); }, [fetchTest]);

    // A running experiment opens straight into its Results — that's what
    // someone checking on an already-launched test wants to see, not the
    // editor. Only applies once, the first time the test loads: switching
    // tabs afterward (or a later fetchTest() refetch, e.g. after Pause)
    // shouldn't yank the view back.
    const initialModeSetRef = useRef(false);
    useEffect(() => {
        if (!test || initialModeSetRef.current) return;
        initialModeSetRef.current = true;
        if (test.status === "running") setMode("results");
    }, [test]);

    // Registered conversion events for this domain — populates the goal-event
    // dropdown. Reuses the existing event-registry endpoint (Conversions >
    // Events & Tracking already calls this same one) rather than adding a
    // new one just to list names.
    useEffect(() => {
        if (!domain) { setEventDefs([]); return; }
        fetch(`${ScannerHost}/api/analytics-events?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { events: [] })
            .then(d => setEventDefs(d.events || []))
            .catch(() => setEventDefs([]));
    }, [domain]);

    // Results fetch — only while viewing the Results panel, re-fetched each
    // time the tab is switched to so it reflects the latest data.
    useEffect(() => {
        if (mode !== "results" || !testId) return;
        setResultsLoading(true);
        fetch(`${ScannerHost}/api/ab-test-results?testId=${testId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(setResults)
            .catch(() => setResults(null))
            .finally(() => setResultsLoading(false));
    }, [mode, testId]);

    // Reseed local `changes` whenever the active variant changes (switching
    // tabs, or the initial load) — local edits are per-variant, not shared.
    useEffect(() => {
        setChanges(activeVariant?.changes || []);
        setDirty(false);
        setSelectedElement(null);
    }, [activeVariant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reseed splitUrls whenever the variant list reloads (initial load or
    // after add/delete/save). Keyed by variantId so all variants are editable
    // at once without switching tabs.
    useEffect(() => {
        if (!variants.length) return;
        setSplitUrls(prev => {
            const next = {};
            for (const v of variants) next[v.id] = prev[v.id] !== undefined ? prev[v.id] : (v.redirectUrl || "");
            return next;
        });
        setSplitLabels(prev => {
            const next = {};
            for (const v of variants) next[v.id] = prev[v.id] !== undefined ? prev[v.id] : (v.label || "");
            return next;
        });
    }, [variants]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reseed splitPct from the saved trafficSplit whenever the variant list
    // changes (initial load, or a variant added/removed) — only fills in
    // entries missing from the current state, so an unsaved in-progress
    // edit survives an unrelated refetch. A test with no custom split saved
    // yet (trafficSplit doesn't cover every current variant) seeds an equal
    // split as the starting point, matching the runtime's own fallback.
    useEffect(() => {
        if (!variants.length) return;
        setSplitPct(prev => {
            const stored = test?.trafficSplit || {};
            const hasStored = variants.every(v => typeof stored[v.variantKey] === "number");
            const equal = Math.round(100 / variants.length);
            const next = {};
            for (const v of variants) {
                next[v.variantKey] = prev[v.variantKey] !== undefined ? prev[v.variantKey] : (hasStored ? stored[v.variantKey] : equal);
            }
            return next;
        });
    }, [variants]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Mint a signed proxy URL for the active variant ─────────────────────────
    // Only in "editor" mode for visual tests — URL split tests don't use the proxy.
    useEffect(() => {
        if (mode !== "editor" || !activeVariantId || !testId || test?.testType === "url_split") { setProxyUrl(null); return; }
        let ignore = false;
        setIframeReady(false);
        setProxyError(null);
        fetch(`${ScannerHost}/api/ab-test-proxy`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ testId, variantId: activeVariantId, parentOrigin: window.location.origin }),
        })
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || "Could not open editor"); }
                return r.json();
            })
            .then(d => {
                if (ignore) return;
                const full = `${ScannerHost}${d.proxyUrl}`;
                iframeOriginRef.current = new URL(ScannerHost).origin;
                setProxyUrl(full);
            })
            .catch(e => { if (!ignore) setProxyError(e.message || "Could not open editor"); });
        return () => { ignore = true; };
    }, [mode, testId, activeVariantId]);

    // ── Bridge message listener ─────────────────────────────────────────────────
    useEffect(() => {
        function onMessage(e) {
            if (!iframeOriginRef.current || e.origin !== iframeOriginRef.current) return;
            const msg = e.data;
            if (!msg || typeof msg !== "object") return;

            if (msg.type === "ab-editor:ready") {
                setIframeReady(true);
                iframeRef.current?.contentWindow?.postMessage(
                    { type: "ab-editor:apply-all", changes },
                    iframeOriginRef.current
                );
                if (selectMode) {
                    iframeRef.current?.contentWindow?.postMessage({ type: "ab-editor:enter-select-mode" }, iframeOriginRef.current);
                }
            } else if (msg.type === "ab-editor:select") {
                setSelectedElement({
                    selector: msg.selector, tagName: msg.tagName,
                    currentText: msg.currentText, currentAttributes: msg.currentAttributes,
                });
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
        // Only re-bind on proxyUrl change (new iframe instance) — `changes`/`selectMode`
        // are read fresh via refs-equivalent closures each time "ready" fires for a
        // given iframe load, which only happens once per proxyUrl.
    }, [proxyUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleSelectMode = () => {
        const next = !selectMode;
        setSelectMode(next);
        setSelectedElement(null);
        iframeRef.current?.contentWindow?.postMessage(
            { type: next ? "ab-editor:enter-select-mode" : "ab-editor:exit-select-mode" },
            iframeOriginRef.current
        );
    };

    const applyChange = (change) => {
        const next = upsertChange(changes, change);
        setChanges(next);
        setDirty(true);
        iframeRef.current?.contentWindow?.postMessage(
            { type: "ab-editor:apply-preview", change },
            iframeOriginRef.current
        );
    };

    // Removing an edit can't be safely undone in a live DOM (e.g. a "remove"
    // change deleted the element) — reload the iframe from a clean fetch and
    // re-apply the remaining changes, rather than trying to reverse in place.
    const removeChange = (change) => {
        const next = changes.filter(c => changeKey(c) !== changeKey(change));
        setChanges(next);
        setDirty(true);
        setIframeReady(false);
        if (iframeRef.current) iframeRef.current.src = proxyUrl;
    };

    const addVariant = async () => {
        const key = prompt("Variant key (letters, numbers, - or _), e.g. variant-b:");
        if (!key) return;
        const label = prompt("Variant name (shown in the editor), e.g. New page:");
        const r = await fetch(`${ScannerHost}/api/ab-test-variants`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ testId, variantKey: key.trim().toLowerCase(), label: label ? label.trim() : undefined }),
        }).catch(() => null);
        if (!r?.ok) { alert("Could not create variant — key may already be in use."); return; }
        fetchTest();
    };

    // Immediate-save rename (not tied to the dirty/Save-changes flow, same as
    // the visual editor's tab list not having its own draft state) — must
    // resend the variant's existing `changes` since PUT always full-replaces
    // that column, and renaming shouldn't silently wipe DOM edits.
    const renameVariant = async (v) => {
        const next = prompt("Variant name:", v.label || v.variantKey);
        if (next === null) return;
        const r = await fetch(`${ScannerHost}/api/ab-test-variants?variantId=${v.id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ changes: v.changes || [], label: next.trim() }),
        }).catch(() => null);
        if (!r?.ok) { alert("Could not rename variant."); return; }
        fetchTest();
    };

    const handleSave = async () => {
        if (!activeVariantId) return;
        setSaving(true);
        const r = await fetch(`${ScannerHost}/api/ab-test-variants?variantId=${activeVariantId}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ changes }),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) { alert("Could not save changes."); return; }
        setDirty(false);
        fetchTest();
    };

    const handleSaveUrlSplit = async () => {
        setSaving(true);
        let anyError = false;
        for (const v of variants) {
            const body = { changes: [], label: (splitLabels[v.id] || "").trim() };
            if (!v.isControl) body.redirectUrl = splitUrls[v.id] || "";
            const r = await fetch(`${ScannerHost}/api/ab-test-variants?variantId=${v.id}`, {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify(body),
            }).catch(() => null);
            if (!r?.ok) anyError = true;
        }
        setSaving(false);
        if (anyError) { alert("Some changes could not be saved."); return; }
        setDirty(false);
        fetchTest();
    };

    const [statusSaving, setStatusSaving] = useState(false);
    const canLaunch = variants.length >= 2 && (test?.status === "draft" || test?.status === "paused");
    const setStatus = async (status) => {
        setStatusSaving(true);
        const days = status === "running" && durationDays ? parseInt(durationDays, 10) : null;
        const r = await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ status, ...(days ? { durationDays: days } : {}) }),
        }).catch(() => null);
        setStatusSaving(false);
        if (!r?.ok) {
            const b = await r?.json().catch(() => null);
            alert(b?.error || "Could not update test status.");
            return;
        }
        fetchTest();
    };

    const splitTotal = variants.reduce((s, v) => s + (Number(splitPct[v.variantKey]) || 0), 0);
    const splitValid = variants.length >= 2 && splitTotal === 100;

    const saveSplit = async () => {
        if (!splitValid) return;
        setSplitSaving(true);
        setSplitError(null);
        const body = {};
        for (const v of variants) body[v.variantKey] = Number(splitPct[v.variantKey]) || 0;
        const r = await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ trafficSplit: body }),
        }).catch(() => null);
        setSplitSaving(false);
        if (!r?.ok) {
            const b = await r?.json().catch(() => null);
            setSplitError(b?.error || "Could not save traffic split.");
            return;
        }
        fetchTest();
    };

    const resetSplit = async () => {
        setSplitSaving(true);
        setSplitError(null);
        const r = await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ trafficSplit: {} }),
        }).catch(() => null);
        setSplitSaving(false);
        if (!r?.ok) { setSplitError("Could not reset traffic split."); return; }
        setSplitPct({});
        fetchTest();
    };

    const setGoalEvent = async (goalEventName) => {
        const r = await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ goalEventName }),
        }).catch(() => null);
        if (!r?.ok) { alert("Could not update goal event."); return; }
        fetchTest();
    };

    if (!domain) {
        return <div className="sa-page"><p className="sa-notice">Select a domain in the header.</p></div>;
    }

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle title={test ? test.name : "Page Experiments"} />
            <div className="dashboard-content">
                <div className="sa-page">
                    {loading && <p className="sa-notice">Loading&hellip;</p>}
                    {error && <p className="sa-notice sa-notice--error">{error}</p>}

                    {!loading && !error && test && (
                        <div className={`pxp-editor${mode === "results" ? " pxp-editor--results" : ""}`}>
                            <div className="pxp-editor__toolbar">
                                <button type="button" className="pxp-back-link" onClick={() => history.push(analyticsPageExperimentsPath(domain))}>
                                    &larr; All page experiments
                                </button>

                                <div className="pxp-mode-tabs" role="tablist" aria-label="View">
                                    <button
                                        type="button"
                                        className={"pxp-variant-tab" + (mode === "editor" ? " --active" : "")}
                                        onClick={() => setMode("editor")}
                                    >
                                        Editor
                                    </button>
                                    <button
                                        type="button"
                                        className={"pxp-variant-tab" + (mode === "results" ? " --active" : "")}
                                        onClick={() => setMode("results")}
                                    >
                                        Results
                                    </button>
                                </div>

                                {mode === "editor" && test.testType !== "url_split" && (
                                    <div className="pxp-variant-tabs">
                                        {variants.map(v => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                className={"pxp-variant-tab" + (v.id === activeVariantId ? " --active" : "")}
                                                onClick={() => setActiveVariantId(v.id)}
                                                onDoubleClick={() => renameVariant(v)}
                                                title="Double-click to rename"
                                            >
                                                {v.label || v.variantKey}
                                            </button>
                                        ))}
                                        <button type="button" className="pxp-variant-tab pxp-variant-tab--add" onClick={addVariant}>
                                            <IconPlus className="sa-icon" /> Variant
                                        </button>
                                    </div>
                                )}

                                {mode === "editor" && test.testType === "url_split" && (
                                    <button type="button" className="pxp-variant-tab pxp-variant-tab--add" onClick={addVariant}>
                                        <IconPlus className="sa-icon" /> Variant
                                    </button>
                                )}

                                {mode === "editor" && (
                                    <button
                                        type="button"
                                        className="sa-event-form__submit"
                                        onClick={test.testType === "url_split" ? handleSaveUrlSplit : handleSave}
                                        disabled={!dirty || saving}
                                    >
                                        {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                                    </button>
                                )}
                            </div>

                            <div className="pxp-settings-row">
                                <div className="pxp-goal-field">
                                    <span className="pxp-goal-field__label">Goal event</span>
                                    <select
                                        className="sa-event-form__select"
                                        value={test.goalEventName || ""}
                                        onChange={e => setGoalEvent(e.target.value)}
                                    >
                                        <option value="">— No goal event —</option>
                                        {eventDefs.map(ev => (
                                            <option key={ev.name} value={ev.name}>{ev.label || ev.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="pxp-settings-row__status">
                                    {test.status === "running" ? (
                                        <>
                                            <span className="pxp-status-note">
                                                {test.endsAt ? `Ends ${new Date(test.endsAt).toLocaleString("de-DE")}` : "No end date"}
                                            </span>
                                            <button
                                                type="button"
                                                className="pxp-launch-btn pxp-launch-btn--pause"
                                                onClick={() => setStatus("paused")}
                                                disabled={statusSaving}
                                            >
                                                {statusSaving ? "Pausing…" : "Pause"}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                type="number"
                                                min="1" max="365"
                                                className="sa-event-form__input"
                                                style={{ width: 90 }}
                                                placeholder="no limit"
                                                value={durationDays}
                                                onChange={e => setDurationDays(e.target.value)}
                                            />
                                            <span className="pxp-status-note">days</span>
                                            <button
                                                type="button"
                                                className="pxp-launch-btn"
                                                onClick={() => setStatus("running")}
                                                disabled={!canLaunch || statusSaving}
                                                title={!canLaunch ? "Add a second variant to launch this test" : undefined}
                                            >
                                                {statusSaving ? "Launching…" : "Launch"}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {mode === "editor" && variants.length >= 2 && (
                                <div className="pxp-split-panel">
                                    <div className="pxp-split-panel__head">
                                        <span className="pxp-split-panel__title">
                                            Traffic split
                                            <InfoTip text="What share of visitors each variant should receive. Must add up to 100%. Defaults to an equal split across variants until you save a custom one." />
                                        </span>
                                        <span className={"pxp-split-panel__total" + (splitValid ? "" : " pxp-split-panel__total--bad")}>
                                            {splitTotal}%
                                        </span>
                                    </div>
                                    <div className="pxp-split-panel__rows">
                                        {variants.map((v, i) => (
                                            <div key={v.id} className="pxp-split-panel__row">
                                                <span className="pxp-report__variant-dot" style={{ background: variantColor(i) }} />
                                                <span className="pxp-split-panel__label">{v.label || v.variantKey}</span>
                                                <input
                                                    type="number"
                                                    min="0" max="100"
                                                    className="sa-event-form__input pxp-split-panel__input"
                                                    value={splitPct[v.variantKey] ?? ""}
                                                    onChange={e => setSplitPct(prev => ({ ...prev, [v.variantKey]: e.target.value === "" ? "" : Number(e.target.value) }))}
                                                />
                                                <span className="pxp-split-panel__pct-sign">%</span>
                                            </div>
                                        ))}
                                    </div>
                                    {!splitValid && <p className="pxp-split-panel__hint">Percentages must add up to 100%.</p>}
                                    {splitError && <p className="sa-notice sa-notice--error">{splitError}</p>}
                                    <div className="pxp-split-panel__actions">
                                        <button type="button" className="sa-event-form__submit" onClick={saveSplit} disabled={!splitValid || splitSaving}>
                                            {splitSaving ? "Saving…" : "Save split"}
                                        </button>
                                        <button type="button" className="pxp-back-link" onClick={resetSplit} disabled={splitSaving}>
                                            Reset to equal split
                                        </button>
                                    </div>
                                </div>
                            )}

                            {mode === "results" && (
                                <ResultsPanel
                    results={results} loading={resultsLoading}
                    history={history} domain={domain} testId={testId}
                    testMeta={test}
                    onSaveTargets={async (targets) => {
                        const r = await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
                            method: "PATCH",
                            headers: authHeaders(),
                            body: JSON.stringify({ performanceTargets: targets }),
                        }).catch(() => null);
                        if (!r?.ok) alert("Could not save targets.");
                        else fetchTest();
                    }}
                />
                            )}

                            {mode === "editor" && test.testType === "url_split" && (
                            <div className="pxp-url-split-panel">
                                <p className="sa-panel__sub" style={{ marginBottom: 16 }}>
                                    {test.targetPath === "/*" ? (
                                        <>Visitors anywhere on the <strong>entire site</strong> are randomly split across variants.</>
                                    ) : (
                                        <>Visitors on <strong>{test.targetPath}</strong> are randomly split across variants.</>
                                    )}
                                    {" "}The control stays put; each other variant redirects visitors to the URL you specify.
                                </p>
                                <div className="pxp-url-split-variants">
                                    {variants.map(v => (
                                        <div key={v.id} className="pxp-url-split-row">
                                            <div className="pxp-url-split-row__meta">
                                                <input
                                                    type="text"
                                                    className="sa-event-form__input pxp-url-split-row__label-input"
                                                    placeholder={v.variantKey}
                                                    value={splitLabels[v.id] || ""}
                                                    onChange={e => {
                                                        setSplitLabels(prev => ({ ...prev, [v.id]: e.target.value }));
                                                        setDirty(true);
                                                    }}
                                                    maxLength={120}
                                                />
                                                {v.isControl && <span className="sa-event-row__tag">Control</span>}
                                            </div>
                                            {v.isControl ? (
                                                <p className="pxp-url-split-row__control-note">
                                                    No redirect — visitors stay {test.targetPath === "/*" ? "on the current page" : <>on <code>{test.targetPath}</code></>}
                                                </p>
                                            ) : (
                                                <input
                                                    type="url"
                                                    className="sa-event-form__input pxp-url-split-row__input"
                                                    placeholder="https://example.com/variant-page"
                                                    value={splitUrls[v.id] || ""}
                                                    onChange={e => {
                                                        setSplitUrls(prev => ({ ...prev, [v.id]: e.target.value }));
                                                        setDirty(true);
                                                    }}
                                                    maxLength={2048}
                                                />
                                            )}
                                            {!v.isControl && (
                                                <button
                                                    type="button"
                                                    className="sa-event-row__delete"
                                                    onClick={async () => {
                                                        await fetch(`${ScannerHost}/api/ab-test-variants?variantId=${v.id}`, {
                                                            method: "DELETE", headers: authHeaders(),
                                                        }).catch(() => null);
                                                        fetchTest();
                                                    }}
                                                    aria-label={`Delete ${v.label || v.variantKey}`}
                                                >
                                                    <IconTrash />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            )}

                            {mode === "editor" && test.testType !== "url_split" && (
                            <div className="pxp-editor__body">
                                <div className="pxp-editor__canvas">
                                    {proxyError && (
                                        <div className="sa-notice sa-notice--error" style={{ margin: 16 }}>{proxyError}</div>
                                    )}
                                    {!proxyError && proxyUrl && (
                                        <iframe
                                            ref={iframeRef}
                                            key={activeVariantId /* fresh iframe instance per variant switch */}
                                            src={proxyUrl}
                                            className="pxp-editor__iframe"
                                            sandbox="allow-scripts allow-same-origin allow-forms"
                                            title="Page editor"
                                        />
                                    )}
                                </div>

                                <aside className="pxp-editor__panel">
                                    <button
                                        type="button"
                                        className={"pxp-select-btn" + (selectMode ? " --active" : "")}
                                        onClick={toggleSelectMode}
                                        disabled={!iframeReady}
                                    >
                                        {selectMode ? "Exit select mode" : "Select an element"}
                                    </button>

                                    {selectedElement && (
                                        <div className="pxp-inspector">
                                            <p className="pxp-inspector__selector" title={selectedElement.selector}>
                                                {selectedElement.tagName} &middot; {selectedElement.selector}
                                            </p>

                                            <label className="pxp-inspector__label">Text content</label>
                                            <TextEditRow
                                                initial={selectedElement.currentText}
                                                onApply={value => applyChange({ selector: selectedElement.selector, type: "text", value })}
                                            />

                                            <StylePanel
                                                currentStyles={selectedElement.currentStyles}
                                                onApply={(property, value) => applyChange({ selector: selectedElement.selector, type: "style", property, value })}
                                            />

                                            <button
                                                type="button"
                                                className="sa-event-row__delete"
                                                onClick={() => applyChange({ selector: selectedElement.selector, type: "remove" })}
                                            >
                                                <IconTrash /> Remove element
                                            </button>
                                        </div>
                                    )}

                                    {!selectedElement && (
                                        <p className="sa-panel__sub">
                                            {iframeReady ? 'Click “Select an element”, then click something on the page to edit it.' : "Loading the page…"}
                                        </p>
                                    )}

                                    <div className="pxp-changes-list">
                                        <h4 className="sa-panel__sub-title">Changes ({changes.length})</h4>
                                        {changes.map(c => (
                                            <div key={changeKey(c)} className="sa-campaign-event-chip" style={{ marginBottom: 6 }}>
                                                {CHANGE_TYPE_LABEL[c.type] || c.type}
                                                {c.property ? ` · ${c.property}` : ""}
                                                <button
                                                    type="button"
                                                    onClick={() => removeChange(c)}
                                                    style={{ marginLeft: 8, background: "none", border: "none", color: "inherit", cursor: "pointer" }}
                                                    aria-label="Remove this change"
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        ))}
                                        {changes.length === 0 && (
                                            <p className="sa-panel__sub">No edits yet on this variant.</p>
                                        )}
                                    </div>
                                </aside>
                            </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TextEditRow({ initial, onApply }) {
    const [value, setValue] = useState(initial || "");
    return (
        <div className="sa-event-form" style={{ marginBottom: 12 }}>
            <input
                type="text"
                className="sa-event-form__input"
                value={value}
                onChange={e => setValue(e.target.value)}
                maxLength={500}
            />
            <button type="button" className="sa-event-form__submit" onClick={() => onApply(value)}>Apply</button>
        </div>
    );
}

// Every editable style property for the selected element, grouped and
// pre-filled from its current computed style. Text/select/range fields
// apply on change; text fields apply on blur (so a value in progress isn't
// re-applied on every keystroke), matching how the rest of this panel
// already applies edits as a live preview rather than requiring a save
// step per field — Save (top toolbar) is still what persists to the DB.
function StylePanel({ currentStyles, onApply }) {
    const styles = currentStyles || {};
    return (
        <div className="pxp-style-panel">
            {STYLE_GROUPS.map(group => (
                <div key={group} className="pxp-style-group">
                    <label className="pxp-inspector__label">{group}</label>
                    {STYLE_PROPERTIES.filter(p => p.group === group).map(p => (
                        <StyleField key={p.key} prop={p} currentValue={styles[p.key]} onApply={onApply} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function StyleField({ prop, currentValue, onApply }) {
    const [value, setValue] = useState(currentValue || "");
    // Re-seed when a different element is selected (currentValue changes
    // identity via selectedElement, not on every render).
    useEffect(() => { setValue(currentValue || ""); }, [currentValue]);

    const commit = (v) => { setValue(v); onApply(prop.key, v); };

    if (prop.type === "color") {
        return (
            <div className="pxp-style-field">
                <span className="pxp-style-field__label">{prop.label}</span>
                <input
                    type="color"
                    className="pxp-style-field__color"
                    value={toHexColor(value)}
                    onChange={e => commit(e.target.value)}
                />
            </div>
        );
    }

    if (prop.type === "select") {
        return (
            <div className="pxp-style-field">
                <span className="pxp-style-field__label">{prop.label}</span>
                <select
                    className="sa-event-form__select pxp-style-field__input"
                    value={value}
                    onChange={e => commit(e.target.value)}
                >
                    <option value="">—</option>
                    {prop.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
        );
    }

    if (prop.type === "range") {
        return (
            <div className="pxp-style-field">
                <span className="pxp-style-field__label">{prop.label}</span>
                <input
                    type="range"
                    min="0" max="1" step="0.05"
                    className="pxp-style-field__range"
                    value={value === "" ? 1 : value}
                    onChange={e => commit(e.target.value)}
                />
                <span className="pxp-style-field__range-value">{value}</span>
            </div>
        );
    }

    return (
        <div className="pxp-style-field">
            <span className="pxp-style-field__label">{prop.label}</span>
            <input
                type="text"
                className="sa-event-form__input pxp-style-field__input"
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={() => commit(value)}
                maxLength={200}
            />
        </div>
    );
}

// Control is always first in `results.variants` (server orders is_control
// DESC), so an index-based palette keeps a variant's color identical across
// the table, the min-data progress bar, and both graphs without needing to
// thread a color prop through every layer.
const VARIANT_COLORS = [
    "rgba(192,159,83,0.95)",  // control — same gold as the rest of the app's accent
    "rgba(99,179,237,0.95)",
    "rgba(74,222,128,0.95)",
    "rgba(167,139,250,0.95)",
    "rgba(248,113,113,0.95)",
];
function variantColor(index) {
    return VARIANT_COLORS[index % VARIANT_COLORS.length];
}

function probabilityTone(p) {
    if (p == null) return "neutral";
    if (p >= 0.95) return "good";
    if (p <= 0.05) return "bad";
    return "neutral";
}

function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fmtDur(sec) {
    if (sec == null) return "—";
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Returns the index of the "winning" variant for a given engagement metric.
// For bounce/non-engagement metrics lower = better; for time/scroll higher = better.
function winnerIndex(variants, key, lowerBetter) {
    const vals = variants.map(v => v.engagement?.[key] ?? null);
    if (vals.every(v => v == null)) return -1;
    let best = null, bestIdx = -1;
    vals.forEach((v, i) => {
        if (v == null) return;
        if (best == null || (lowerBetter ? v < best : v > best)) { best = v; bestIdx = i; }
    });
    return bestIdx;
}

function ResultsPanel({ results, loading, history, domain, testId, testMeta, onSaveTargets }) {
    const [graphTab, setGraphTab] = useState("date");
    const [editingTargets, setEditingTargets] = useState(false);
    const [targetDraft, setTargetDraft] = useState({});
    const [targetSaving, setTargetSaving] = useState(false);

    const openVariantDetail = (variantId) => {
        history.push(`${analyticsPageExperimentsPath(domain)}/${testId}/variants/${variantId}`);
    };

    const openTargetEditor = () => {
        setTargetDraft(testMeta?.performanceTargets || {});
        setEditingTargets(true);
    };

    const saveTargets = async () => {
        setTargetSaving(true);
        await onSaveTargets(targetDraft);
        setTargetSaving(false);
        setEditingTargets(false);
    };

    if (loading) return <p className="sa-notice">Loading&hellip;</p>;
    if (!results) return <p className="sa-notice sa-notice--error">Could not load results.</p>;

    const { test, variants, dailySeries, hasEnoughData, minSessionsPerVariant, dateRange } = results;
    const hasGoal = !!test.goalEventName;
    const totalExposures = variants.reduce((s, v) => s + v.exposures, 0);
    const totalUniqueSessions = variants.reduce((s, v) => s + v.uniqueSessions, 0);
    const totalConversions = hasGoal ? variants.reduce((s, v) => s + (v.conversions || 0), 0) : null;

    const controlUrl = test.targetPath === "/*"
        ? `https://${test.domain} (entire site)`
        : `https://${test.domain}${test.targetPath}`;

    return (
        <div className="pxp-report">
            {test.testType === "url_split" && (
                <div className="pxp-report__pages">
                    {variants.map((v, i) => (
                        <div key={v.variantId} className="pxp-report__page">
                            <span className="pxp-report__variant-dot" style={{ background: variantColor(i) }} />
                            <span
                                className="pxp-report__page-name pxp-report__page-name--link"
                                onClick={() => openVariantDetail(v.variantId)}
                            >
                                {v.label || v.variantKey}
                            </span>
                            <span className="pxp-report__page-url">{v.isControl ? controlUrl : (v.redirectUrl || "No redirect URL set")}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="pxp-report__filters">
                <div className="pxp-report__filter">
                    <IconClock className="sa-icon" />
                    <div className="pxp-report__filter-text">
                        <span className="pxp-report__filter-value">
                            {dateRange ? `${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)}` : "No data yet"}
                        </span>
                        <span className="pxp-report__filter-label">Date range</span>
                    </div>
                </div>
                <div className="pxp-report__filter">
                    <IconUsers className="sa-icon" />
                    <div className="pxp-report__filter-text">
                        <span className="pxp-report__filter-value">All visitors</span>
                        <span className="pxp-report__filter-label">
                            Exposures are recorded for every visitor, regardless of cookie consent
                        </span>
                    </div>
                </div>
            </div>

            <div className="pxp-report__card">
                <div className="pxp-report__card-head">
                    {hasGoal ? (
                        <>
                            <span className="pxp-report__metric-badge">M1</span>
                            <h3 className="pxp-report__metric-title">{test.goalEventName}</h3>
                        </>
                    ) : (
                        <h3 className="pxp-report__metric-title">Traffic</h3>
                    )}
                </div>

                {!hasGoal && (
                    <p className="sa-panel__sub" style={{ marginBottom: 14 }}>
                        Set a goal event above to see conversion rates and statistical comparisons per variant.
                    </p>
                )}

                {hasGoal && !hasEnoughData && (
                    <div className="pxp-collecting">
                        <div className="pxp-collecting__head">
                            <IconAlertTriangle className="sa-icon" />
                            <span>Collecting minimum data for statistical calculations</span>
                        </div>
                        <div className="pxp-collecting__track">
                            {variants.map((v, i) => (
                                <div
                                    key={v.variantId}
                                    className="pxp-collecting__seg"
                                    style={{
                                        width: `${100 / variants.length}%`,
                                        background: `linear-gradient(90deg, ${variantColor(i)} ${Math.min(100, (v.uniqueSessions / minSessionsPerVariant) * 100)}%, rgba(255,255,255,0.05) 0)`,
                                    }}
                                    title={`${v.label || v.variantKey}: ${v.uniqueSessions} / ${minSessionsPerVariant} sessions`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="pxp-report__table-scroll">
                    <table className="sa-table pxp-report__table">
                        <thead>
                            <tr>
                                <th>Variation</th>
                                <th className="sa-table__num">
                                    {hasGoal ? "Unique conversions / visitors" : "Exposures / visitors"}
                                    <InfoTip text={
                                        hasGoal
                                            ? "Unique conversions: sessions that completed the goal event at least once. Visitors: unique sessions exposed to this variant (a repeat visit from the same session only counts once)."
                                            : "Exposures: total times this variant was shown, including repeat views from the same session. Visitors: unique sessions exposed to this variant, counted once each."
                                    } />
                                </th>
                                {hasGoal && (
                                    <th className="sa-table__num">
                                        Expected conversion rate
                                        <InfoTip text="A Bayesian estimate of the true conversion rate, smoothed toward 50% at low sample sizes so it doesn't swing wildly early in the test." />
                                    </th>
                                )}
                                {hasGoal && (
                                    <th className="sa-table__num">
                                        Expected improvement
                                        <InfoTip text="Estimated relative change in conversion rate versus the control (baseline) variant." />
                                    </th>
                                )}
                                {hasGoal && (
                                    <th className="sa-table__num">
                                        Probability to be better
                                        <InfoTip text="The probability, given the data collected so far, that this variant's true conversion rate is higher than the control's." />
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {variants.map((v, i) => (
                                <tr key={v.variantId}>
                                    <td
                                        className="pxp-report__variant-name"
                                        onClick={() => openVariantDetail(v.variantId)}
                                        title="View detailed stats"
                                    >
                                        <span className="pxp-report__variant-dot" style={{ background: variantColor(i) }} />
                                        {v.label || v.variantKey}
                                        {v.isControl && <span className="pxp-report__baseline-chip">Baseline</span>}
                                    </td>
                                    <td className="sa-table__num">
                                        {(hasGoal ? (v.conversions ?? 0) : v.exposures).toLocaleString("de-DE")} / {v.uniqueSessions.toLocaleString("de-DE")}
                                    </td>
                                    {hasGoal && (
                                        <td className="sa-table__num" title={v.conversions === null ? `No analytics site registered for ${v.domain}` : undefined}>
                                            {v.conversions === null ? "No site" : v.uniqueSessions > 0 ? formatPercent(v.expectedConversionRate * 100, 2) : "No data yet"}
                                        </td>
                                    )}
                                    {hasGoal && (
                                        <td className="sa-table__num">
                                            {v.isControl || !hasEnoughData || v.conversions === null ? "—" : (
                                                <span className={v.expectedImprovement >= 0 ? "pxp-report__uplift--pos" : "pxp-report__uplift--neg"}>
                                                    {v.expectedImprovement >= 0 ? "+" : ""}{formatPercent(v.expectedImprovement * 100)}
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    {hasGoal && (
                                        <td className="sa-table__num">
                                            {v.isControl ? (
                                                <span className="pxp-report__baseline-chip">Baseline</span>
                                            ) : v.conversions === null ? (
                                                "—"
                                            ) : !hasEnoughData ? (
                                                <span className="pxp-report__collecting-chip">Collecting data</span>
                                            ) : (
                                                <span className={`pxp-report__prob pxp-report__prob--${probabilityTone(v.probabilityToBeBetter)}`}>
                                                    {formatPercent(v.probabilityToBeBetter * 100)}
                                                </span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                            <tr className="pxp-report__total-row">
                                <td>Total</td>
                                <td className="sa-table__num">
                                    {(hasGoal ? totalConversions : totalExposures).toLocaleString("de-DE")} / {totalUniqueSessions.toLocaleString("de-DE")}
                                </td>
                                {hasGoal && <td className="sa-table__num">&mdash;</td>}
                                {hasGoal && <td className="sa-table__num">&mdash;</td>}
                                {hasGoal && <td className="sa-table__num">&mdash;</td>}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Engagement comparison card ─────────────────────────────── */}
            {variants.some(v => v.engagement) && (() => {
                const METRICS = [
                    { key: "bounceRate", label: "Bounce rate", fmt: v => v != null ? formatPercent(v * 100) : "—", lowerBetter: true, targetKey: "bounceRate", targetLabel: "Max bounce rate", targetDir: "max", targetUnit: "%" },
                    { key: "engagedRate", label: "Engaged sessions", fmt: v => v != null ? formatPercent(v * 100) : "—", lowerBetter: false, targetKey: "engagedRate", targetLabel: "Min engaged rate", targetDir: "min", targetUnit: "%" },
                    { key: "avgDurationSec", label: "Avg. time on page", fmt: fmtDur, lowerBetter: false, targetKey: "avgDurationSec", targetLabel: "Min avg. time", targetDir: "min", targetUnit: "s" },
                    { key: "avgScrollDepth", label: "Avg. scroll depth", fmt: v => v != null ? Math.round(v) + "%" : "—", lowerBetter: false, targetKey: "avgScrollDepth", targetLabel: "Min scroll depth", targetDir: "min", targetUnit: "%" },
                ];
                const targets = testMeta?.performanceTargets || {};
                const hasTargets = Object.keys(targets).length > 0;

                const passesTarget = (metric, value) => {
                    const t = targets[metric.targetKey];
                    if (t == null || value == null) return null;
                    const pct = ["bounceRate", "engagedRate"].includes(metric.key) ? value * 100 : value;
                    return metric.targetDir === "max" ? pct <= t : pct >= t;
                };

                return (
                    <>
                        <div className="pxp-report__card">
                            <div className="pxp-report__card-head">
                                <h3 className="pxp-report__metric-title">Engagement comparison</h3>
                                <button type="button" className="pxp-targets-edit-btn" onClick={openTargetEditor}>
                                    {hasTargets ? "Edit targets" : "+ Add targets"}
                                </button>
                            </div>

                            {editingTargets && (
                                <div className="pxp-targets-editor">
                                    <p className="pxp-targets-editor__hint">
                                        Set thresholds for your experiment. Each variant will be marked pass or fail against these values.
                                    </p>
                                    <div className="pxp-targets-editor__grid">
                                        {METRICS.map(m => (
                                            <label key={m.targetKey} className="pxp-targets-editor__field">
                                                <span className="pxp-targets-editor__label">
                                                    {m.targetLabel}
                                                </span>
                                                <div className="pxp-targets-editor__input-wrap">
                                                    <input
                                                        type="number"
                                                        min="0" max={m.targetUnit === "%" ? 100 : undefined}
                                                        step={m.targetUnit === "s" ? 10 : 1}
                                                        className="pxp-targets-editor__input"
                                                        placeholder="—"
                                                        value={targetDraft[m.targetKey] ?? ""}
                                                        onChange={e => {
                                                            const val = e.target.value === "" ? undefined : Number(e.target.value);
                                                            setTargetDraft(prev => {
                                                                const next = { ...prev };
                                                                if (val === undefined) delete next[m.targetKey];
                                                                else next[m.targetKey] = val;
                                                                return next;
                                                            });
                                                        }}
                                                    />
                                                    <span className="pxp-targets-editor__unit">{m.targetUnit}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="pxp-targets-editor__actions">
                                        <button type="button" className="pxp-launch-btn" onClick={saveTargets} disabled={targetSaving}>
                                            {targetSaving ? "Saving…" : "Save targets"}
                                        </button>
                                        <button type="button" className="pxp-targets-edit-btn" onClick={() => setEditingTargets(false)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="pxp-report__table-scroll">
                                <table className="sa-table pxp-report__table pxp-engagement-table">
                                    <thead>
                                        <tr>
                                            <th>Metric</th>
                                            {hasTargets && <th className="sa-table__num">Target</th>}
                                            {variants.map((v, i) => (
                                                <th key={v.variantId} className="sa-table__num">
                                                    <span className="pxp-report__variant-dot" style={{ background: variantColor(i) }} />
                                                    {v.label || v.variantKey}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {METRICS.map(m => {
                                            const bestIdx = winnerIndex(variants, m.key, m.lowerBetter);
                                            return (
                                                <tr key={m.key}>
                                                    <td className="pxp-engagement-table__metric">{m.label}</td>
                                                    {hasTargets && (
                                                        <td className="sa-table__num pxp-engagement-table__target">
                                                            {targets[m.targetKey] != null
                                                                ? `${m.targetDir === "max" ? "<" : ">"} ${targets[m.targetKey]}${m.targetUnit}`
                                                                : <span style={{ opacity: 0.3 }}>—</span>
                                                            }
                                                        </td>
                                                    )}
                                                    {variants.map((v, i) => {
                                                        const val = v.engagement?.[m.key] ?? null;
                                                        const isWinner = bestIdx === i && variants.length > 1;
                                                        const pass = passesTarget(m, val);
                                                        return (
                                                            <td key={v.variantId} className="sa-table__num pxp-engagement-table__cell">
                                                                {pass === true && <span className="pxp-target-pass">✓</span>}
                                                                {pass === false && <span className="pxp-target-fail">✗</span>}
                                                                <span className={isWinner ? "pxp-engagement-table__winner" : undefined}>
                                                                    {m.fmt(val)}
                                                                </span>
                                                                {isWinner && variants.length > 1 && (
                                                                    <span className="pxp-engagement-table__best-chip">best</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                );
            })()}

            {hasGoal && dailySeries.length > 0 && (
                <div className="pxp-report__card">
                    <div className="pxp-graph-tabs">
                        <button
                            type="button"
                            className={"pxp-graph-tab" + (graphTab === "date" ? " --active" : "")}
                            onClick={() => setGraphTab("date")}
                        >
                            <IconTrendingUp className="sa-icon" /> Date Range Graph
                        </button>
                        <button
                            type="button"
                            className={"pxp-graph-tab" + (graphTab === "improvement" ? " --active" : "")}
                            onClick={() => setGraphTab("improvement")}
                        >
                            <IconBarChart className="sa-icon" /> Expected Improvement Graph
                        </button>
                    </div>
                    {graphTab === "date"
                        ? <ConversionRateGraph dailySeries={dailySeries} variants={variants} />
                        : <ImprovementGraph dailySeries={dailySeries} variants={variants} />}
                </div>
            )}
        </div>
    );
}

// Cumulative conversion rate per variant, one line per variant, bucketed by
// day of first exposure (see api/ab-test-results.js's dailySeries doc
// comment). Hand-rolled SVG rather than Chart.js/react-chartjs-2 — nothing
// else in this Analytics folder pulls those in; every other chart here
// (see GoogleAnalyticsChart.js) is inline SVG, so this stays consistent
// with that rather than adding a second charting approach.
function ConversionRateGraph({ dailySeries, variants }) {
    const W = 900, H = 300;
    const PAD = { top: 16, right: 20, bottom: 30, left: 54 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const n = dailySeries.length;

    const series = variants.map((v, i) => ({
        variantId: v.variantId,
        label: v.label || v.variantKey,
        color: variantColor(i),
        points: dailySeries.map(d => d.variants[String(v.variantId)]?.cumulativeConversionRate ?? null),
    }));

    const observedMax = Math.max(0, ...series.flatMap(s => s.points.filter(p => p != null)));
    // Nice round ceiling with headroom above the highest observed rate;
    // falls back to a 10% placeholder scale before any real data exists.
    const maxRate = observedMax > 0 ? Math.min(1, Math.ceil(observedMax * 10) / 10 + 0.1) : 0.1;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => maxRate * f);

    const toX = i => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const toY = v => PAD.top + plotH - (Math.max(0, Math.min(v, maxRate)) / maxRate) * plotH;
    const xStep = Math.max(1, Math.ceil(n / 8));

    return (
        <div className="pxp-graph">
            <div className="pxp-graph-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="pxp-graph__svg" role="img" aria-label="Cumulative conversion rate by variant over time">
                    {yTicks.map(v => (
                        <g key={v}>
                            <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="rgba(160,160,160,0.6)">
                                {formatPercent(v * 100, v < 0.1 ? 1 : 0)}
                            </text>
                        </g>
                    ))}
                    {dailySeries.filter((_, i) => i % xStep === 0 || i === n - 1).map(d => {
                        const i = dailySeries.indexOf(d);
                        return (
                            <text key={d.date} x={toX(i)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10" fill="rgba(160,160,160,0.6)">
                                {d.date.slice(5)}
                            </text>
                        );
                    })}
                    {series.map(s => {
                        const defined = s.points.map((p, i) => (p == null ? null : [toX(i), toY(p)])).filter(Boolean);
                        if (!defined.length) return null;
                        return (
                            <path
                                key={s.variantId}
                                d={"M" + defined.map(([x, y]) => `${x},${y}`).join(" L")}
                                fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
            </div>
            <div className="pxp-graph__legend">
                {series.map(s => (
                    <span key={s.variantId} className="pxp-graph__legend-item">
                        <span className="pxp-graph__legend-dot" style={{ background: s.color }} />
                        {s.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

// Relative uplift of each non-control variant's cumulative conversion rate
// vs control's, per day — a deterministic trend view. The headline
// "Expected improvement" figure in the table above is the Monte-Carlo
// median from api/ab-test-results.js; this graph is the simpler day-by-day
// ratio, which is standard for a trend line and doesn't need re-simulating
// per day.
function ImprovementGraph({ dailySeries, variants }) {
    const control = variants.find(v => v.isControl);
    const challengers = variants.filter(v => !v.isControl);
    if (!control || challengers.length === 0) {
        return <p className="sa-panel__sub" style={{ padding: "16px 4px" }}>Add a variant to compare improvement against the baseline.</p>;
    }

    const W = 900, H = 300;
    const PAD = { top: 16, right: 20, bottom: 30, left: 54 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const n = dailySeries.length;

    const series = challengers.map(v => ({
        variantId: v.variantId,
        label: v.label || v.variantKey,
        color: variantColor(variants.indexOf(v)),
        points: dailySeries.map(d => {
            const c = d.variants[String(control.variantId)];
            const x = d.variants[String(v.variantId)];
            if (!c || !x || !c.cumulativeConversionRate) return null;
            return (x.cumulativeConversionRate - c.cumulativeConversionRate) / c.cumulativeConversionRate;
        }),
    }));

    const allVals = series.flatMap(s => s.points.filter(p => p != null));
    const bound = Math.max(0.1, Math.ceil(Math.max(0, ...allVals.map(v => Math.abs(v))) * 10) / 10);
    const toX = i => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const toY = v => PAD.top + plotH / 2 - (Math.max(-bound, Math.min(v, bound)) / bound) * (plotH / 2);
    const xStep = Math.max(1, Math.ceil(n / 8));
    const yTicks = [-bound, -bound / 2, 0, bound / 2, bound];

    return (
        <div className="pxp-graph">
            <div className="pxp-graph-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="pxp-graph__svg" role="img" aria-label="Expected improvement vs control over time">
                    {yTicks.map(v => (
                        <g key={v}>
                            <line
                                x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                                stroke={v === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}
                                strokeWidth="1"
                            />
                            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="rgba(160,160,160,0.6)">
                                {v > 0 ? "+" : ""}{(v * 100).toFixed(0)}%
                            </text>
                        </g>
                    ))}
                    {dailySeries.filter((_, i) => i % xStep === 0 || i === n - 1).map(d => {
                        const i = dailySeries.indexOf(d);
                        return (
                            <text key={d.date} x={toX(i)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10" fill="rgba(160,160,160,0.6)">
                                {d.date.slice(5)}
                            </text>
                        );
                    })}
                    {series.map(s => {
                        const defined = s.points.map((p, i) => (p == null ? null : [toX(i), toY(p)])).filter(Boolean);
                        if (!defined.length) return null;
                        return (
                            <path
                                key={s.variantId}
                                d={"M" + defined.map(([x, y]) => `${x},${y}`).join(" L")}
                                fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
            </div>
            <div className="pxp-graph__legend">
                {series.map(s => (
                    <span key={s.variantId} className="pxp-graph__legend-item">
                        <span className="pxp-graph__legend-dot" style={{ background: s.color }} />
                        {s.label} vs {control.label || control.variantKey}
                    </span>
                ))}
            </div>
        </div>
    );
}
