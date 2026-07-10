const { useState, useEffect, useCallback } = window.React;
const useHistory = window.ReactRouterDOM.useHistory;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import Authentication from "../../../Authentication/Auth.js";
import "../Style.css";

export default function ROPA() {
    document.title = "Record of Processing Activities | Settings | Intastellar Consents";
    const history = useHistory();

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [populating, setPopulating] = useState(false);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(API.ropa.list.url, {
            method: API.ropa.list.method,
            headers: API.ropa.list.headers,
        })
            .then((r) => r.json())
            .then((data) => setEntries(Array.isArray(data) ? data : []))
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    function autoPopulate() {
        setPopulating(true);
        fetch(API.ropa.autoPopulate.url, {
            method: API.ropa.autoPopulate.method,
            headers: API.ropa.autoPopulate.headers,
        })
            .then((r) => r.json())
            .then((result) => {
                if (result.created > 0) load();
            })
            .catch(() => {})
            .finally(() => setPopulating(false));
    }

    function exportAll() {
        setExporting(true);
        fetch(API.ropa.export.url, {
            method: API.ropa.export.method,
            headers: API.ropa.export.headers,
        })
            .then((r) => r.blob())
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `ropa-export-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            })
            .catch(() => {})
            .finally(() => setExporting(false));
    }

    function deleteEntry(id) {
        fetch(API.ropa.delete.url, {
            method: API.ropa.delete.method,
            headers: API.ropa.delete.headers,
            body: JSON.stringify({ id }),
        })
            .then(() => load())
            .catch(() => {});
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Record of Processing Activities" />
                <p className="settings-subpage__intro">
                    Maintain your Article 30 GDPR Record of Processing Activities. Each entry documents a processing
                    activity — its purpose, legal basis, data categories, recipients, and transfer mechanisms.
                    Use "Auto-populate" to seed entries from your pre-consent scan data.
                </p>

                <div className="settings-subpage__toolbar">
                    <span style={{ fontSize: "0.875rem", color: "rgba(180,180,180,0.8)" }}>
                        {entries.length} {entries.length === 1 ? "activity" : "activities"}
                        {entries.filter((e) => e.isDraft).length > 0 && (
                            <span style={{ marginLeft: "10px", color: "#d4b87a", fontSize: "0.8125rem" }}>
                                {entries.filter((e) => e.isDraft).length} draft
                            </span>
                        )}
                    </span>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                            type="button"
                            className="settings-subpage__submit"
                            onClick={autoPopulate}
                            disabled={populating}
                            style={{ background: "rgba(80,130,210,0.18)", borderColor: "rgba(80,130,210,0.4)", color: "#a8c4f0" }}
                        >
                            {populating ? "Scanning…" : "Auto-populate from scan"}
                        </button>
                        <button
                            type="button"
                            className="settings-subpage__submit"
                            onClick={exportAll}
                            disabled={exporting || entries.length === 0}
                        >
                            {exporting ? "Exporting…" : "Export CSV"}
                        </button>
                        <button
                            type="button"
                            className="settings-subpage__submit"
                            onClick={() => history.push("/settings/ropa/new")}
                        >
                            + Add activity
                        </button>
                    </div>
                </div>

                {loading ? (
                    <p className="settings-subpage__empty">Loading…</p>
                ) : entries.length === 0 ? (
                    <p className="settings-subpage__empty">
                        No processing activities yet. Click "Auto-populate from scan" to import from your
                        pre-consent data, or add one manually.
                    </p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {entries.map((entry) => (
                            <div key={entry.id} className="settings-subpage__panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px 20px" }}>
                                <div style={{ flex: "1 1 260px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                                        <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#f2f2f2" }}>
                                            {entry.activityName}
                                        </span>
                                        {entry.isDraft && (
                                            <span style={{ padding: "2px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(192,159,83,0.15)", border: "1px solid rgba(192,159,83,0.3)", color: "#c0a053" }}>
                                                Draft
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "rgba(180,180,180,0.85)", lineHeight: 1.45 }}>
                                        {entry.purpose && <span>Purpose: {entry.purpose}</span>}
                                        {entry.legalBasis && <span style={{ marginLeft: "12px" }}>Legal basis: {entry.legalBasis}</span>}
                                        {entry.retentionPeriod && <span style={{ marginLeft: "12px" }}>Retention: {entry.retentionPeriod}</span>}
                                    </p>
                                    {Array.isArray(entry.thirdCountryTransfers) && entry.thirdCountryTransfers.length > 0 && (
                                        <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#d4b87a" }}>
                                            Third-country transfers: {entry.thirdCountryTransfers.map((t) => t.country).join(", ")}
                                        </p>
                                    )}
                                </div>
                                <div style={{ flexShrink: 0, display: "flex", gap: "8px", alignItems: "center" }}>
                                    <span style={{ fontSize: "0.75rem", color: "rgba(140,140,140,0.7)" }}>
                                        {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}
                                    </span>
                                    <button
                                        type="button"
                                        className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                        style={{ padding: "7px 14px", fontSize: "0.8125rem" }}
                                        onClick={() => history.push(`/settings/ropa/${entry.id}`)}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-blacklist-modal__btn settings-blacklist-modal__btn--danger"
                                        style={{ padding: "7px 12px", fontSize: "0.8125rem" }}
                                        onClick={() => deleteEntry(entry.id)}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </>
    );
}
