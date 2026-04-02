const { useState, useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky";
import API from "../../API/api";
const useParams = window.ReactRouterDOM.useParams;
import Fetch from "../../Functions/fetch";
import "../Dashboard/Style.css";
import "./Style.css";

const SLOT_COUNT = 5;

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

function primaryDevice(deviceType) {
    const num = deviceType?.deviceTypeNum;
    if (!num || typeof num !== "object") return { key: null, label: "—", pct: "" };
    const keys = Object.keys(num);
    if (!keys.length) return { key: null, label: "—", pct: "" };
    const best = keys.reduce((a, b) => (Number(num[a]) > Number(num[b]) ? a : b));
    return { key: best, label: best, pct: num[best] };
}

export default function Compare({ organisations: _organisations, domains }) {
    document.title = "Portfolio Benchmark | Intastellar Consents | CMP";
    const { id } = useParams();
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));
    const [activeData, setActiveData] = useState(null);
    const [getLastDays, setLastDays] = useState(
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30
    );
    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));

    const [loading, setLoading] = useState(false);
    const [loadingCountry, setLoadingCountry] = useState(false);
    const [loadingExport, setLoadingExport] = useState(false);

    const [comparisonData, setComparisonData] = useState(null);
    const [domainSlots, setDomainSlots] = useState(() => Array(SLOT_COUNT).fill(""));

    const domainList = useMemo(
        () => (domains || []).filter((d) => d?.domain && d.domain !== "combined view"),
        [domains]
    );

    const comparisonDomains = useMemo(() => domainSlots.filter(Boolean), [domainSlots]);

    function setDomainSlot(index, value) {
        const v = value || "";
        setDomainSlots((prev) => {
            const next = [...prev];
            if (v) {
                for (let j = 0; j < next.length; j++) {
                    if (j !== index && next[j] === v) next[j] = "";
                }
            }
            next[index] = v;
            return next;
        });
    }

    function removeSelectedDomain(domain) {
        setDomainSlots((prev) => {
            const next = [...prev];
            const idx = next.indexOf(domain);
            if (idx !== -1) next[idx] = "";
            return next;
        });
    }

    async function handlePDFEExport() {
        setLoadingExport(true);
        API[id].exportPDF.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].exportPDF.headers.ToDate = toDate.toISOString().split("T")[0];

        try {
            const response = await fetch(API[id].exportPDF.url, {
                method: API[id].exportPDF.method,
                headers: {
                    ...API[id].exportPDF.headers,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    domains: comparisonDomains,
                    reportType: "portfolio_audit",
                }),
            });
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (response.headers.get("content-type")?.includes("application/pdf")) {
                const blob = await response.blob();
                downloadBlob(
                    blob,
                    `Consent_Audit_Report_${fromDate.toISOString().split("T")[0]}_to_${toDate.toISOString().split("T")[0]}.pdf`
                );
            } else {
                const data = await response.json();
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                alert("Failed to generate PDF: " + (data?.error || JSON.stringify(data)));
            }
        } catch {
            alert("An error occurred while exporting the PDF.");
        } finally {
            setLoadingExport(false);
        }
    }

    function handleDomainCompare() {
        if (comparisonDomains.length === 0) return;

        setLoading(true);

        API[id].compareDomains.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].compareDomains.headers.ToDate = toDate.toISOString().split("T")[0];

        Fetch(
            API[id].compareDomains.url,
            API[id].compareDomains.method,
            API[id].compareDomains.headers,
            JSON.stringify({ domains: comparisonDomains })
        )
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setActiveData(data);
                setComparisonData(data);
            })
            .catch(() => {
                setActiveData(null);
                setComparisonData(null);
            })
            .finally(() => {
                setLoading(false);
            });
    }

    const url = API[id].getInteractions.url;
    const method = API[id].getInteractions.method;
    const header = API[id].getInteractions.headers;

    const cardCount = comparisonData?.length ? Math.min(comparisonData.length, SLOT_COUNT) : 1;

    return (
        <>
            <StickyPageTitle
                loadingUpdated={loading}
                finalLoaded={loadingCountry}
                title="Portfolio Benchmark"
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
            <div className="dashboard-content compare-page">
                <header className="compare-hero">
                    <h1 className="compare-hero__title">Portfolio benchmark</h1>
                    <p className="compare-hero__lead">
                        Compare consent performance across domains for the selected period. Select up to five properties,
                        then run the comparison.
                    </p>
                    <p className="compare-hero__note">You can compare up to five domains at a time.</p>
                </header>

                <section className="compare-panel" aria-labelledby="compare-select-heading">
                    <h2 id="compare-select-heading" className="compare-panel__title">
                        Domains to compare
                    </h2>
                    <div className="compare-slots">
                        {Array.from({ length: SLOT_COUNT }, (_, i) => (
                            <label key={i} className="compare-slot">
                                <span className="compare-slot__label">Domain {i + 1}</span>
                                <select
                                    className="compare-slot__select"
                                    value={domainSlots[i]}
                                    onChange={(e) => setDomainSlot(i, e.target.value)}
                                >
                                    <option value="">Choose domain…</option>
                                    {domainList.map((d) => {
                                        const takenElsewhere = domainSlots.some((x, j) => j !== i && x === d.domain);
                                        return (
                                            <option key={d.domain} value={d.domain} disabled={takenElsewhere}>
                                                {d.domain}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>
                        ))}
                    </div>
                    {comparisonDomains.length > 0 ? (
                        <div className="compare-chips" aria-live="polite">
                            <span className="compare-chips__label">Selected</span>
                            {comparisonDomains.map((d) => (
                                <span key={d} className="compare-chip">
                                    <span className="compare-chip__name">{d}</span>
                                    <button
                                        type="button"
                                        className="compare-chip__remove"
                                        onClick={() => removeSelectedDomain(d)}
                                        aria-label={`Remove ${d} from comparison`}
                                    >
                                        <span aria-hidden="true">×</span>
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <div className="compare-actions">
                        <button
                            type="button"
                            className="compare-btn compare-btn--primary"
                            disabled={loading || domainList.length < 1 || comparisonDomains.length < 1}
                            onClick={handleDomainCompare}
                        >
                            {loading ? "Comparing…" : "Run comparison"}
                        </button>
                    </div>
                </section>

                <section className="compare-results" aria-labelledby="compare-results-heading">
                    <div className="compare-results__head">
                        <h2 id="compare-results-heading" className="compare-results__title">
                            Results
                        </h2>
                        <button
                            type="button"
                            className="compare-btn compare-btn--secondary compare-btn--with-icon"
                            disabled={!comparisonData?.length || loadingExport}
                            onClick={handlePDFEExport}
                        >
                            <svg
                                className="compare-btn__icon"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                <path
                                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M14 2v6h6"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M12 11v7M9 15l3 3 3-3"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <span>{loadingExport ? "Exporting…" : "Export audit report (PDF)"}</span>
                        </button>
                    </div>

                    {comparisonData?.length > 0 ? (
                        <div className="compare-body">
                            <h3 className="compare-section-title">Acceptance overview</h3>
                            <div
                                className="compare-summary-grid"
                                style={{ gridTemplateColumns: `repeat(${cardCount}, minmax(0, 1fr))` }}
                            >
                                {comparisonData.map((domain, index) => (
                                    <article key={domain.name || index} className="compare-card">
                                        <div className="compare-card__accent" aria-hidden />
                                        <header className="compare-card__head">
                                            <h3 className="compare-card__name">{domain.name}</h3>
                                            <p className="compare-card__total">
                                                {Intl.NumberFormat("de-DE").format(domain.Total)} interactions
                                            </p>
                                            <p className="compare-card__meta">Banner: {domain.style ?? "—"}</p>
                                        </header>
                                        <dl className="compare-card__stats">
                                            {[
                                                ["Accepted", domain.Accepted],
                                                ["Declined", domain.Declined],
                                                ["Functional", domain.Functional],
                                                ["Marketing", domain.Marketing],
                                                ["Statistics", domain.Statics],
                                            ].map(([label, val]) => (
                                                <div key={label} className="compare-stat">
                                                    <dt>{label}</dt>
                                                    <dd className={Number(val) >= 50 ? "compare-stat--strong" : ""}>
                                                        {val}%
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </article>
                                ))}
                            </div>

                            <h3 className="compare-section-title">Detailed comparison</h3>
                            <div className="compare-table-wrap">
                                <table className="compare-table">
                                    <thead>
                                        <tr>
                                            <th>Domain</th>
                                            <th>Total</th>
                                            <th>Accepted</th>
                                            <th>Declined</th>
                                            <th>Marketing</th>
                                            <th>Functional</th>
                                            <th>Statistics</th>
                                            <th>Primary device</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {comparisonData.map((domain, index) => {
                                            const dev = primaryDevice(domain.device_type);
                                            return (
                                                <tr key={domain.name || index}>
                                                    <td className="compare-table__domain">{domain.name}</td>
                                                    <td>{Intl.NumberFormat("de-DE").format(domain.Total)}</td>
                                                    <td>
                                                        <span className="compare-pill compare-pill--pos">{domain.Accepted}%</span>
                                                    </td>
                                                    <td>
                                                        <span className="compare-pill compare-pill--neg">{domain.Declined}%</span>
                                                    </td>
                                                    <td>{domain.Marketing}%</td>
                                                    <td>{domain.Functional}%</td>
                                                    <td>{domain.Statics}%</td>
                                                    <td>
                                                        {dev.key
                                                            ? `${dev.label} (${dev.pct}%)`
                                                            : "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="compare-section-title">Device mix</h3>
                            <div
                                className="compare-device-grid"
                                style={{
                                    gridTemplateColumns: `repeat(${Math.min(comparisonData.length, SLOT_COUNT)}, minmax(0, 1fr))`,
                                }}
                            >
                                {comparisonData.map((domain, index) => {
                                    const m = domain.device_type?.deviceTypeNum?.mobile ?? 0;
                                    const t = domain.device_type?.deviceTypeNum?.tablet ?? 0;
                                    const desk = domain.device_type?.deviceTypeNum?.desktop ?? 0;
                                    return (
                                        <div key={domain.name || index} className="compare-device-card">
                                            <h4 className="compare-device-card__title">{domain.name}</h4>
                                            <div className="compare-device-bar" role="img" aria-label={`Device mix for ${domain.name}`}>
                                                <div
                                                    className="compare-device-bar__seg compare-device-bar__seg--mobile"
                                                    style={{ width: `${m}%` }}
                                                />
                                                <div
                                                    className="compare-device-bar__seg compare-device-bar__seg--tablet"
                                                    style={{ width: `${t}%` }}
                                                />
                                                <div
                                                    className="compare-device-bar__seg compare-device-bar__seg--desktop"
                                                    style={{ width: `${desk}%` }}
                                                />
                                            </div>
                                            <ul className="compare-device-legend">
                                                <li>
                                                    <span className="compare-device-legend__swatch compare-device-bar__seg--mobile" />{" "}
                                                    Mobile {m}%
                                                </li>
                                                <li>
                                                    <span className="compare-device-legend__swatch compare-device-bar__seg--tablet" />{" "}
                                                    Tablet {t}%
                                                </li>
                                                <li>
                                                    <span className="compare-device-legend__swatch compare-device-bar__seg--desktop" />{" "}
                                                    Desktop {desk}%
                                                </li>
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>

                            <h3 className="compare-section-title">Raw interaction counts</h3>
                            <div className="compare-interaction-grid">
                                {comparisonData.map((domain, index) => (
                                    <div key={domain.name || index} className="compare-interaction-card">
                                        <h4>{domain.name}</h4>
                                        <ul className="compare-interaction-list">
                                            {[
                                                ["Accepted", domain.interactions_number?.accept],
                                                ["Declined", domain.interactions_number?.decline],
                                                ["Marketing", domain.interactions_number?.marketing],
                                                ["Functional", domain.interactions_number?.functional],
                                                ["Statistics", domain.interactions_number?.statics],
                                            ].map(([label, n]) => (
                                                <li key={label}>
                                                    <span>{label}</span>
                                                    <span>{n != null ? Intl.NumberFormat("de-DE").format(n) : "—"}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="compare-empty">
                            <p>No comparison yet. Choose one or more domains and select <strong>Run comparison</strong>.</p>
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}