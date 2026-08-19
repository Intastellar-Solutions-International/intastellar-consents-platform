const { useState, useEffect, useCallback } = React;
const useHistory = window.ReactRouterDOM.useHistory;
import { analyticsPageExperimentsPath } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../API/host.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import { IconPlus, IconTrash } from "./Icons.js";
import "./Analytics.css";

const STATUS_LABEL = { draft: "Draft", running: "Running", paused: "Paused", archived: "Archived", completed: "Completed" };

export default function PageExperiments() {
    document.title = "Page Experiments | Site Analytics";

    const history = useHistory();
    const { domain } = useAnalyticsPageChrome();

    const [tests, setTests] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState("");
    const [targetPath, setTargetPath] = useState("/");
    const [testType, setTestType] = useState("visual");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState(null);

    const fetchTests = useCallback(() => {
        if (!domain) { setTests(null); return; }
        setLoading(true);
        setError(null);
        fetch(`${ScannerHost}/api/ab-tests?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(d => setTests(d.tests || []))
            .catch(() => setError("Could not load page experiments."))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { fetchTests(); }, [fetchTests]);

    const createTest = async (e) => {
        e.preventDefault();
        if (!name.trim() || !domain) return;
        setSaving(true);
        setFormError(null);
        const r = await fetch(`${ScannerHost}/api/ab-tests`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain, name: name.trim(), targetPath: targetPath.trim() || "/", testType }),
        }).catch(() => null);
        setSaving(false);
        if (!r?.ok) {
            const body = await r?.json().catch(() => null);
            setFormError(body?.error || "Could not create test.");
            return;
        }
        const data = await r.json();
        // Straight into the visual editor — creation itself is a lightweight
        // 2-field form, the editor is the actual "New Test" experience.
        history.push(`${analyticsPageExperimentsPath(domain)}/${data.test.id}`);
    };

    const removeTest = async (testId) => {
        await fetch(`${ScannerHost}/api/ab-tests?testId=${testId}`, {
            method: "DELETE", headers: authHeaders(),
        }).catch(() => null);
        fetchTests();
    };

    const showData = domain && !loading && !error && tests;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle title="Page Experiments" />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view page experiments.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}

                    {showData && (
                        <div className="sa-section">
                            <div className="sa-panel__head">
                                <h3 className="sa-section__title">Tests</h3>
                                <button type="button" className="sa-add-event-btn" onClick={() => setShowForm(s => !s)}>
                                    <IconPlus className="sa-icon" /> New test
                                </button>
                            </div>

                            {showForm && (
                                <form className="sa-event-form" onSubmit={createTest}>
                                    <input
                                        type="text"
                                        className="sa-event-form__input"
                                        placeholder="test name, e.g. Pricing page hero"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        maxLength={120}
                                        required
                                    />
                                    <input
                                        type="text"
                                        className="sa-event-form__input"
                                        placeholder="page path to test, e.g. /pricing or /blog/* for everything under /blog"
                                        value={targetPath}
                                        onChange={e => setTargetPath(e.target.value)}
                                        maxLength={512}
                                        disabled={targetPath === "/*"}
                                    />
                                    <label className="sa-event-form__checkbox">
                                        <input
                                            type="checkbox"
                                            checked={targetPath === "/*"}
                                            onChange={e => setTargetPath(e.target.checked ? "/*" : "/")}
                                        />
                                        Apply to the entire site (all pages)
                                    </label>
                                    <div className="sa-event-form__type-row">
                                        <label className={`sa-event-form__type-opt${testType === "visual" ? " sa-event-form__type-opt--active" : ""}`}>
                                            <input type="radio" name="testType" value="visual"
                                                checked={testType === "visual"}
                                                onChange={() => setTestType("visual")} />
                                            Visual editor
                                            <span className="sa-event-form__type-hint">Modify elements on the same page</span>
                                        </label>
                                        <label className={`sa-event-form__type-opt${testType === "url_split" ? " sa-event-form__type-opt--active" : ""}`}>
                                            <input type="radio" name="testType" value="url_split"
                                                checked={testType === "url_split"}
                                                onChange={() => setTestType("url_split")} />
                                            URL split
                                            <span className="sa-event-form__type-hint">Redirect variants to different pages</span>
                                        </label>
                                    </div>
                                    <button type="submit" className="sa-event-form__submit" disabled={saving}>
                                        {saving ? "Creating…" : "Create & open editor"}
                                    </button>
                                </form>
                            )}
                            {formError && <p className="sa-notice sa-notice--error">{formError}</p>}

                            {tests.length === 0 && !showForm && (
                                <p className="sa-panel__sub">
                                    No page experiments yet. Create one to open the visual editor and start making variants.
                                </p>
                            )}

                            {tests.length > 0 && (
                                <div className="sa-events-list">
                                    {tests.map(t => (
                                        <div key={t.id} className="sa-event-row">
                                            <div className="sa-event-row__body" style={{ cursor: "pointer" }}
                                                 onClick={() => history.push(`${analyticsPageExperimentsPath(domain)}/${t.id}`)}>
                                                <div className="sa-event-row__top">
                                                    <span className="sa-event-row__name">{t.name}</span>
                                                    <span className="sa-event-row__kind">{STATUS_LABEL[t.status] || t.status}</span>
                                                </div>
                                                <div className="sa-event-row__stats">
                                                    <span>{t.targetPath}</span>
                                                    <span>{t.variantCount} variant{t.variantCount !== 1 ? "s" : ""}</span>
                                                    {t.testType === "url_split" && <span className="sa-event-row__tag">URL split</span>}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="sa-event-row__delete"
                                                onClick={() => removeTest(t.id)}
                                                aria-label={`Delete ${t.name}`}
                                            >
                                                <IconTrash />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
