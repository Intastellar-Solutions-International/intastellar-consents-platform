const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import {
    useAnalyticsPageChrome, authHeaders, KpiCard, MiniBar, formatPercent, useCompareRange,
    usePrevRange, pctChange,
} from "./_shared.js";
import { IconFormFill, IconBarChart, IconTarget, IconScrollDepth, IconGlobe, IconFunnel } from "./Icons.js";
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

// Was a literal no-op — see docs/analytics-audit-plan.md item 7. Mirrors
// api/analytics-forms.js's humanizeFormLabel() for the tables on this page
// that don't carry a server-computed `label` (only the main per-form
// breakdown does, via `f.label` — see its render below, where that richer,
// provider-aware label is preferred over calling this directly).
function cleanFormId(id) {
    if (!id || id === "unknown" || id === "form") return "Unnamed form";
    return id
        .replace(/[-_]+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(" ");
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
                                <span className="sa-form-id" title={f.formId}>{f.label || cleanFormId(f.formId)}</span>
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
                    <th className="sa-table__num">Error rate</th>
                </tr>
            </thead>
            <tbody>
                {devices.map(d => {
                    const rate = d.completionRate;
                    const rateColor = rate == null ? undefined
                        : rate < 30 ? "rgba(239,68,68,0.9)"
                        : rate < 60 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    const errRate = d.errorRate;
                    const errColor = errRate == null ? undefined
                        : errRate > 30 ? "rgba(239,68,68,0.9)"
                        : errRate > 10 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    return (
                        <tr key={d.device}>
                            <td>{DEVICE_LABEL[d.device] || d.device}</td>
                            <td className="sa-table__num">{d.started > 0 ? d.started.toLocaleString("de-DE") : "—"}</td>
                            <td className="sa-table__num">{d.submitted.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                            <td className="sa-table__num" style={errColor ? { color: errColor, fontWeight: 600 } : {}}>
                                {errRate != null ? formatPercent(errRate, 1) : "—"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function fmtDuration(seconds) {
    if (seconds == null) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function TimeToCompleteTable({ timeToComplete }) {
    if (!timeToComplete || !timeToComplete.length) {
        return <p className="sa-notice">No time data yet — requires session-linked form_field_focus and form_submit events from the same session.</p>;
    }
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th className="sa-table__num">Sessions</th>
                    <th className="sa-table__num">Median</th>
                    <th className="sa-table__num">Average</th>
                </tr>
            </thead>
            <tbody>
                {timeToComplete.map((r, i) => (
                    <tr key={i}>
                        <td><span className="sa-form-id" title={r.formId}>{cleanFormId(r.formId)}</span></td>
                        <td className="sa-table__num sa-muted">{r.sessions.toLocaleString("de-DE")}</td>
                        <td className="sa-table__num" style={{ fontWeight: 600 }}>{fmtDuration(r.medianSeconds)}</td>
                        <td className="sa-table__num sa-muted">{fmtDuration(r.avgSeconds)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// Per-form visual funnel — docs/design-audit-plan.md Phase 5 item 2. Replaces
// the old plain Multi-step progress table (started → each data-analytics-step
// → submitted, reached/completed/drop-off columns) with the same bar-funnel
// visualization ConversionFunnel.js already established for the "where we
// lose them" panel on Overview — reusing its .sa-funnel-step* CSS verbatim.
// Unlike the old table, this covers every form with starter tracking, not
// just the ones with explicit step data: "Started" and "Submitted" come from
// the form's own totals, and any data-analytics-step rows (when present) are
// inserted between them as extra stages.
function buildFunnelStages(form, stepProgress) {
    const started = form.starters || 0;
    if (started <= 0) return null;
    const steps = (stepProgress || [])
        .filter(r => r.formId === form.formId)
        .map(r => ({ label: `Step ${r.step}`, sessions: r.reached }));
    return [
        { label: "Started", sessions: started },
        ...steps,
        { label: "Submitted", sessions: form.submissions || 0 },
    ];
}

function FormFunnelCard({ form, stages, dropoutField }) {
    const first = stages[0].sessions || 0;

    // The single biggest stage-to-stage loss gets visually called out —
    // "highlighted directly in the chart" rather than left for the reader to
    // spot by comparing bar widths themselves. Clamped at 0 — "started" and
    // "submitted" come from independently-counted events (form_started vs.
    // form_submit), so a form can genuinely show more submissions than
    // starters; treating that as "0% drop-off" rather than a negative one
    // is the honest reading, not a cover-up of the mismatch (the raw counts
    // next to each bar are never clamped, so it's still visible).
    const drops = stages.map((s, i) => {
        if (i === 0) return null;
        const prev = stages[i - 1];
        return prev.sessions > 0 ? Math.max(0, Math.round((1 - s.sessions / prev.sessions) * 1000) / 10) : null;
    });
    let worstIdx = -1, worstDrop = -1;
    drops.forEach((d, i) => { if (d != null && d > worstDrop) { worstDrop = d; worstIdx = i; } });

    return (
        <div className="sa-form-funnel">
            <h4 className="sa-form-funnel__title">
                <span className="sa-form-id" title={form.formId}>{form.label || cleanFormId(form.formId)}</span>
            </h4>
            {stages.map((stage, i) => {
                // Bar width/pct clamped to 100% for the same reason — can't
                // draw a bar wider than its track, and a form with more
                // submissions than tracked starters hasn't "grown" past full.
                const pct = first > 0 ? Math.min(100, Math.round((stage.sessions / first) * 100)) : 0;
                const dropOffPct = drops[i];
                return (
                    <div key={i} className="sa-funnel-step">
                        {i > 0 && dropOffPct != null && (
                            <div className={"sa-funnel-step__dropoff" + (i === worstIdx && worstDrop > 0 ? " sa-funnel-step__dropoff--worst" : "")}>
                                &darr; {dropOffPct}% drop-off{i === worstIdx && worstDrop > 0 ? " — biggest loss" : ""}
                            </div>
                        )}
                        <div className="sa-funnel-step__row">
                            <span className="sa-funnel-step__label">{stage.label}</span>
                            <div className="sa-funnel-step__track">
                                <div className="sa-funnel-step__fill" style={{ width: pct + "%" }} />
                            </div>
                            <span className="sa-funnel-step__value">
                                {stage.sessions.toLocaleString("de-DE")}
                                <span className="sa-funnel-step__pct">({pct}%)</span>
                            </span>
                        </div>
                    </div>
                );
            })}
            {dropoutField && (
                <p className="sa-form-funnel__field-note">
                    Most drop-off happens at the <code className="sa-field-name">{dropoutField}</code> field.
                </p>
            )}
        </div>
    );
}

function FormFunnelPanel({ forms, abandonMap, stepProgress }) {
    const withFunnels = (forms || []).filter(f => (f.starters || 0) > 0);
    if (!withFunnels.length) {
        return (
            <p className="sa-notice">
                No "form started" tracking yet — funnels need <code className="sa-field-name">form_started</code> events
                to show a start → submit path.
            </p>
        );
    }
    return (
        <div className="sa-form-funnel-list">
            {withFunnels.map(f => {
                const stages = buildFunnelStages(f, stepProgress);
                if (!stages) return null;
                return (
                    <FormFunnelCard
                        key={f.formId}
                        form={f}
                        stages={stages}
                        dropoutField={abandonMap?.[f.formId]?.topDropoutField || null}
                    />
                );
            })}
        </div>
    );
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
function countryLabel(code) {
    if (!code || code === "??") return "Unknown";
    try { return COUNTRY_NAMES.of(code) || code; } catch { return code; }
}

function GeoBreakdownTable({ geoBreakdown }) {
    if (!geoBreakdown || !geoBreakdown.length) {
        return <p className="sa-notice">No geographic data available — requires country_code from geolocation.</p>;
    }
    const maxStarters = Math.max(...geoBreakdown.map(r => r.starters), 1);
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Country</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Submitted</th>
                    <th className="sa-table__num">Errors</th>
                    <th className="sa-table__num">Completion</th>
                </tr>
            </thead>
            <tbody>
                {geoBreakdown.map(r => {
                    const rate = r.completionRate;
                    const rateColor = rate == null ? undefined
                        : rate < 30 ? "rgba(239,68,68,0.9)"
                        : rate < 60 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    return (
                        <tr key={r.country}>
                            <td>
                                <span style={{ fontWeight: 500 }}>{countryLabel(r.country)}</span>
                                <span className="sa-form-action">{r.country}</span>
                                <MiniBar value={r.starters} max={maxStarters} color="rgba(99,102,241,0.4)" />
                            </td>
                            <td className="sa-table__num">{r.starters > 0 ? r.starters.toLocaleString("de-DE") : "—"}</td>
                            <td className="sa-table__num">{r.submissions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num sa-muted">{r.errors > 0 ? r.errors.toLocaleString("de-DE") : "—"}</td>
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

function completionColor(rate) {
    if (rate == null) return undefined;
    if (rate >= 70) return "rgba(34,197,94,0.9)";
    if (rate >= 40) return "rgba(234,179,8,0.9)";
    return "rgba(239,68,68,0.9)";
}

function AcqChannelsTable({ channels }) {
    if (!channels || !channels.length) {
        return <p className="sa-notice">No acquisition data yet. Add <code>?utm_source=&utm_campaign=</code> to campaign links to see channel performance here.</p>;
    }
    const maxStarters = Math.max(...channels.map(r => r.starters), 1);
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Source</th>
                    <th>Medium</th>
                    <th>Campaign</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Submitted</th>
                    <th className="sa-table__num">Errors</th>
                    <th className="sa-table__num">Completion</th>
                </tr>
            </thead>
            <tbody>
                {channels.map((r, i) => {
                    const isDirect = r.source === "(direct)";
                    const rate = r.completionRate;
                    return (
                        <tr key={i}>
                            <td style={isDirect ? { color: "rgba(130,130,130,0.6)", fontStyle: "italic" } : {}}>
                                {r.source}
                                <MiniBar value={r.starters} max={maxStarters} color="rgba(99,179,237,0.45)" />
                            </td>
                            <td className="sa-muted">{r.medium}</td>
                            <td className="sa-muted" title={r.campaign}>{r.campaign === "(none)" ? <span className="sa-muted">—</span> : r.campaign.length > 40 ? r.campaign.slice(0, 39) + "…" : r.campaign}</td>
                            <td className="sa-table__num">{r.starters.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{r.submissions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{r.errors > 0 ? <span style={{ color: "rgba(239,68,68,0.8)" }}>{r.errors.toLocaleString("de-DE")}</span> : <span className="sa-muted">—</span>}</td>
                            <td className="sa-table__num" style={completionColor(rate) ? { color: completionColor(rate), fontWeight: 600 } : {}}>
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

function AcqReferrersTable({ referrers }) {
    if (!referrers || !referrers.length) {
        return <p className="sa-notice">No referrer data yet — requires session-linked events (full consent).</p>;
    }
    const maxStarters = Math.max(...referrers.map(r => r.starters), 1);
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Referrer</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Submitted</th>
                    <th className="sa-table__num">Completion</th>
                </tr>
            </thead>
            <tbody>
                {referrers.map((r, i) => {
                    const isDirect = r.referrer === "(direct)";
                    const rate = r.completionRate;
                    return (
                        <tr key={i}>
                            <td
                                className="sa-table__path"
                                title={r.referrer}
                                style={isDirect ? { color: "rgba(130,130,130,0.6)", fontStyle: "italic" } : {}}
                            >
                                {r.referrer}
                                <MiniBar value={r.starters} max={maxStarters} color="rgba(192,159,83,0.45)" />
                            </td>
                            <td className="sa-table__num">{r.starters.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{r.submissions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={completionColor(rate) ? { color: completionColor(rate), fontWeight: 600 } : {}}>
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

function AcqPagesTable({ pages }) {
    if (!pages || !pages.length) return null;
    const maxStarters = Math.max(...pages.map(p => p.starters), 1);
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Page</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Submitted</th>
                    <th className="sa-table__num">Errors</th>
                    <th className="sa-table__num">Completion</th>
                </tr>
            </thead>
            <tbody>
                {pages.map((p, i) => {
                    const rate = p.completionRate;
                    return (
                        <tr key={i}>
                            <td className="sa-table__path" title={p.pathname}>
                                {p.pathname.length > 60 ? "…" + p.pathname.slice(-57) : p.pathname}
                                <MiniBar value={p.starters} max={maxStarters} color="rgba(192,159,83,0.45)" />
                            </td>
                            <td className="sa-table__num">{p.starters.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{p.submissions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{p.errors > 0 ? <span style={{ color: "rgba(239,68,68,0.8)" }}>{p.errors.toLocaleString("de-DE")}</span> : <span className="sa-muted">—</span>}</td>
                            <td className="sa-table__num" style={completionColor(rate) ? { color: completionColor(rate), fontWeight: 600 } : {}}>
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

// Pure, testable — same "synthesized takeaway" pattern as index.js's
// buildOverviewHeadline() (docs/design-audit-plan.md Phase 4 item 4):
// aggregate totals in the headline, the single most actionable finding
// (the form most worth fixing right now) in the subline, rather than
// leaving the reader to cross-reference the tables below to find it.
function buildFormsHeadline({ data, trendSubmissions }) {
    const subs = data.totals.submissions ?? 0;
    const forms = data.forms || [];
    const numForms = forms.length;
    if (subs === 0 && numForms === 0) return null;

    let headline = `${subs.toLocaleString("de-DE")} submission${subs === 1 ? "" : "s"} across `
        + `${numForms} form${numForms === 1 ? "" : "s"} this period`;
    if (data.totals.completionRate != null) {
        headline += `, ${formatPercent(data.totals.completionRate, 1)} completion overall`;
    }
    if (trendSubmissions != null && Number.isFinite(trendSubmissions)) {
        headline += `, ${trendSubmissions >= 0 ? "up" : "down"} ${formatPercent(Math.abs(trendSubmissions))} from the period before`;
    }
    headline += ".";

    // Only call out a form by name once there's enough volume for the rate
    // to mean anything — a 1-starter form at 0% isn't a real finding.
    const MIN_STARTERS = 5;
    const candidates = forms.filter(f => f.completionRate != null && f.starters >= MIN_STARTERS);
    const worst = candidates.length
        ? candidates.reduce((a, b) => (b.completionRate < a.completionRate ? b : a))
        : null;

    let subline = null;
    if (worst) {
        const abandon = (data.abandonment || []).find(a => a.formId === worst.formId);
        subline = `${worst.label || cleanFormId(worst.formId)} has the lowest completion rate at ${formatPercent(worst.completionRate, 1)}`;
        subline += abandon?.topDropoutField
            ? ` — most drop-off happens at the "${abandon.topDropoutField}" field.`
            : ".";
    } else if (numForms > 0) {
        subline = "No form is showing a concerning completion rate right now.";
    }

    return { eyebrow: "Here's what to care about today", headline, subline };
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

    // Compare-to-previous-period header wiring (Phase 3, docs/design-audit-plan.md).
    const compare = useCompareRange();

    // KPI trend chips + headline sentence — same usePrevRange()/pctChange()
    // pattern index.js already uses, just not previously wired up here.
    const prevRange = usePrevRange(fromDate, toDate, compare);
    const { data: prevData } = useFormsReport(domain, prevRange.fromIso, prevRange.toIso);
    const trendSubmissions = useMemo(() => pctChange(data?.totals?.submissions,    prevData?.totals?.submissions),    [data, prevData]);
    const trendStarters    = useMemo(() => pctChange(data?.totals?.starters,       prevData?.totals?.starters),       [data, prevData]);
    const trendCompletion  = useMemo(() => pctChange(data?.totals?.completionRate, prevData?.totals?.completionRate), [data, prevData]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title="Forms"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={compare.previousPeriod}
                previousPeriod2={compare.previousPeriod2}
                compareRange={compare.compareRange}
                setCompareRange={compare.setCompareRange}
                setCompareWindowStart={compare.setCompareWindowStart}
                setCompareWindowEnd={compare.setCompareWindowEnd}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain to view form analytics.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}

                    {domain && !loading && data && (
                        <>
                            {/* ── Headline sentence ───────────────────────────────
                                docs/design-audit-plan.md Phase 5, same synthesized-
                                takeaway pattern as Overview's (Phase 4 item 4). */}
                            {(() => {
                                const h = buildFormsHeadline({ data, trendSubmissions });
                                if (!h) return null;
                                return (
                                    <div className="sa-overview-headline">
                                        <p className="sa-overview-headline__eyebrow">{h.eyebrow}</p>
                                        <p className="sa-overview-headline__text">{h.headline}</p>
                                        {h.subline && <p className="sa-overview-headline__sub">{h.subline}</p>}
                                    </div>
                                );
                            })()}

                            <div className="sa-kpi-strip sa-kpi-strip--4">
                                <KpiCard
                                    icon={<IconFormFill />}
                                    label="Form submissions"
                                    value={(data.totals.submissions ?? 0).toLocaleString("de-DE")}
                                    trend={trendSubmissions}
                                    sub={
                                        data.totals.sessionSubmissions < data.totals.submissions
                                            ? `${data.totals.sessionSubmissions.toLocaleString("de-DE")} session-linked`
                                            : "all events, any consent"
                                    }
                                />
                                <KpiCard
                                    icon={<IconTarget />}
                                    label="Forms started"
                                    value={data.totals.starters > 0
                                        ? data.totals.starters.toLocaleString("de-DE")
                                        : "—"}
                                    trend={data.totals.starters > 0 ? trendStarters : undefined}
                                    sub={
                                        data.totals.starters > 0
                                            ? (data.totals.sessionStarters < data.totals.starters
                                                ? `${data.totals.sessionStarters.toLocaleString("de-DE")} session-linked`
                                                : "all events, any consent")
                                            : undefined
                                    }
                                />
                                <KpiCard
                                    icon={<IconBarChart />}
                                    label="Completion rate"
                                    value={data.totals.completionRate != null
                                        ? formatPercent(data.totals.completionRate, 1)
                                        : "—"}
                                    trend={data.totals.completionRate != null ? trendCompletion : undefined}
                                    sub={data.totals.completionRate != null
                                        ? "all events, any consent level"
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
                                        fromDate={fromDate}
                                        toDate={toDate}
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
                                    <p className="sa-panel__desc">
                                        Session-linked events only (full consent required) — a subset of the top-line starters count.
                                        {data.totals.sessionStarters < data.totals.starters && data.totals.starters > 0 && (
                                            <>{" "}{data.totals.sessionStarters.toLocaleString("de-DE")} of {data.totals.starters.toLocaleString("de-DE")} starters have session tracking.</>
                                        )}
                                    </p>
                                    <AbandonmentTable abandonment={data.abandonment} />
                                </div>
                            </div>

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">
                                    <IconFormFill className="sa-icon" /> Form errors
                                </h3>
                                <p className="sa-panel__desc">Validation failures, network errors, and server errors captured during form submissions.</p>
                                <FormErrorsTable errors={data.formErrors} />
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

                            <div className="sa-forms-grid sa-forms-grid--insights">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> Geographic breakdown
                                    </h3>
                                    <p className="sa-panel__desc">Completion rates and errors by country. Low completion in specific regions can signal localisation, payment, or connectivity issues.</p>
                                    <GeoBreakdownTable geoBreakdown={data.geoBreakdown} />
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Time to complete
                                    </h3>
                                    <p className="sa-panel__desc">Median and average seconds from first field interaction to submission. High median on short forms indicates friction.</p>
                                    <TimeToCompleteTable timeToComplete={data.timeToComplete} />
                                </div>
                            </div>

                            {data.forms?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconFunnel className="sa-icon" /> Funnel per form
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Started &rarr; submitted for every form, with any <code className="sa-field-name">data-analytics-step</code> stages
                                        in between. The biggest stage-to-stage loss is called out directly.
                                    </p>
                                    <FormFunnelPanel forms={data.forms} abandonMap={abandonMap} stepProgress={data.stepProgress} />
                                </div>
                            )}

                            {/* ── Acquisition ── */}
                            <div className="sa-section-divider">
                                <span>Acquisition</span>
                            </div>

                            <div className="sa-forms-grid sa-forms-grid--acq">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Channels
                                    </h3>
                                    <p className="sa-panel__desc">UTM-tagged traffic broken down by source, medium and campaign. Direct visits have no UTM parameters. Completion rate = session-deduplicated submitted ÷ started.</p>
                                    <AcqChannelsTable channels={data.acqChannels} />
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconGlobe className="sa-icon" /> Referrers
                                    </h3>
                                    <p className="sa-panel__desc">Where form users came from, matched via session to the first referrer of their visit. Session-linked only.</p>
                                    <AcqReferrersTable referrers={data.acqReferrers} />
                                </div>
                            </div>

                            {data.acqPages?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> Form engagement by page
                                    </h3>
                                    <p className="sa-panel__desc">Pages where form interactions occurred. Low completion on a high-traffic page is the highest-impact bottleneck to fix.</p>
                                    <AcqPagesTable pages={data.acqPages} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
