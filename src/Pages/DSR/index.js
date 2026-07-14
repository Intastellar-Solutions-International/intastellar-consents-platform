const { useState, useEffect, useCallback } = window.React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
const Link = window.ReactRouterDOM.Link;
import API from "../../API/api.js";
import SideNav from "../../Components/Header/SideNav.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { reportsLinks } from "../Reports/Reports.js";
import Authentication from "../../Authentication/Auth.js";
import { DSR_DEADLINES_DAYS, FRAMEWORK_LABELS } from "../../Functions/jurisdictionEngine.js";
import "./Style.css";

const REQUEST_TYPES = [
    { id: "access",      label: "Access (Right to know)" },
    { id: "erasure",     label: "Erasure (Right to be forgotten)" },
    { id: "portability", label: "Portability" },
    { id: "restriction", label: "Restriction of processing" },
    { id: "objection",   label: "Objection to processing" },
    { id: "opt_out",     label: "Opt-out of sale / share" },
];

const REGULATIONS = ["GDPR", "LGPD", "CCPA", "CDPA", "CPA", "UCPA", "CTDPA", "POPIA", "PDPA", "APA", "PDPL", "PIPEDA", "LAW25"];

const STATUS_STYLES = {
    pending:     { bg: "rgba(192,159,83,0.15)", border: "rgba(192,159,83,0.35)", color: "#d4b87a", label: "Pending" },
    in_progress: { bg: "rgba(80,130,210,0.15)", border: "rgba(80,130,210,0.35)", color: "#88b0e8", label: "In Progress" },
    completed:   { bg: "rgba(80,180,100,0.15)", border: "rgba(80,180,100,0.35)", color: "#7dd590", label: "Completed" },
    overdue:     { bg: "rgba(220,80,80,0.15)",  border: "rgba(220,80,80,0.35)",  color: "#f0a8a0", label: "Overdue" },
};

function deadlineDate(submittedIso, regulation) {
    const days = DSR_DEADLINES_DAYS[regulation] ?? 30;
    const d = new Date(submittedIso);
    d.setDate(d.getDate() + days);
    return d;
}

function deriveStatus(request) {
    if (request.status === "completed") return "completed";
    const deadline = deadlineDate(request.submitted, request.regulation);
    if (new Date() > deadline) return "overdue";
    return request.status || "pending";
}

function StatusBadge({ status }) {
    const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "3px 10px", borderRadius: "6px",
            fontSize: "0.6875rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em",
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        }}>
            {s.label}
        </span>
    );
}

export default function DSR() {
    document.title = "Data Subject Requests | Reports | Intastellar Consents";
    const { id } = useParams();
    const history = useHistory();

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ uid: "", type: "access", regulation: "GDPR", notes: "" });
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(API.dsr.list.url, {
            method: API.dsr.list.method,
            headers: API.dsr.list.headers,
        })
            .then((r) => r.json())
            .then((data) => setRequests(Array.isArray(data) ? data : []))
            .catch(() => setRequests([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    function submitRequest() {
        if (!form.uid.trim()) return;
        setSubmitting(true);
        fetch(API.dsr.create.url, {
            method: API.dsr.create.method,
            headers: API.dsr.create.headers,
            body: JSON.stringify({
                ...form,
                submitted: new Date().toISOString(),
                submittedBy: Authentication.getUserId(),
            }),
        })
            .then((r) => r.json())
            .then(() => { setShowModal(false); setForm({ uid: "", type: "access", regulation: "GDPR", notes: "" }); load(); })
            .catch(() => {})
            .finally(() => setSubmitting(false));
    }

    const enriched = requests.map((r) => ({ ...r, derivedStatus: deriveStatus(r) }));

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Data Subject Requests" />
                <p className="settings-subpage__intro">
                    Track and manage data subject requests (access, erasure, portability, etc.) with automatic
                    deadlines per regulation. Click a request to view the subject's consent history and update its status.
                </p>

                <div className="settings-subpage__toolbar">
                    <span style={{ fontSize: "0.875rem", color: "rgba(180,180,180,0.8)" }}>
                        {enriched.length} request{enriched.length !== 1 ? "s" : ""}
                        {enriched.filter((r) => r.derivedStatus === "overdue").length > 0 && (
                            <span style={{ marginLeft: "10px", color: "#f0a8a0", fontWeight: 600 }}>
                                {enriched.filter((r) => r.derivedStatus === "overdue").length} overdue
                            </span>
                        )}
                    </span>
                    <button type="button" className="settings-subpage__submit" onClick={() => setShowModal(true)}>
                        + New request
                    </button>
                </div>

                {loading ? (
                    <p className="settings-subpage__empty">Loading…</p>
                ) : enriched.length === 0 ? (
                    <p className="settings-subpage__empty">No data subject requests yet. Create one above.</p>
                ) : (
                    <div className="settings-table-wrap">
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Subject UID</th>
                                    <th>Type</th>
                                    <th>Regulation</th>
                                    <th>Submitted</th>
                                    <th>Deadline</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enriched.map((r) => {
                                    const dl = deadlineDate(r.submitted, r.regulation);
                                    const typeLabel = REQUEST_TYPES.find((t) => t.id === r.type)?.label || r.type;
                                    return (
                                        <tr
                                            key={r.id}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => history.push(`/${id}/reports/dsr/${r.id}`)}
                                        >
                                            <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", color: "#c0a053" }}>
                                                {r.uid}
                                            </td>
                                            <td>{typeLabel}</td>
                                            <td>{FRAMEWORK_LABELS[r.regulation] || r.regulation}</td>
                                            <td style={{ color: "rgba(180,180,180,0.85)", fontSize: "0.8125rem" }}>
                                                {new Date(r.submitted).toLocaleDateString()}
                                            </td>
                                            <td style={{ fontSize: "0.8125rem", color: r.derivedStatus === "overdue" ? "#f0a8a0" : "rgba(180,180,180,0.85)" }}>
                                                {dl.toLocaleDateString()}
                                                <span style={{ marginLeft: "6px", fontSize: "0.6875rem", color: "rgba(140,140,140,0.7)" }}>
                                                    ({DSR_DEADLINES_DAYS[r.regulation] ?? 30} days)
                                                </span>
                                            </td>
                                            <td><StatusBadge status={r.derivedStatus} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {showModal && (
                    <div className="dsr-modal" role="dialog" aria-modal="true" aria-labelledby="dsr-modal-title">
                        <div className="dsr-modal__card">
                            <h2 id="dsr-modal-title">New data subject request</h2>

                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label">Subject UID *</label>
                                <input
                                    type="text"
                                    className="settings-blacklist-modal__card input"
                                    placeholder="e.g. user-abc123 or UUID"
                                    value={form.uid}
                                    onChange={(e) => setForm((f) => ({ ...f, uid: e.target.value }))}
                                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit", marginBottom: "0" }}
                                />
                            </div>

                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label">Request type</label>
                                <select
                                    className="settings-org-modal__select settings-blacklist-modal__card"
                                    value={form.type}
                                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit" }}
                                >
                                    {REQUEST_TYPES.map((t) => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label">Regulation</label>
                                <select
                                    className="settings-org-modal__select settings-blacklist-modal__card"
                                    value={form.regulation}
                                    onChange={(e) => setForm((f) => ({ ...f, regulation: e.target.value }))}
                                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit" }}
                                >
                                    {REGULATIONS.map((r) => (
                                        <option key={r} value={r}>{FRAMEWORK_LABELS[r] || r}</option>
                                    ))}
                                </select>
                                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "rgba(150,150,150,0.8)" }}>
                                    Deadline: {DSR_DEADLINES_DAYS[form.regulation] ?? 30} days from today
                                    ({new Date(Date.now() + (DSR_DEADLINES_DAYS[form.regulation] ?? 30) * 86400000).toLocaleDateString()})
                                </p>
                            </div>

                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label">Notes (optional)</label>
                                <textarea
                                    rows={3}
                                    placeholder="Internal notes about this request…"
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "#f0f0f0", fontSize: "0.875rem", fontFamily: "inherit", resize: "vertical" }}
                                />
                            </div>

                            <div className="settings-blacklist-modal__actions">
                                <button type="button" className="settings-blacklist-modal__btn" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                    onClick={submitRequest}
                                    disabled={submitting || !form.uid.trim()}
                                >
                                    {submitting ? "Creating…" : "Create request"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}
