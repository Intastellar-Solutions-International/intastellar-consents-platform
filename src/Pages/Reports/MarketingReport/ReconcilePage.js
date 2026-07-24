const { useState, useEffect, useMemo, useContext, useCallback } = React;
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks } from "../Reports";
import { DomainContext } from "../../../App.js";
import API from "../../../API/api";
import "../../Dashboard/Style.css";
import "./MarketingReport.css";
import {
    useSyncDomainFromRoute,
    consentsDomainFromRoute,
    toDomainsApiHeader,
    reportsPath,
} from "../../../Functions/domainPathSegments.js";
import MarketingReconciliationPanel from "./MarketingReconciliationPanel.js";
import appStorage from "../../../Functions/storage.js";

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
    if (root && typeof root === "object" && root.summary) return root.summary;
    if (root && typeof root === "object" && root.totals) return root.totals;
    return null;
}

function pickFromSummaryOrRows(summary, rows, summaryField, rowField) {
    const v = summary?.[summaryField] != null ? Number(summary[summaryField]) : NaN;
    if (Number.isFinite(v) && v >= 0) return v;
    return rows.reduce((s, r) => s + (Number(r[rowField]) || 0), 0);
}

export default function ReconcilePage() {
    document.title = "Ad Reconciliation | Reports | Intastellar Consents";
    const [currentDomain, setGlobalDomain] = useContext(DomainContext);
    const { id, handle } = useParams();
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const settings = (() => {
        try { return JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 }; }
        catch { return { dateRange: 30 }; }
    })();

    const today = new Date();
    const initialLastDays = settings?.dateRange ?? 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - initialLastDays))
    );
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [, setActiveData] = useState(null);
    const [selectedChannel, setSelectedChannel] = useState(null);

    const listDomainLabel = useMemo(
        () => consentsDomainFromRoute(handle, currentDomain),
        [handle, currentDomain]
    );
    const domainsApiHeader = useMemo(
        () => toDomainsApiHeader(listDomainLabel),
        [listDomainLabel]
    );

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const endpoint = API[id]?.marketingAttribution;

    const fetchData = useCallback(async () => {
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
                CompareRange: "",
                PreviousPeriod: "",
                PreviousPeriod2: "",
                "X-Compare-Start": "",
                "X-Compare-End": "",
                "X-Compare-Range": "",
            };
            const res = await fetch(endpoint.url, { method: endpoint.method || "GET", headers });
            const text = await res.text();
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch {
                setError("The server returned a non-JSON response.");
                setLoading(false);
                return;
            }
            if (json === "Err_Login_Expired") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (!res.ok) {
                setError(json?.message || `Request failed (${res.status}).`);
                setLoading(false);
                return;
            }
            setRows(extractRows(json));
            setSummary(extractSummary(json));
        } catch (err) {
            setError(err.message || "Network error.");
        } finally {
            setLoading(false);
        }
    }, [endpoint, domainsApiHeader, fromDate, toDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const channels = useMemo(
        () => [...new Set(rows.map(r => r.channel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [rows]
    );

    // Reset channel selection when the channel disappears from the loaded data
    useEffect(() => {
        if (selectedChannel && channels.length > 0 && !channels.includes(selectedChannel)) {
            setSelectedChannel(null);
        }
    }, [channels, selectedChannel]);

    const drilldownRows = useMemo(
        () => selectedChannel ? rows.filter(r => r.channel === selectedChannel) : [],
        [rows, selectedChannel]
    );

    const totalConsents = useMemo(
        () => pickFromSummaryOrRows(summary, rows, "totalConsents", "consents"),
        [summary, rows]
    );
    const measurementReadyCount = useMemo(
        () => selectedChannel
            ? drilldownRows.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0)
            : pickFromSummaryOrRows(summary, rows, "measurementReadyConsents", "acceptAll"),
        [selectedChannel, drilldownRows, summary, rows]
    );
    const visibilityScopeTotal = selectedChannel
        ? drilldownRows.reduce((s, r) => s + (Number(r.consents) || 0), 0)
        : totalConsents;
    const invisibleConsents = Math.max(0, visibilityScopeTotal - measurementReadyCount);

    const channelAnalyticsPath = reportsPath(id, listDomainLabel, "/marketing");

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <div style={{ flex: "1" }}>
                <StickyPageTitle
                    loadingUpdated={loading}
                    finalLoaded={loading}
                    title="Ad Reconciliation"
                    numberofDays={setLastDays}
                    getLastDays={getLastDays}
                    setActiveData={setActiveData}
                    fromDate={fromDate}
                    toDate={toDate}
                    setFromDate={setFromDate}
                    setToDate={setToDate}
                />
                <div className="dashboard-content marketing-report-page">
                    <header className="marketing-report-hero">
                        <h1>Ad Reconciliation</h1>
                        <p className="marketing-report-hero__lede">
                            Paste in the click or session count from your ad platform and see how
                            much of that traffic will actually surface in your analytics tools — and
                            what falls into the invisible gap. Use the same date range as the header
                            filter. Need channel analytics?{" "}
                            <a href={channelAnalyticsPath} className="marketing-reconciliation-page__back-link">
                                Back to Channel Analytics
                            </a>
                        </p>
                    </header>

                    {error ? (
                        <p className="marketing-report-error">{error}</p>
                    ) : !loading && rows.length === 0 ? (
                        <p className="marketing-report-empty">
                            No marketing attribution data found for this period and domain.
                        </p>
                    ) : (
                        <>
                            {channels.length > 1 ? (
                                <div className="marketing-reconciliation-page__channel-filter">
                                    <label className="marketing-reconciliation-page__channel-label">
                                        Filter by channel
                                        <select
                                            value={selectedChannel || ""}
                                            onChange={e => setSelectedChannel(e.target.value || null)}
                                            className="marketing-reconciliation__select"
                                        >
                                            <option value="">All channels</option>
                                            {channels.map(ch => (
                                                <option key={ch} value={ch}>{ch}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            ) : null}

                            <MarketingReconciliationPanel
                                scopeLabel={selectedChannel || "all channels"}
                                scopeKey={selectedChannel ? `channel:${selectedChannel}` : "overview"}
                                domainKey={listDomainLabel}
                                consents={visibilityScopeTotal}
                                visibleConsents={measurementReadyCount}
                                invisibleConsents={invisibleConsents}
                                scopeRows={selectedChannel ? drilldownRows : rows}
                                fromDate={toYmd(fromDate)}
                                toDate={toYmd(toDate)}
                            />
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
