// Segments: compare two groups of visitors side by side, and see the custom
// dimensions a site sends (intaAnalytics.set — api/a.js) with a one-click
// "compare this value".
const { useState, useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import {
    useAnalyticsPageChrome, useAnalyticsReport, useDimensions, SegmentFilter,
    formatPercent, pctChange, MiniBar,
} from "./_shared.js";
import { niceTicks } from "./TrendLineChart.js";
import { appLocale } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";
import "./Analytics.css";

const EMPTY = { device: null, country: "", channel: null, consent: null, dimension: null };
const CHANNEL_LABELS = { organic: "Organic Search", paid: "Paid", paid_social: "Paid Social", referral: "Referral", direct: "Direct" };
const DEVICE_LABELS = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", other: "Other" };
const COLORS = { a: "var(--color-data)", b: "var(--color-accent)" };

const hasAny = (s) => !!(s.device || s.country || s.channel || s.consent || s.dimension);
const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString(appLocale()));

/** "Mobile · Organic Search · DK · plan = pro", or "All visitors". */
export function describeSegment(s) {
    const parts = [
        s.device && t(DEVICE_LABELS[s.device] || s.device),
        s.channel && t(CHANNEL_LABELS[s.channel] || s.channel),
        s.country,
        s.consent === "full" ? t("Full consent") : s.consent === "minimal" ? t("Minimal consent") : null,
        s.dimension && `${s.dimension.key} = ${s.dimension.value}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : t("All visitors");
}

// What each row of the comparison shows. `rate` rows compare in percentage points.
const METRICS = [
    { key: "pageviews", label: "Page views", value: (d) => d.totals.total },
    { key: "sessions", label: "Sessions (consenting)", value: (d) => d.totals.uniqueSessions },
    { key: "modelled", label: "Modelled sessions", value: (d) => d.modelled?.sessions ?? null },
    { key: "engaged", label: "Engaged users", value: (d) => d.totals.engagedUsers },
    { key: "conversionRate", label: "Conversion rate", value: (d) => d.totals.conversionRate, rate: true },
    { key: "consentRate", label: "Consent rate", value: (d) => d.totals.consentRate, rate: true },
    { key: "revenue", label: "Revenue", value: (d) => d.totals.revenue },
];

/** Difference of B against A: percent for counts, percentage points for rates. */
export function difference(a, b, rate) {
    if (a == null || b == null) return null;
    if (rate) return { value: b - a, unit: "pp" };
    const pct = pctChange(b, a);
    return pct == null ? null : { value: pct, unit: "%" };
}

function DiffCell({ diff }) {
    if (!diff) return <td className="sa-table__num">—</td>;
    const sign = diff.value > 0 ? "+" : "";
    const text = diff.unit === "pp"
        ? t("{value} pp", { value: `${sign}${diff.value.toFixed(1)}` })
        : `${sign}${Math.round(diff.value)} %`;
    return <td className={`sa-table__num sa-seg-diff sa-seg-diff--${diff.value > 0 ? "up" : diff.value < 0 ? "down" : "same"}`}>{text}</td>;
}

function MetricsTable({ a, b }) {
    return (
        <table className="sa-table sa-seg-compare__table">
            <thead>
                <tr>
                    <th>{t("Metric")}</th>
                    <th className="sa-table__num"><span className="sa-seg-swatch" style={{ background: COLORS.a }} />A</th>
                    <th className="sa-table__num"><span className="sa-seg-swatch" style={{ background: COLORS.b }} />B</th>
                    <th className="sa-table__num">{t("B vs A")}</th>
                </tr>
            </thead>
            <tbody>
                {METRICS.map((m) => {
                    const va = a ? m.value(a) : null;
                    const vb = b ? m.value(b) : null;
                    if (va == null && vb == null) return null;
                    const show = (v) => (v == null ? "—" : m.rate ? formatPercent(v) : fmt(v));
                    return (
                        <tr key={m.key}>
                            <td>{t(m.label)}</td>
                            <td className="sa-table__num">{show(va)}</td>
                            <td className="sa-table__num">{show(vb)}</td>
                            <DiffCell diff={difference(va, vb, m.rate)} />
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/** Two daily lines (A and B) on one scale. */
function CompareChart({ a, b, metric }) {
    const W = 800, H = 200, PAD = { t: 12, r: 16, b: 28, l: 46 };
    const value = (d) => (metric === "sessions" ? Number(d.uniqueSessions || 0) : Number(d.minimal || 0) + Number(d.full || 0));
    const dates = useMemo(() => [...new Set([...(a?.daily || []), ...(b?.daily || [])].map((d) => d.date))].sort(), [a, b]);
    if (dates.length < 2) return <div className="sa-chart sa-chart--empty">{t("No data for this period")}</div>;
    const series = (data) => {
        const byDate = new Map((data?.daily || []).map((d) => [d.date, value(d)]));
        return dates.map((d) => byDate.get(d) || 0);
    };
    const sa = series(a), sb = series(b);
    const ticks = niceTicks(Math.max(...sa, ...sb, 1));
    const max = ticks[ticks.length - 1];
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const x = (i) => PAD.l + (i / (dates.length - 1)) * cW;
    const y = (v) => PAD.t + cH - (v / max) * cH;
    const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const labels = [0, Math.round((dates.length - 1) / 2), dates.length - 1];
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}
            role="img" aria-label={t("Daily comparison of segment A and B")}>
            {ticks.map((v) => (
                <g key={v}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-border-subtle)" />
                    <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="12" style={{ fill: "var(--color-text-muted)" }}>{fmt(v)}</text>
                </g>
            ))}
            <path d={path(sa)} fill="none" style={{ stroke: COLORS.a }} strokeWidth="2" />
            <path d={path(sb)} fill="none" style={{ stroke: COLORS.b }} strokeWidth="2" strokeDasharray="6 4" />
            {labels.map((i) => (
                <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" style={{ fill: "var(--color-text-muted)" }}>{dates[i].slice(5)}</text>
            ))}
        </svg>
    );
}

function SideBySide({ title, a, b, rows, label, valueKey, name }) {
    const listA = (rows(a) || []).slice(0, 8), listB = (rows(b) || []).slice(0, 8);
    if (!listA.length && !listB.length) return null;
    const max = Math.max(...listA.map((r) => r[valueKey]), ...listB.map((r) => r[valueKey]), 1);
    const col = (list, color) => (
        <table className="sa-table">
            <thead><tr><th>{label}</th><th className="sa-table__num">{t("Page views")}</th><th className="sa-table__bar" /></tr></thead>
            <tbody>
                {list.map((r) => (
                    <tr key={name(r)}>
                        <td className="sa-table__path" title={name(r)}>{name(r)}</td>
                        <td className="sa-table__num">{fmt(r[valueKey])}</td>
                        <td className="sa-table__bar"><MiniBar value={r[valueKey]} max={max} color={color} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">{title}</h3>
            <div className="sa-seg-sidebyside">
                <div><p className="sa-seg-sidebyside__hd"><span className="sa-seg-swatch" style={{ background: COLORS.a }} />A</p>{col(listA, COLORS.a)}</div>
                <div><p className="sa-seg-sidebyside__hd"><span className="sa-seg-swatch" style={{ background: COLORS.b }} />B</p>{col(listB, COLORS.b)}</div>
            </div>
        </div>
    );
}

const SETUP_CODE = `<script>
  // Before the Intastellar Analytics tag:
  window.intaDimensions = { plan: "pro", logged_in: "yes" };
</script>

// Or any time later, e.g. after login:
intaAnalytics.set("plan", "pro");`;

function DimensionsPanel({ dimensions, onCompare }) {
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">{t("Custom dimensions")}</h3>
            <p className="sa-panel__sub">
                {t("Describe your visitors in your own terms, e.g. plan, logged in or content type, and use them as segments. Up to 5 dimensions, sent only with consented page views. Never put names, e-mail addresses or customer numbers in them.")}
            </p>
            {dimensions.length ? (
                <div className="sa-seg-dims">
                    {dimensions.map((d) => (
                        <div key={d.key}>
                            <h4 className="sa-seg-dims__key">{d.key}</h4>
                            <table className="sa-table">
                                <thead><tr><th>{t("Value")}</th><th className="sa-table__num">{t("Page views")}</th><th className="sa-table__num">{t("Sessions")}</th><th /></tr></thead>
                                <tbody>
                                    {d.values.map((v) => (
                                        <tr key={v.value}>
                                            <td className="sa-table__path" title={v.value}>{v.value}</td>
                                            <td className="sa-table__num">{fmt(v.pageviews)}</td>
                                            <td className="sa-table__num">{fmt(v.sessions)}</td>
                                            <td className="sa-table__num">
                                                <button type="button" className="sa-customize-btn" onClick={() => onCompare({ key: d.key, value: v.value })}>{t("Compare")}</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <p>{t("No custom dimensions in this period yet. Add them to your site:")}</p>
                    <pre className="sa-code"><code>{SETUP_CODE}</code></pre>
                </>
            )}
        </div>
    );
}

export default function AnalyticsSegments() {
    document.title = "Segments, Analytics | Intastellar Consents";
    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso } = useAnalyticsPageChrome();
    const [segA, setSegA] = useState(EMPTY);
    const [segB, setSegB] = useState({ ...EMPTY, device: "mobile" });
    const [metric, setMetric] = useState("pageviews");
    const dimensions = useDimensions(domain, fromIso, toIso);
    const { data: a, loading: loadingA } = useAnalyticsReport(domain, fromIso, toIso, 0, hasAny(segA) ? segA : null);
    const { data: b, loading: loadingB } = useAnalyticsReport(domain, fromIso, toIso, 0, hasAny(segB) ? segB : null);
    const ready = a && b && !a.noSiteKey && !b.noSiteKey;
    const consentingOnly = [segA, segB].some((s) => s.dimension || s.consent === "full");

    const compareDimension = (dimension) => {
        setSegB({ ...EMPTY, dimension });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title={t("Segments")}
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain ? <p className="sa-notice">{t("Select a specific domain in the header to view analytics.")}</p> : null}
                    {domain ? (
                        <>
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">{t("Compare segments")}</h3>
                                <div className="sa-seg-pickers">
                                    <div>
                                        <p className="sa-seg-sidebyside__hd"><span className="sa-seg-swatch" style={{ background: COLORS.a }} />{t("Segment A")}: <strong>{describeSegment(segA)}</strong></p>
                                        <SegmentFilter segment={segA} setSegment={setSegA} dimensions={dimensions} />
                                    </div>
                                    <div>
                                        <p className="sa-seg-sidebyside__hd"><span className="sa-seg-swatch" style={{ background: COLORS.b }} />{t("Segment B")}: <strong>{describeSegment(segB)}</strong></p>
                                        <SegmentFilter segment={segB} setSegment={setSegB} dimensions={dimensions} />
                                    </div>
                                </div>
                                {consentingOnly ? <p className="sa-history-note">{t("Custom dimensions and full consent only cover visitors who accepted statistics cookies, so those segments show consenting traffic only.")}</p> : null}
                                {(loadingA || loadingB) && !ready ? <p className="sa-notice">{t("Loading…")}</p> : null}
                                {ready ? <MetricsTable a={a} b={b} /> : null}
                            </div>

                            {ready ? (
                                <div className="sa-panel">
                                    <div className="sa-chart-section__hd">
                                        <h3 className="sa-panel__title">{t("Day by day")}</h3>
                                        <div className="sa-seg-metric" role="group" aria-label={t("Metric")}>
                                            {[["pageviews", t("Page views")], ["sessions", t("Sessions")]].map(([key, label]) => (
                                                <button key={key} type="button" aria-pressed={metric === key}
                                                    className={`sa-customize-btn${metric === key ? " sa-customize-btn--active" : ""}`}
                                                    onClick={() => setMetric(key)}>{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <CompareChart a={a} b={b} metric={metric} />
                                    <p className="sa-seg-legend">
                                        <span><span className="sa-seg-swatch" style={{ background: COLORS.a }} />A — {describeSegment(segA)}</span>
                                        <span><span className="sa-seg-swatch sa-seg-swatch--dashed" style={{ borderColor: COLORS.b }} />B — {describeSegment(segB)}</span>
                                    </p>
                                </div>
                            ) : null}

                            {ready ? (
                                <div className="sa-seg-grid">
                                    <SideBySide title={t("Top pages")} a={a} b={b} rows={(d) => d.topPages} label={t("Page")} valueKey="views" name={(r) => r.pathname} />
                                    <SideBySide title={t("Channels")} a={a} b={b} rows={(d) => d.channels} label={t("Channel")} valueKey="events" name={(r) => t(CHANNEL_LABELS[r.channel] || r.channel)} />
                                </div>
                            ) : null}

                            <DimensionsPanel dimensions={dimensions} onCompare={compareDimension} />
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
