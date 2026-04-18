const { useState, useEffect, useMemo, useContext, useCallback } = React;
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { defaultCompareWindowForPrimary } from "../../../components/Filter/filterDatePresets.js";
import { reportsLinks } from "../Reports";
import { DomainContext } from "../../../App.js";
import API from "../../../API/api";
import "../../Dashboard/Style.css";
import "./MarketingReport.css";
import {
    useSyncDomainFromRoute,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../../Functions/domainPathSegments.js";

const useParams = window.ReactRouterDOM.useParams;

function toYmd(d) {
    if (!d) return "";
    try {
        if (typeof d === "string") return d.split("T")[0];
        return d.toISOString().split("T")[0];
    } catch {
        return "";
    }
}

/** Accept several possible API shapes */
function extractRows(payload) {
    if (payload == null) return [];
    const root = payload.data != null ? payload.data : payload;
    if (Array.isArray(root)) return root;
    if (Array.isArray(root.rows)) return root.rows;
    if (Array.isArray(root.campaigns)) return root.campaigns;
    if (Array.isArray(root.items)) return root.items;
    if (Array.isArray(root.attribution)) return root.attribution;
    return [];
}

function extractSummary(payload) {
    if (payload == null) return null;
    const root = payload.data != null ? payload.data : payload;
    if (root && typeof root === "object" && root.summary && typeof root.summary === "object") return root.summary;
    if (root && typeof root === "object" && root.totals && typeof root.totals === "object") return root.totals;
    return null;
}

function mapRow(r) {
    const ref =
        r.referrerHost ??
        r.referrer_host ??
        r.referrer ??
        r.referrerUrl ??
        r.referrer_url ??
        (r.referrerDomain != null ? String(r.referrerDomain) : "—");
    return {
        referrer: ref === "" || ref == null ? "—" : String(ref),
        utmSource: String(r.utm_source ?? r.utmSource ?? r.source ?? "—"),
        utmMedium: String(r.utm_medium ?? r.utmMedium ?? r.medium ?? "—"),
        utmCampaign: String(r.utm_campaign ?? r.utmCampaign ?? r.campaign ?? "—"),
        consents: Number(r.consents ?? r.consent_count ?? r.count ?? r.total ?? 0) || 0,
        acceptPct:
            r.acceptRate != null
                ? Number(r.acceptRate)
                : r.accepted_pct != null
                  ? Number(r.accepted_pct)
                  : r.accept_pct != null
                    ? Number(r.accept_pct)
                    : null,
    };
}

export default function MarketingReport() {
    document.title = "Marketing attribution | Reports | Intastellar Consents";
    const [currentDomain, setGlobalDomain] = useContext(DomainContext);
    const { id, handle } = useParams();
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const settings = (() => {
        try {
            return JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
        } catch {
            return { dateRange: 30 };
        }
    })();

    const today = new Date();
    const initialLastDays =
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - (settings?.dateRange ?? 30)))
    );
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [, setActiveData] = useState(null);
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - (settings?.dateRange ?? 30))),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - (settings?.dateRange ?? 30))),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).end
    );

    const listDomainLabel = useMemo(
        () => consentsDomainFromRoute(handle, currentDomain),
        [handle, currentDomain]
    );
    const domainsApiHeader = useMemo(() => toDomainsApiHeader(listDomainLabel), [listDomainLabel]);

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const endpoint = API[id]?.marketingAttribution;

    const fetchReport = useCallback(async () => {
        if (!endpoint?.url) {
            setError("Marketing attribution is not configured for this platform.");
            setRows([]);
            setSummary(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const headers = {
                ...endpoint.headers,
                Domains: domainsApiHeader,
                FromDate: toYmd(fromDate),
                ToDate: toYmd(toDate),
            };
            if (compareRange !== 0 && compareRange != null) {
                headers.CompareRange =
                    compareRange === "Same period last year" ? "Same period last year" : String(compareRange);
                headers.PreviousPeriod = toYmd(previousPeriod);
                headers.PreviousPeriod2 = toYmd(previousPeriod2);
                headers["X-Compare-Start"] = toYmd(previousPeriod);
                headers["X-Compare-End"] = toYmd(previousPeriod2);
                headers["X-Compare-Range"] =
                    compareRange === "Same period last year" ? "Same period last year" : String(compareRange);
            } else {
                headers.CompareRange = "";
                headers["X-Compare-Range"] = "";
            }

            const res = await fetch(endpoint.url, {
                method: endpoint.method || "GET",
                headers,
            });
            const text = await res.text();
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                setError("The server returned a non-JSON response.");
                setRows([]);
                setSummary(null);
                return;
            }
            if (!res.ok) {
                setError(json?.message || `Request failed (${res.status}).`);
                setRows([]);
                setSummary(null);
                return;
            }
            if (json === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            const rawRows = extractRows(json);
            setRows(rawRows.map(mapRow).sort((a, b) => b.consents - a.consents));
            setSummary(extractSummary(json));
        } catch (e) {
            setError(e?.message || "Network error while loading marketing attribution.");
            setRows([]);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, [
        endpoint,
        domainsApiHeader,
        fromDate,
        toDate,
        compareRange,
        previousPeriod,
        previousPeriod2,
    ]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const totalConsents = useMemo(() => rows.reduce((s, r) => s + r.consents, 0), [rows]);

    const kpiCards = useMemo(() => {
        const cards = [
            {
                label: "Attributed rows",
                value: rows.length.toLocaleString("de-DE"),
            },
            {
                label: "Consents in view",
                value: totalConsents.toLocaleString("de-DE"),
            },
        ];
        if (summary && typeof summary === "object") {
            if (summary.sessionsWithMarketingParams != null) {
                cards.push({
                    label: "Sessions w/ marketing params",
                    value: String(summary.sessionsWithMarketingParams),
                });
            }
            if (summary.distinctCampaigns != null) {
                cards.push({
                    label: "Distinct campaigns",
                    value: String(summary.distinctCampaigns),
                });
            }
        }
        return cards;
    }, [rows.length, totalConsents, summary]);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <div>
                <StickyPageTitle
                    loadingUpdated={loading}
                    finalLoaded={!loading}
                    title="Marketing attribution"
                    numberofDays={setLastDays}
                    getLastDays={getLastDays}
                    setActiveData={setActiveData}
                    fromDate={fromDate}
                    toDate={toDate}
                    setFromDate={setFromDate}
                    setToDate={setToDate}
                    previousPeriod={previousPeriod}
                    previousPeriod2={previousPeriod2}
                    compareRange={compareRange}
                    setCompareRange={setCompareRange}
                    setCompareWindowStart={setPreviousPeriod}
                    setCompareWindowEnd={setPreviousPeriod2}
                />
                <div className="dashboard-content marketing-report-page">
                    <header className="marketing-report-hero">
                        <h1>Marketing attribution</h1>
                        <p>
                            Consent activity broken down by <strong>referrer</strong> and{" "}
                            <strong>UTM / marketing query parameters</strong> on the landing URL. Use the date range
                            (and optional comparison) in the header to align with your backend filters.
                        </p>
                    </header>

                    <div className="marketing-report-banner" role="note">
                        Backend contract: <code>GET …/analytics/gdpr/marketingAttribution</code> with the same auth
                        headers as other GDPR reports, plus <code>Domains</code>, <code>FromDate</code>,{" "}
                        <code>ToDate</code>. Response should include <code>data.rows</code> (array) or{" "}
                        <code>data.campaigns</code>, and optional <code>data.summary</code>.
                    </div>

                    {error ? (
                        <div className="marketing-report-error" role="alert">
                            {error}
                            <pre className="marketing-report-code">
                                {`Example row: { "referrerHost": "facebook.com", "utm_source": "fb", "utm_medium": "paid", "utm_campaign": "spring", "consents": 120, "acceptRate": 72.5 }`}
                            </pre>
                        </div>
                    ) : null}

                    <div className="marketing-report-summary">
                        {kpiCards.map((c) => (
                            <div key={c.label} className="marketing-report-kpi">
                                <span className="marketing-report-kpi__label">{c.label}</span>
                                <span className="marketing-report-kpi__value">{c.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="marketing-report-toolbar">
                        <span className="marketing-report-toolbar__meta">
                            {loading ? "Loading…" : `${rows.length} row${rows.length === 1 ? "" : "s"} · ${totalConsents.toLocaleString("de-DE")} consents`}
                        </span>
                    </div>

                    <div className="marketing-report-table-wrap">
                        {rows.length === 0 && !loading ? (
                            <div className="marketing-report-empty">
                                No attribution rows for this scope and period. When your API returns data, it will appear
                                here.
                            </div>
                        ) : (
                            <table className="marketing-report-table">
                                <thead>
                                    <tr>
                                        <th>Referrer</th>
                                        <th>UTM source</th>
                                        <th>UTM medium</th>
                                        <th>UTM campaign</th>
                                        <th>Consents</th>
                                        <th>Accept %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => (
                                        <tr key={`${r.referrer}-${r.utmCampaign}-${r.utmSource}-${i}`}>
                                            <td>{r.referrer}</td>
                                            <td>{r.utmSource}</td>
                                            <td>{r.utmMedium}</td>
                                            <td>{r.utmCampaign}</td>
                                            <td>{r.consents.toLocaleString("de-DE")}</td>
                                            <td>
                                                {r.acceptPct != null && Number.isFinite(r.acceptPct)
                                                    ? `${r.acceptPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
