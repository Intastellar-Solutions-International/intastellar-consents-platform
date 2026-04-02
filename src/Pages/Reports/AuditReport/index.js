const { useState, useEffect, useMemo, useContext } = React;
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks } from "../Reports";
import { DomainContext } from "../../../App.js";
import API from "../../../API/api";
import Authentication from "../../../Authentication/Auth";
import "../../Dashboard/Style.css";
import "./AuditReports.css";
import {
    loadAuditReportIndex,
    addAuditReportEntry,
    removeAuditReportEntry,
} from "../../../Functions/auditReportsStorage";

const useParams = window.ReactRouterDOM.useParams;

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function newReportId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDisplayDate(isoOrYmd) {
    if (!isoOrYmd) return "—";
    try {
        const d = new Date(isoOrYmd);
        if (Number.isNaN(d.getTime())) return String(isoOrYmd);
        return d.toLocaleDateString("de-DE", { dateStyle: "medium" });
    } catch {
        return String(isoOrYmd);
    }
}

function toYmd(d) {
    if (!d) return "";
    if (typeof d === "string") return d.split("T")[0];
    try {
        return d.toISOString().split("T")[0];
    } catch {
        return "";
    }
}

export default function AuditReport() {
    document.title = "Audit reports | Intastellar Consents | CMP";
    const [currentDomain] = useContext(DomainContext);
    const { id } = useParams();
    const orgId = Authentication.getOrganisation();

    const settings = (() => {
        try {
            return JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
        } catch {
            return { dateRange: 30 };
        }
    })();

    const today = new Date();
    const [getLastDays, setLastDays] = useState(
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30
    );
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - (settings?.dateRange ?? 30)))
    );
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [activeData, setActiveData] = useState(null);
    const previousPeriod = new Date(new Date().setDate(today.getDate() - getLastDays));
    const previousPeriod2 = new Date(new Date().setDate(today.getDate() - getLastDays * 2));

    const [search, setSearch] = useState("");
    const [reports, setReports] = useState([]);
    const [generating, setGenerating] = useState(false);
    const [regeneratingId, setRegeneratingId] = useState(null);

    const url = API[id]?.getInteractions?.url;
    const method = API[id]?.getInteractions?.method;
    const header = API[id]?.getInteractions?.headers;

    const combinedView = !currentDomain || currentDomain === "combined view";

    useEffect(() => {
        if (orgId == null || combinedView) {
            setReports([]);
            return;
        }
        setReports(loadAuditReportIndex(orgId, currentDomain));
    }, [orgId, currentDomain, combinedView]);

    const filteredReports = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return reports;
        return reports.filter((r) => {
            const blob = [
                r.title,
                r.fromDate,
                r.toDate,
                r.createdAt,
                r.reportType,
                formatDisplayDate(r.fromDate),
                formatDisplayDate(r.toDate),
                formatDisplayDate(r.createdAt),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return blob.includes(q);
        });
    }, [reports, search]);

    async function requestAuditPdf(fromYmd, toYmd) {
        if (!API[id]?.exportPDF) throw new Error("Export not configured");
        API[id].exportPDF.headers.FromDate = fromYmd;
        API[id].exportPDF.headers.ToDate = toYmd;

        const response = await fetch(API[id].exportPDF.url, {
            method: API[id].exportPDF.method,
            headers: {
                ...API[id].exportPDF.headers,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                domains: [currentDomain],
                reportType: "portfolio_audit",
            }),
        });

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("globals");
            window.location.href = "/login";
            return { ok: false };
        }

        if (response.headers.get("content-type")?.includes("application/pdf")) {
            const blob = await response.blob();
            return { ok: true, blob };
        }

        let msg = "Unknown error";
        try {
            const data = await response.json();
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return { ok: false };
            }
            msg = data?.error || JSON.stringify(data);
        } catch {
            msg = await response.text();
        }
        return { ok: false, error: msg };
    }

    async function handleGenerateNew() {
        if (combinedView) {
            window.alert("Select a specific domain in the header to generate audit reports.");
            return;
        }
        const fromYmd = toYmd(fromDate);
        const toYmdVal = toYmd(toDate);
        if (!fromYmd || !toYmdVal) {
            window.alert("Choose a valid date range.");
            return;
        }

        setGenerating(true);
        try {
            const result = await requestAuditPdf(fromYmd, toYmdVal);
            if (!result.ok) {
                if (result.error) window.alert("Failed to generate PDF: " + result.error);
                return;
            }
            downloadBlob(
                result.blob,
                `Consent_Audit_${currentDomain}_${fromYmd}_to_${toYmdVal}.pdf`
            );
            const entry = {
                id: newReportId(),
                domain: currentDomain,
                fromDate: fromYmd,
                toDate: toYmdVal,
                createdAt: new Date().toISOString(),
                reportType: "portfolio_audit",
                title: `Consent audit · ${currentDomain}`,
            };
            const next = addAuditReportEntry(orgId, currentDomain, entry);
            setReports(next);
        } catch {
            window.alert("An error occurred while generating the PDF.");
        } finally {
            setGenerating(false);
        }
    }

    async function handleDownloadAgain(entry) {
        if (combinedView) return;
        setRegeneratingId(entry.id);
        try {
            const result = await requestAuditPdf(entry.fromDate, entry.toDate);
            if (!result.ok) {
                if (result.error) window.alert("Failed to download: " + result.error);
                return;
            }
            downloadBlob(
                result.blob,
                `Consent_Audit_${entry.domain}_${entry.fromDate}_to_${entry.toDate}.pdf`
            );
        } catch {
            window.alert("An error occurred while downloading.");
        } finally {
            setRegeneratingId(null);
        }
    }

    function handleRemove(entryId) {
        if (!window.confirm("Remove this entry from your saved list? (The PDF file is not stored on our servers in this version.)")) {
            return;
        }
        const next = removeAuditReportEntry(orgId, currentDomain, entryId);
        setReports(next);
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: 1 }}>
                <StickyPageTitle
                    loadingUpdated={false}
                    finalLoaded={true}
                    title="Audit reports"
                    url={url}
                    method={method}
                    header={header}
                    numberofDays={setLastDays}
                    getLastDays={getLastDays}
                    setActiveData={setActiveData}
                    fromDate={fromDate}
                    toDate={toDate}
                    setFromDate={setFromDate}
                    setToDate={setToDate}
                    previousPeriod={previousPeriod}
                    previousPeriod2={previousPeriod2}
                />
                <div className="dashboard-content audit-reports-page">
                    <header className="audit-reports-hero">
                        <h1>Audit reports</h1>
                        <p>
                            Generate consent audit PDFs for the <strong>selected domain</strong>, keep a local list of runs
                            (period and download again), and search past entries. Storage is in your browser until a server
                            index is connected.
                        </p>
                    </header>

                    {combinedView ? (
                        <div className="audit-reports-banner" role="status">
                            Choose a <strong>single domain</strong> from the domain selector (not &quot;combined view&quot;)
                            to create and list audit reports for that property.
                        </div>
                    ) : (
                        <div className="audit-reports-banner" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.2)" }}>
                            Showing reports for <strong>{currentDomain}</strong>. Dates below follow the sticky period controls
                            or adjust and generate.
                        </div>
                    )}

                    <section className="audit-reports-create" aria-labelledby="audit-create-heading">
                        <h2 id="audit-create-heading">New report</h2>
                        <p>
                            Uses the same PDF export as portfolio audit: current domain only,{" "}
                            <code style={{ color: "rgba(192,159,83,0.9)" }}>reportType: portfolio_audit</code>.
                        </p>
                        <div className="audit-reports-create-row">
                            <div className="audit-reports-date-field">
                                <span>From</span>
                                <input
                                    type="date"
                                    value={toYmd(fromDate)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) setFromDate(new Date(v + "T12:00:00"));
                                    }}
                                />
                            </div>
                            <div className="audit-reports-date-field">
                                <span>To</span>
                                <input
                                    type="date"
                                    value={toYmd(toDate)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) setToDate(new Date(v + "T12:00:00"));
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                className="audit-reports-btn audit-reports-btn--primary"
                                disabled={generating || combinedView}
                                onClick={handleGenerateNew}
                            >
                                {generating ? "Generating…" : "Generate & download PDF"}
                            </button>
                        </div>
                    </section>

                    <div className="audit-reports-toolbar">
                        <label className="sr-only" htmlFor="audit-reports-search">
                            Search reports
                        </label>
                        <input
                            id="audit-reports-search"
                            className="audit-reports-search"
                            type="search"
                            placeholder="Search by date, title, or period…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            disabled={combinedView}
                        />
                        <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>
                            {combinedView ? "—" : `${filteredReports.length} of ${reports.length} saved`}
                        </span>
                    </div>

                    {combinedView ? (
                        <div className="audit-reports-empty">Select a domain to see saved audit runs.</div>
                    ) : filteredReports.length === 0 ? (
                        <div className="audit-reports-empty">
                            {reports.length === 0
                                ? "No saved runs yet. Generate a PDF above to add one to this list."
                                : "No reports match your search."}
                        </div>
                    ) : (
                        <div className="audit-reports-table-wrap">
                            <table className="audit-reports-table">
                                <thead>
                                    <tr>
                                        <th>Generated</th>
                                        <th>Period</th>
                                        <th>Type</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredReports.map((r) => (
                                        <tr key={r.id}>
                                            <td>{formatDisplayDate(r.createdAt)}</td>
                                            <td>
                                                {formatDisplayDate(r.fromDate)} – {formatDisplayDate(r.toDate)}
                                            </td>
                                            <td>{r.reportType === "portfolio_audit" ? "Portfolio audit" : r.reportType || "—"}</td>
                                            <td>
                                                <div className="audit-reports-table-actions">
                                                    <button
                                                        type="button"
                                                        className="audit-reports-btn audit-reports-btn--ghost"
                                                        disabled={regeneratingId === r.id}
                                                        onClick={() => handleDownloadAgain(r)}
                                                    >
                                                        {regeneratingId === r.id ? "Downloading…" : "Download again"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="audit-reports-btn audit-reports-btn--danger"
                                                        onClick={() => handleRemove(r.id)}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p className="audit-reports-meta">
                        Entries are stored in <strong>localStorage</strong> for this browser and organisation. To list reports
                        across devices or retain files centrally, add API endpoints and swap the storage layer in{" "}
                        <code>auditReportsStorage.js</code>.
                    </p>
                </div>
            </article>
        </>
    );
}
