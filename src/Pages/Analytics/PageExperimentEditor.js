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

                                            <label className="pxp-inspector__label">Style property</label>
                                            <StyleEditRow
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

function StyleEditRow({ onApply }) {
    const [property, setProperty] = useState("");
    const [value, setValue] = useState("");
    return (
        <div className="sa-event-form" style={{ marginBottom: 12 }}>
            <input
                type="text"
                className="sa-event-form__input"
                placeholder="property, e.g. color"
                value={property}
                onChange={e => setProperty(e.target.value)}
                maxLength={100}
            />
            <input
                type="text"
                className="sa-event-form__input"
                placeholder="value, e.g. red"
                value={value}
                onChange={e => setValue(e.target.value)}
                maxLength={200}
            />
            <button
                type="button"
                className="sa-event-form__submit"
                onClick={() => property.trim() && onApply(property.trim(), value)}
            >
                Apply
            </button>
        </div>
    );
}
