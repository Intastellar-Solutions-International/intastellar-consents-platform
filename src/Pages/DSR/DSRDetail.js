const { useState, useEffect, useCallback } = window.React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
import API from "../../API/api.js";
import SideNav from "../../Components/Header/SideNav.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { reportsLinks } from "../Reports/Reports.js";
import { DSR_DEADLINES_DAYS, FRAMEWORK_LABELS } from "../../Functions/jurisdictionEngine.js";
import "./Style.css";

const REQUEST_TYPE_LABELS = {
    access:      "Access (Right to know)",
    erasure:     "Erasure (Right to be forgotten)",
    portability: "Portability",
    restriction: "Restriction of processing",
    objection:   "Objection to processing",
    opt_out:     "Opt-out of sale / share",
};

const STATUS_STYLES = {
    pending:     { bg: "rgba(192,159,83,0.15)", border: "rgba(192,159,83,0.35)", color: "#d4b87a", label: "Pending" },
    in_progress: { bg: "rgba(80,130,210,0.15)", border: "rgba(80,130,210,0.35)", color: "#88b0e8", label: "In Progress" },
    completed:   { bg: "rgba(80,180,100,0.15)", border: "rgba(80,180,100,0.35)", color: "#7dd590", label: "Completed" },
    overdue:     { bg: "rgba(220,80,80,0.15)",  border: "rgba(220,80,80,0.35)",  color: "#f0a8a0", label: "Overdue" },
};

function StatusBadge({ status }) {
    const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "4px 12px", borderRadius: "8px",
            fontSize: "0.75rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em",
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        }}>
            {s.label}
        </span>
    );
}

export default function DSRDetail() {
    const { id, requestId } = useParams();
    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API.dsr.list.url}/${requestId}`, {
            method: "GET",
            headers: API.dsr.list.headers,
        })
            .then((r) => r.json())
            .then((data) => setRequest(data))
            .catch(() => setRequest(null))
            .finally(() => setLoading(false));
    }, [requestId]);

    useEffect(() => { load(); }, [load]);

    function updateStatus(newStatus) {
        if (!request) return;
        setUpdating(true);
        fetch(API.dsr.update.url, {
            method: API.dsr.update.method,
            headers: API.dsr.update.headers,
            body: JSON.stringify({ id: requestId, status: newStatus }),
        })
            .then((r) => r.json())
            .then(() => load())
            .catch(() => {})
            .finally(() => setUpdating(false));
    }

    if (loading) {
        return (
            <>
                <SideNav links={reportsLinks} title="Reports" />
                <main className="dashboard-content settings-subpage settings-subpage--wide">
                    <StickyPageTitle title="DSR Detail" />
                    <p className="settings-subpage__empty">Loading…</p>
                </main>
            </>
        );
    }

    if (!request) {
        return (
            <>
                <SideNav links={reportsLinks} title="Reports" />
                <main className="dashboard-content settings-subpage settings-subpage--wide">
                    <StickyPageTitle title="DSR Detail" />
                    <p className="settings-subpage__empty">Request not found.</p>
                </main>
            </>
        );
    }

    const days = DSR_DEADLINES_DAYS[request.regulation] ?? 30;
    const deadline = new Date(request.submitted);
    deadline.setDate(deadline.getDate() + days);
    const isOverdue = new Date() > deadline && request.status !== "completed";
    const derivedStatus = request.status === "completed" ? "completed" : isOverdue ? "overdue" : (request.status || "pending");

    document.title = `DSR — ${request.uid} | Intastellar Consents`;

    const auditLogHref = `/${id}/reports/user-consents?uid=${encodeURIComponent(request.uid)}`;

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Data Subject Request" />

                <Link to={`/${id}/reports/dsr`} className="settings-subpage__back">
                    ← All requests
                </Link>

                <div className="settings-subpage__panel" style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px 20px", marginBottom: "20px" }}>
                        <div>
                            <p style={{ margin: "0 0 6px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(192,159,83,0.9)" }}>Subject UID</p>
                            <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: "1rem", color: "#f2f2f2" }}>{request.uid}</p>
                        </div>
                        <StatusBadge status={derivedStatus} />
                    </div>

                    <div className="dsr-meta-grid">
                        <div className="dsr-meta-item">
                            <span className="dsr-meta-label">Request type</span>
                            <span className="dsr-meta-value">{REQUEST_TYPE_LABELS[request.type] || request.type}</span>
                        </div>
                        <div className="dsr-meta-item">
                            <span className="dsr-meta-label">Regulation</span>
                            <span className="dsr-meta-value">{FRAMEWORK_LABELS[request.regulation] || request.regulation}</span>
                        </div>
                        <div className="dsr-meta-item">
                            <span className="dsr-meta-label">Submitted</span>
                            <span className="dsr-meta-value">{new Date(request.submitted).toLocaleDateString()}</span>
                        </div>
                        <div className="dsr-meta-item">
                            <span className="dsr-meta-label">Deadline</span>
                            <span className="dsr-meta-value" style={{ color: isOverdue ? "#f0a8a0" : undefined }}>
                                {deadline.toLocaleDateString()}
                                <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "rgba(140,140,140,0.7)" }}>({days} days)</span>
                            </span>
                        </div>
                        {request.notes && (
                            <div className="dsr-meta-item" style={{ gridColumn: "1 / -1" }}>
                                <span className="dsr-meta-label">Notes</span>
                                <span className="dsr-meta-value">{request.notes}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: "20px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                        <Link
                            to={auditLogHref}
                            style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#e0e0e0", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
                        >
                            View consent history →
                        </Link>

                        {derivedStatus !== "completed" && (
                            <>
                                {derivedStatus === "pending" && (
                                    <button
                                        type="button"
                                        className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                        onClick={() => updateStatus("in_progress")}
                                        disabled={updating}
                                    >
                                        Mark in progress
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                    onClick={() => updateStatus("completed")}
                                    disabled={updating}
                                    style={{ background: "rgba(80,180,100,0.2)", borderColor: "rgba(80,180,100,0.45)", color: "#a8edb8" }}
                                >
                                    Mark completed
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {Array.isArray(request.history) && request.history.length > 0 && (
                    <div className="settings-subpage__panel">
                        <h3 style={{ margin: "0 0 14px", fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(192,159,83,0.9)" }}>
                            Activity
                        </h3>
                        <ul className="dsr-timeline">
                            {request.history.map((entry, i) => (
                                <li key={i} className="dsr-timeline__item">
                                    <span className="dsr-timeline__dot" />
                                    <span className="dsr-timeline__action">
                                        {entry.action}
                                        <span className="dsr-timeline__time">
                                            {new Date(entry.at).toLocaleString()}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </main>
        </>
    );
}
