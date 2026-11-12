import { SkeletonKpiTile } from "../../Components/ui";
import { appLocale, formatNumber } from "../../Functions/format.js";
import { dailySeries, decisionSplit } from "./auditLogFormat.js";

const { useState } = React;

/** Validated together in src/styles/tokens.css; "other" stays neutral. */
const SPLIT = [
    { key: "accept", label: "Accept all", color: "var(--color-data)" },
    { key: "reject", label: "Reject / essential only", color: "rgb(var(--c-data-3))" },
    { key: "custom", label: "Custom", color: "rgb(var(--c-data-2))" },
    { key: "other", label: "Method not recorded", color: "var(--color-border-strong)" },
];

const percent = (n, total) => (total ? `${formatNumber((n / total) * 100, { maximumFractionDigits: 0 })}%` : "0%");

function dayLabel(day) {
    try {
        return new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
    } catch {
        return day;
    }
}

function regionName(code) {
    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
    } catch {
        return code;
    }
}

/** Consents per UTC day; hover or focus a day for its count. */
function Trend({ series }) {
    const [active, setActive] = useState(null);
    if (series.length < 2) return null;
    const W = 300;
    const H = 56;
    const max = Math.max(1, ...series.map((p) => p.n));
    const x = (i) => (i / (series.length - 1)) * W;
    const y = (n) => H - 2 - (n / max) * (H - 6);
    const points = series.map((p, i) => `${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(" ");
    const peak = series.reduce((a, b) => (b.n > a.n ? b : a), series[0]);
    const pick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - rect.left) / rect.width) * (series.length - 1));
        setActive(Math.max(0, Math.min(series.length - 1, i)));
    };
    const shown = active != null ? series[active] : null;
    return (
        <div className="audit-trend">
            <div
                className="audit-trend__plot"
                tabIndex={0}
                role="img"
                aria-label={`Consents per day, ${dayLabel(series[0].day)} to ${dayLabel(series[series.length - 1].day)}. Highest: ${formatNumber(peak.n)} on ${dayLabel(peak.day)}.`}
                onMouseMove={pick}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(series.length - 1)}
                onBlur={() => setActive(null)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? series.length) - 1));
                    if (e.key === "ArrowRight") setActive((i) => Math.min(series.length - 1, (i ?? -1) + 1));
                }}
            >
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                    <line x1="0" x2={W} y1={H - 1} y2={H - 1} className="audit-trend__base" vectorEffect="non-scaling-stroke" />
                    {shown && <line x1={x(active)} x2={x(active)} y1="0" y2={H} className="audit-trend__cross" vectorEffect="non-scaling-stroke" />}
                    <polyline points={points} className="audit-trend__line" vectorEffect="non-scaling-stroke" />
                </svg>
                {shown && (
                    <>
                        <span className="audit-trend__dot" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(shown.n) / H) * 100}%` }} />
                        <span className="audit-trend__tip" style={{ left: `${Math.min(80, Math.max(20, (x(active) / W) * 100))}%` }}>
                            {dayLabel(shown.day)} · <strong>{formatNumber(shown.n)}</strong>
                        </span>
                    </>
                )}
            </div>
            <div className="audit-trend__axis" aria-hidden="true">
                <span>{dayLabel(series[0].day)}</span>
                <span>{dayLabel(series[series.length - 1].day)}</span>
            </div>
        </div>
    );
}

/**
 * Context above the audit log table: how many decisions match, how they
 * split, where they came from and how they spread over the range. Covers
 * every matching record, not only the rows loaded so far.
 */
export default function AuditSummary({ summary, loading, fromDay, toDay }) {
    if (loading) {
        return (
            <div className="audit-summary">
                <SkeletonKpiTile label="Loading consents" />
                <SkeletonKpiTile label="Loading decisions" />
                <SkeletonKpiTile label="Loading top countries" />
            </div>
        );
    }
    if (!summary) return null;
    const total = Number(summary.total) || 0;
    const split = decisionSplit(summary.methods);
    const series = dailySeries(summary.daily, fromDay, toDay);
    const countries = summary.countries || [];
    const countryMax = Math.max(1, ...countries.map((c) => c.n));
    const segments = SPLIT.filter((s) => split[s.key] > 0);

    return (
        <section className="audit-summary" aria-label="Summary of the matching records">
            <div className="audit-summary__tile">
                <h3 className="audit-summary__label">Consents</h3>
                <p className="audit-summary__value">{formatNumber(total)}</p>
                <p className="audit-summary__hint">{series.length ? `${formatNumber(total / series.length, { maximumFractionDigits: 1 })} per day on average` : ""}</p>
                <Trend series={series} />
            </div>

            <div className="audit-summary__tile">
                <h3 className="audit-summary__label">Decisions</h3>
                {total ? (
                    <>
                        <div className="audit-split" aria-hidden="true">
                            {segments.map((s) => <span key={s.key} style={{ flexGrow: split[s.key], background: s.color }} title={`${s.label}: ${formatNumber(split[s.key])} (${percent(split[s.key], total)})`} />)}
                        </div>
                        <ul className="audit-legend">
                            {SPLIT.filter((s) => s.key !== "other" || split.other > 0).map((s) => (
                                <li key={s.key}>
                                    <span className="audit-legend__swatch" style={{ background: s.color }} aria-hidden="true" />
                                    <span className="audit-legend__name">{s.label}</span>
                                    <span className="audit-legend__value">{formatNumber(split[s.key])}</span>
                                    <span className="audit-legend__pct">{percent(split[s.key], total)}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : <p className="audit-summary__hint">No decisions in this range.</p>}
            </div>

            <div className="audit-summary__tile">
                <h3 className="audit-summary__label">Top countries</h3>
                {countries.length ? (
                    <ul className="audit-countries">
                        {countries.map((c) => (
                            <li key={c.code}>
                                <span className="audit-countries__name" title={regionName(c.code)}>{regionName(c.code)}</span>
                                <span className="audit-countries__bar" aria-hidden="true"><span style={{ width: `${(c.n / countryMax) * 100}%` }} /></span>
                                <span className="audit-legend__value">{formatNumber(c.n)}</span>
                                <span className="audit-legend__pct">{percent(c.n, total)}</span>
                            </li>
                        ))}
                        {summary.otherCountries > 0 && (
                            <li className="audit-countries__other">
                                <span className="audit-countries__name">Other or unknown</span>
                                <span />
                                <span className="audit-legend__value">{formatNumber(summary.otherCountries)}</span>
                                <span className="audit-legend__pct">{percent(summary.otherCountries, total)}</span>
                            </li>
                        )}
                    </ul>
                ) : <p className="audit-summary__hint">No country recorded.</p>}
            </div>
        </section>
    );
}
