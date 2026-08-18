const { useState, useEffect, useCallback, useContext, useMemo, useRef } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain, analyticsPageExperimentsPath } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../API/host.js";
import { authHeaders } from "./_shared.js";
import { IconPlus, IconTrash } from "./Icons.js";
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

    // Reseed local `changes` whenever the active variant changes (switching
    // tabs, or the initial load) — local edits are per-variant, not shared.
    useEffect(() => {
        setChanges(activeVariant?.changes || []);
        setDirty(false);
        setSelectedElement(null);
    }, [activeVariant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Mint a signed proxy URL for the active variant ─────────────────────────
    useEffect(() => {
        if (!activeVariantId || !testId) { setProxyUrl(null); return; }
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
    }, [testId, activeVariantId]);

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
        const r = await fetch(`${ScannerHost}/api/ab-test-variants`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ testId, variantKey: key.trim().toLowerCase() }),
        }).catch(() => null);
        if (!r?.ok) { alert("Could not create variant — key may already be in use."); return; }
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

    const [statusSaving, setStatusSaving] = useState(false);
    const canLaunch = variants.length >= 2 && (test?.status === "draft" || test?.status === "paused");
    const setStatus = async (status) => {
        setStatusSaving(true);
        const r = await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ status }),
        }).catch(() => null);
        setStatusSaving(false);
        if (!r?.ok) {
            const b = await r?.json().catch(() => null);
            alert(b?.error || "Could not update test status.");
            return;
        }
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
                        <div className="pxp-editor">
                            <div className="pxp-editor__toolbar">
                                <button type="button" className="pxp-back-link" onClick={() => history.push(analyticsPageExperimentsPath(domain))}>
                                    &larr; All page experiments
                                </button>
                                <div className="pxp-variant-tabs">
                                    {variants.map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            className={"pxp-variant-tab" + (v.id === activeVariantId ? " --active" : "")}
                                            onClick={() => setActiveVariantId(v.id)}
                                        >
                                            {v.label || v.variantKey}
                                        </button>
                                    ))}
                                    <button type="button" className="pxp-variant-tab pxp-variant-tab--add" onClick={addVariant}>
                                        <IconPlus className="sa-icon" /> Variant
                                    </button>
                                </div>
                                {test.status === "running" ? (
                                    <button
                                        type="button"
                                        className="pxp-launch-btn"
                                        onClick={() => setStatus("paused")}
                                        disabled={statusSaving}
                                    >
                                        {statusSaving ? "Pausing…" : "Pause"}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="pxp-launch-btn"
                                        onClick={() => setStatus("running")}
                                        disabled={!canLaunch || statusSaving}
                                        title={!canLaunch ? "Add a second variant to launch this test" : undefined}
                                    >
                                        {statusSaving ? "Launching…" : "Launch"}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="sa-event-form__submit"
                                    onClick={handleSave}
                                    disabled={!dirty || saving}
                                >
                                    {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                                </button>
                            </div>

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
                                            {iframeReady ? "Click “Select an element”, then click something on the page to edit it." : "Loading the page…"}
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
