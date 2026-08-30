const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import {
    useAnalyticsPageChrome, authHeaders, KpiCard, MiniBar, formatPercent,
} from "./_shared.js";
import { IconFormFill, IconBarChart, IconTarget, IconScrollDepth } from "./Icons.js";
import TrendLineChart from "./TrendLineChart.js";
import "./Analytics.css";

function useFormsReport(domain, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/analytics-forms?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!ignore) setData(d); })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso]);

    return { data, loading };
}

function cleanFormId(id) {
    if (!id || id === "unknown") return "unknown";
    return id;
}

// Reads extra_data.formClass and returns the first meaningful class token as
// ".className" if the formId itself looks like a bare fallback (path or "form").
function formClassBadge(formId, formClass) {
    if (!formClass) return null;
    const firstClass = formClass.trim().split(/\s+/)[0];
    if (!firstClass) return null;
    // Only show the class badge when the formId isn't already a clear HTML id/name
    const looksLikeFallback = !formId || formId === "form" || formId === "unknown" || formId.startsWith("/");
    if (!looksLikeFallback) return null;
    return "." + firstClass;
}

// Maps an "HTTP N" message string to a short human-readable description.
// Returns null when the message isn't an HTTP status pattern.
function httpCodeDesc(message) {
    if (!message) return null;
    const m = message.match(/^HTTP\s+(\d+)$/);
    if (!m) return null;
    const code = parseInt(m[1], 10);
    if (code === 0)   return "No response — network failure, CORS block, or offline";
    if (code === 400) return "Bad request";
    if (code === 401) return "Unauthorized";
    if (code === 403) return "Forbidden";
    if (code === 404) return "Not found";
    if (code === 405) return "Method not allowed";
    if (code === 408) return "Request timeout";
    if (code === 410) return "Gone — endpoint removed or redirect missing";
    if (code === 413) return "Payload too large";
    if (code === 422) return "Unprocessable entity";
    if (code === 429) return "Rate limit — too many requests";
    if (code === 500) return "Internal server error";
    if (code === 502) return "Bad gateway";
    if (code === 503) return "Service unavailable";
    if (code === 504) return "Gateway timeout";
    if (code >= 400 && code < 500) return "Client error";
    if (code >= 500) return "Server error";
    return null;
}

function FormsTable({ forms, abandonMap }) {
    const maxSubs = useMemo(() => Math.max(...(forms || []).map(f => f.submissions), 1), [forms]);

    if (!forms || !forms.length) {
        return <p className="sa-notice">No form submissions in this period.</p>;
    }
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th className="sa-table__num">Submissions</th>
                    <th className="sa-table__num">Completion</th>
                    <th className="sa-table__num">Abandoned</th>
                    <th className="sa-table__num">Pages</th>
                    <th>Top page</th>
                </tr>
            </thead>
            <tbody>
                {forms.map(f => {
                    const rate = f.completionRate;
                    const rateColor = rate == null ? undefined
                        : rate < 30 ? "rgba(239,68,68,0.9)"
                        : rate < 60 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    const ab = abandonMap?.[f.formId];
                    const abRate = ab?.abandonmentRate;
                    const abColor = abRate == null ? undefined
                        : abRate > 70 ? "rgba(239,68,68,0.9)"
                        : abRate > 40 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    return (
                        <tr key={f.formId}>
                            <td>
                                <span className="sa-form-id" title={f.formId}>{cleanFormId(f.formId)}</span>
                                {f.formAction && f.formAction !== cleanFormId(f.formId) && (
                                    <span className="sa-form-action" title={f.formAction}>
                                        {f.formAction.length > 40 ? f.formAction.slice(0, 40) + "…" : f.formAction}
                                    </span>
                                )}
                                <MiniBar value={f.submissions} max={maxSubs} color="rgba(99,102,241,0.5)" />
                            </td>
                            <td className="sa-table__num">{f.submissions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                            <td className="sa-table__num" style={abColor ? { color: abColor, fontWeight: 600 } : {}}>
                                {abRate != null ? formatPercent(abRate, 1) : "—"}
                            </td>
                            <td className="sa-table__num">{f.pageCount}</td>
                            <td className="sa-table__page" title={f.topPage || ""}>
                                {f.topPage
                                    ? (f.topPage.length > 50 ? "…" + f.topPage.slice(-47) : f.topPage)
                                    : "—"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

function DeviceTable({ devices }) {
    if (!devices || !devices.length) return <p className="sa-notice">No device data available.</p>;
    const DEVICE_LABEL = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", unknown: "Unknown" };
    return (
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Device</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Submitted</th>
                    <th className="sa-table__num">Completion</th>
                </tr>
            </thead>
            <tbody>
                {devices.map(d => {
                    const rate = d.completionRate;
                    const rateColor = rate == null ? undefined
                        : rate < 30 ? "rgba(239,68,68,0.9)"
                        : rate < 60 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    return (
                        <tr key={d.device}>
                            <td>{DEVICE_LABEL[d.device] || d.device}</td>
                            <td className="sa-table__num">{d.started > 0 ? d.started.toLocaleString("de-DE") : "—"}</td>
                            <td className="sa-table__num">{d.submitted.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function AbandonmentTable({ abandonment }) {
    if (!abandonment || !abandonment.length) {
        return <p className="sa-notice">No abandoned sessions detected, or session tracking requires full consent.</p>;
    }
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Abandoned</th>
                    <th className="sa-table__num">Rate</th>
                    <th>Dropout field</th>
                    <th className="sa-table__num">Avg fields</th>
                </tr>
            </thead>
            <tbody>
                {abandonment.map((r, i) => {
                    const rate = r.abandonmentRate;
                    const rateColor = rate == null ? undefined
                        : rate > 70 ? "rgba(239,68,68,0.9)"
                        : rate > 40 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    const fieldInfo = r.totalFields != null
                        ? `${r.avgFieldsTouched != null ? r.avgFieldsTouched : "?"} / ${r.totalFields}`
                        : r.avgFieldsTouched != null ? r.avgFieldsTouched : "—";
                    return (
                        <tr key={`${r.formId}-${i}`}>
                            <td><span className="sa-form-id" title={r.formId}>{cleanFormId(r.formId)}</span></td>
                            <td className="sa-table__num">{(r.totalStarted ?? 0).toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{(r.abandonedSessions ?? 0).toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                            <td>
                                {r.topDropoutField
                                    ? <code className="sa-field-name">{r.topDropoutField}</code>
                                    : <span className="sa-muted">—</span>}
                            </td>
                            <td className="sa-table__num sa-muted">{fieldInfo}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

function FieldErrorTable({ fieldErrors }) {
    if (!fieldErrors || !fieldErrors.length) {
        return <p className="sa-notice">No field-level validation errors recorded yet.</p>;
    }
    const maxDropout = Math.max(...fieldErrors.map(r => r.dropoutSessions), 1);
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th>Field</th>
                    <th className="sa-table__num">Error sessions</th>
                    <th className="sa-table__num">Dropped off</th>
                    <th className="sa-table__num">Blocking</th>
                </tr>
            </thead>
            <tbody>
                {fieldErrors.map((r, i) => {
                    const rate = r.blockingRate;
                    const rateColor = rate == null ? undefined
                        : rate > 70 ? "rgba(239,68,68,0.9)"
                        : rate > 40 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    return (
                        <tr key={i}>
                            <td><span className="sa-form-id" title={r.formId}>{cleanFormId(r.formId)}</span></td>
                            <td><code className="sa-field-name">{r.field}</code></td>
                            <td className="sa-table__num">{r.errorSessions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">
                                {r.dropoutSessions.toLocaleString("de-DE")}
                                <MiniBar value={r.dropoutSessions} max={maxDropout} color="rgba(239,68,68,0.35)" />
                            </td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

function ErrorRecoveryTable({ errorRecovery }) {
    if (!errorRecovery || !errorRecovery.length) {
        return <p className="sa-notice">No error sessions recorded yet — recovery rate requires session-linked events.</p>;
    }
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th className="sa-table__num">Error sessions</th>
                    <th className="sa-table__num">Recovered</th>
                    <th className="sa-table__num">Recovery rate</th>
                </tr>
            </thead>
            <tbody>
                {errorRecovery.map((r, i) => {
                    const rate = r.recoveryRate;
                    const rateColor = rate == null ? undefined
                        : rate >= 60 ? "rgba(34,197,94,0.9)"
                        : rate >= 30 ? "rgba(234,179,8,0.9)"
                        : "rgba(239,68,68,0.9)";
                    return (
                        <tr key={i}>
                            <td><span className="sa-form-id" title={r.formId}>{cleanFormId(r.formId)}</span></td>
                            <td className="sa-table__num">{r.errorSessions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{r.recoveredSessions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

function FormErrorsTable({ errors }) {
    if (!errors || !errors.length) {
        return <p className="sa-notice">No form errors recorded yet. Deploy the updated embed script to start capturing validation, network, and server errors.</p>;
    }
    const maxOcc = Math.max(...errors.map(e => e.occurrences), 1);
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th>Type</th>
                    <th>Field</th>
                    <th>Message</th>
                    <th className="sa-table__num">Count</th>
                </tr>
            </thead>
            <tbody>
                {errors.map((e, i) => {
                    const classBadge = formClassBadge(e.formId, e.formClass);
                    const codeDesc = httpCodeDesc(e.message);
                    return (
                        <tr key={i}>
                            <td>
                                <span className="sa-form-id" title={e.formId}>{cleanFormId(e.formId)}</span>
                                {classBadge && (
                                    <span className="sa-form-action" title={e.formClass}>{classBadge}</span>
                                )}
                            </td>
                            <td><span className={`sa-error-type sa-error-type--${e.errorType}`}>{e.errorType}</span></td>
                            <td>{e.field ? <code className="sa-field-name">{e.field}</code> : <span className="sa-muted">—</span>}</td>
                            <td>
                                <span title={e.message || ""}>{
                                    e.message
                                        ? (e.message.length > 60 ? e.message.slice(0, 59) + "…" : e.message)
                                        : "—"
                                }</span>
                                {codeDesc && (
                                    <span className="sa-http-desc">{codeDesc}</span>
                                )}
                                <MiniBar value={e.occurrences} max={maxOcc} color="rgba(239,68,68,0.35)" />
                            </td>
                            <td className="sa-table__num">{e.occurrences.toLocaleString("de-DE")}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

function TopPagesTable({ pages }) {
    const maxSubs = useMemo(() => Math.max(...(pages || []).map(p => p.submissions), 1), [pages]);
    if (!pages || !pages.length) return null;
    return (
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Page</th>
                    <th className="sa-table__num">Submissions</th>
                </tr>
            </thead>
            <tbody>
                {pages.map(p => (
                    <tr key={p.page}>
                        <td>
                            <span title={p.page}>{p.page.length > 60 ? "…" + p.page.slice(-57) : p.page}</span>
                            <MiniBar value={p.submissions} max={maxSubs} color="rgba(192,159,83,0.5)" />
                        </td>
                        <td className="sa-table__num">{p.submissions.toLocaleString("de-DE")}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function AnalyticsForms() {
    const {
        domain,
        getLastDays, setLastDays,
        fromDate, setFromDate,
        toDate, setToDate,
        fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading } = useFormsReport(domain, fromIso, toIso);

    const trendData = (data?.daily || []).map(d => ({
        label: d.day,
        num: d.submissions,
    }));

    const abandonMap = useMemo(() => {
        const m = {};
        for (const r of (data?.abandonment || [])) m[r.formId] = r;
        return m;
    }, [data?.abandonment]);

    const completionRateVariant = (() => {
        const r = data?.totals?.completionRate;
        if (r == null) return undefined;
        if (r < 30) return "warn";
        if (r >= 60) return "live";
        return undefined;
    })();

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Forms"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain to view form analytics.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}

                    {domain && !loading && data && (
                        <>
                            <div className="sa-kpi-strip sa-kpi-strip--4">
                                <KpiCard
                                    icon={<IconFormFill />}
                                    label="Form submissions"
                                    value={(data.totals.submissions ?? 0).toLocaleString("de-DE")}
                                />
                                <KpiCard
                                    icon={<IconTarget />}
                                    label="Forms started"
                                    value={data.totals.starters > 0
                                        ? data.totals.starters.toLocaleString("de-DE")
                                        : "—"}
                                />
                                <KpiCard
                                    icon={<IconBarChart />}
                                    label="Completion rate"
                                    value={data.totals.completionRate != null
                                        ? formatPercent(data.totals.completionRate, 1)
                                        : "—"}
                                    sub={data.totals.completionRate != null
                                        ? "submits ÷ starters"
                                        : "No form_started events yet"}
                                    variant={completionRateVariant}
                                />
                                <KpiCard
                                    icon={<IconScrollDepth />}
                                    label="Unique forms"
                                    value={(data.forms?.length ?? 0).toLocaleString("de-DE")}
                                />
                            </div>

                            {trendData.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Submissions over time
                                    </h3>
                                    <TrendLineChart
                                        data={trendData}
                                        title="Form submissions"
                                    />
                                </div>
                            )}

                            <div className="sa-forms-grid sa-forms-grid--main">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconFormFill className="sa-icon" /> Forms
                                    </h3>
                                    <FormsTable forms={data.forms} abandonMap={abandonMap} />
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> Top pages
                                    </h3>
                                    <TopPagesTable pages={data.topPages} />
                                </div>
                            </div>

                            <div className="sa-forms-grid sa-forms-grid--bottom">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> Device breakdown
                                    </h3>
                                    <DeviceTable devices={data.deviceBreakdown} />
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Session abandonment
                                    </h3>
                                    <p className="sa-panel__desc">Sessions where a form was started but never submitted.</p>
                                    <AbandonmentTable abandonment={data.abandonment} />
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconFormFill className="sa-icon" /> Form errors
                                    </h3>
                                    <p className="sa-panel__desc">Validation failures, network errors, and server errors captured during form submissions.</p>
                                    <FormErrorsTable errors={data.formErrors} />
                                </div>
                            </div>

                            <div className="sa-forms-grid sa-forms-grid--insights">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> Field error breakdown
                                    </h3>
                                    <p className="sa-panel__desc">Which fields cause errors that lead to abandonment. Blocking rate = sessions that errored on this field and never submitted.</p>
                                    <FieldErrorTable fieldErrors={data.fieldErrors} />
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Error recovery rate
                                    </h3>
                                    <p className="sa-panel__desc">Of sessions that hit any form error, how many went on to submit successfully. Low rate means errors are blocking, not just annoying.</p>
                                    <ErrorRecoveryTable errorRecovery={data.errorRecovery} />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
