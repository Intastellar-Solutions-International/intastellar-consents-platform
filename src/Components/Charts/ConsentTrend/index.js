import Card from "../../ui/Card.js";
import { niceTicks } from "../../../Pages/Analytics/TrendLineChart.js";
import { buildTrendPoints, linePath } from "../../../Functions/consentTrend.js";
import { appLocale, formatNumber, formatPercent } from "../../../Functions/format.js";

const { useState, useMemo } = React;

const SEGMENT = "tw-h-8 tw-px-3 tw-border-0 tw-rounded-sm tw-font-sans tw-text-sm tw-cursor-pointer focus-visible:tw-outline-none focus-visible:tw-shadow-focus";
const CHART_HEIGHT = 260;

function toYmd(d) {
    return d.toISOString().split("T")[0];
}

function pointLabel(point, hourly) {
    if (hourly) return new Date(point.key.replace(" ", "T")).toLocaleTimeString(appLocale(), { hour: "numeric", minute: "2-digit" });
    return new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${point.key}T00:00:00Z`));
}

/**
 * Daily acceptance rate or consent volume, with the comparison period as a
 * dashed line. Acceptance is offered only when the API sent daily rates.
 */
export default function ConsentTrend({ daily, granularity, fromDate, toDate, compareOn }) {
    const hourly = granularity === "hour";
    const points = useMemo(
        () => buildTrendPoints(daily, toYmd(fromDate), toYmd(toDate), granularity),
        [daily, fromDate, toDate, granularity]
    );
    const hasRates = points.some((p) => p.rate != null);
    const [metric, setMetric] = useState("rate");
    const [hover, setHover] = useState(null);
    const isRate = metric === "rate" && hasRates;

    const current = points.map((p) => (isRate ? p.rate : p.num));
    const previous = points.map((p) => (isRate ? p.prevRate : p.prevNum));
    const showPrevious = compareOn && previous.some((v) => v != null);
    const plotted = [...current, ...(showPrevious ? previous : [])].filter((v) => v != null);

    let yMin = 0, yMax, ticks;
    if (isRate) {
        yMin = Math.max(0, Math.floor((Math.min(...plotted) - 5) / 20) * 20);
        yMax = 100;
        ticks = [];
        for (let v = yMin; v <= 100; v += 20) ticks.push(v);
    } else {
        ticks = niceTicks(Math.max(...plotted, 5));
        yMax = ticks[ticks.length - 1];
    }

    const n = points.length;
    const X = (i) => ((i + 0.5) / n) * 100;
    const Y = (v) => ((yMax - v) / (yMax - yMin)) * 100;
    const format = (v) => (v == null ? "—" : isRate ? formatPercent(v) : formatNumber(v));
    const lastIndex = current.reduce((last, v, i) => (v != null ? i : last), -1);
    const hovered = hover != null && hover < n && current[hover] != null ? hover : null;

    const total = points.reduce((sum, p) => sum + p.num, 0);
    const peak = points.reduce((best, p) => (p.num > best.num ? p : best), points[0] || { num: 0 });
    const title = isRate ? "Daily acceptance rate" : hourly ? "Consent decisions by hour" : "Daily consent decisions";
    const options = [["rate", "Acceptance"], ["volume", "Volume"]];

    return (
        <Card
            title={title}
            actions={hasRates ? (
                <div role="group" aria-label="Chart metric" className="tw-flex tw-gap-0.5 tw-p-0.5 tw-bg-bg-sunken tw-rounded-md">
                    {options.map(([id, label]) => {
                        const on = (id === "rate") === isRate;
                        return (
                            <button key={id} type="button" aria-pressed={on} onClick={() => { setMetric(id); setHover(null); }}
                                className={`${SEGMENT} ${on ? "tw-bg-accent-subtle tw-text-text-primary" : "tw-bg-transparent tw-text-text-secondary hover:tw-bg-white/5"}`}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            ) : undefined}
        >
            {n === 0 || total === 0 ? (
                <p className="tw-m-0 tw-text-sm tw-text-text-muted">No consent decisions in this period.</p>
            ) : (
                <>
                    <div className="tw-flex tw-flex-wrap tw-gap-4 tw-text-xs tw-text-text-secondary">
                        {!isRate && <span>{formatNumber(Math.round(total / n))} per {hourly ? "hour" : "day"} on average · peak {formatNumber(peak.num)} on {pointLabel(peak, hourly)}</span>}
                        {showPrevious && (
                            <>
                                <span className="tw-flex tw-items-center tw-gap-1"><span className="tw-w-4 tw-bg-data" style={{ height: 2 }} />This period</span>
                                <span className="tw-flex tw-items-center tw-gap-1"><span className="tw-w-4" style={{ borderTop: "2px dashed rgb(var(--c-text-muted))" }} />Comparison period</span>
                            </>
                        )}
                    </div>
                    <div className="tw-relative tw-mt-4" style={{ height: CHART_HEIGHT, marginLeft: 48, marginRight: 4 }}>
                        {ticks.map((v) => (
                            <div key={v} className="tw-absolute tw-left-0 tw-right-0 tw-bg-white/10" style={{ top: `${Y(v)}%`, height: 1 }}>
                                <span className="tw-absolute tw-text-xs tw-text-text-muted tw-tabular-nums tw-whitespace-nowrap" style={{ right: "100%", marginRight: 8, top: -10 }}>
                                    {isRate ? `${v}%` : formatNumber(v)}
                                </span>
                            </div>
                        ))}
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="tw-absolute tw-inset-0 tw-w-full tw-h-full" style={{ overflow: "visible" }}>
                            {showPrevious && (
                                <path d={linePath(previous, X, Y)} fill="none" stroke="rgb(var(--c-text-muted))" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                            )}
                            <path d={linePath(current, X, Y)} fill="none" stroke="rgb(var(--c-data))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        </svg>
                        {lastIndex >= 0 && <Dot left={X(lastIndex)} top={Y(current[lastIndex])} />}
                        {hovered != null && (
                            <>
                                <div className="tw-absolute tw-top-0 tw-bottom-0 tw-bg-white/10 tw-pointer-events-none" style={{ left: `${X(hovered)}%`, width: 1 }} />
                                <Dot left={X(hovered)} top={Y(current[hovered])} />
                                <div
                                    className="tw-absolute tw-top-1 tw-z-10 tw-px-3 tw-py-2 tw-text-xs tw-text-text-primary tw-bg-bg-sunken tw-border tw-border-solid tw-border-border-strong tw-rounded-md tw-shadow-md tw-pointer-events-none tw-whitespace-nowrap"
                                    style={X(hovered) > 60 ? { right: `calc(${100 - X(hovered)}% + 12px)` } : { left: `calc(${X(hovered)}% + 12px)` }}
                                >
                                    <p className="tw-m-0 tw-text-text-muted">{pointLabel(points[hovered], hourly)}</p>
                                    <p className="tw-m-0 tw-flex tw-justify-between tw-gap-4"><span>This period</span><span className="tw-tabular-nums">{format(current[hovered])}</span></p>
                                    {showPrevious && <p className="tw-m-0 tw-flex tw-justify-between tw-gap-4 tw-text-text-secondary"><span>Comparison</span><span className="tw-tabular-nums">{format(previous[hovered])}</span></p>}
                                </div>
                            </>
                        )}
                        <div className="tw-absolute tw-inset-0 tw-flex" onMouseLeave={() => setHover(null)} aria-hidden="true">
                            {points.map((p, i) => <div key={p.key} className="tw-flex-1 tw-h-full" onMouseEnter={() => setHover(i)} />)}
                        </div>
                    </div>
                    <div className="tw-flex tw-justify-between tw-mt-2 tw-text-xs tw-text-text-muted" style={{ marginLeft: 48, marginRight: 4 }}>
                        <span>{pointLabel(points[0], hourly)}</span>
                        {n > 2 && <span>{pointLabel(points[Math.floor(n / 2)], hourly)}</span>}
                        {n > 1 && <span>{pointLabel(points[n - 1], hourly)}</span>}
                    </div>
                    <table className="tw-sr-only">
                        <caption>{title}</caption>
                        <thead><tr><th>Date</th><th>This period</th>{showPrevious && <th>Comparison period</th>}</tr></thead>
                        <tbody>
                            {points.map((p, i) => (
                                <tr key={p.key}><td>{pointLabel(p, hourly)}</td><td>{format(current[i])}</td>{showPrevious && <td>{format(previous[i])}</td>}</tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </Card>
    );
}

function Dot({ left, top }) {
    return (
        <div className="tw-absolute tw-bg-data tw-rounded-full tw-pointer-events-none" style={{ left: `${left}%`, top: `${top}%`, width: 10, height: 10, margin: "-5px 0 0 -5px", boxShadow: "0 0 0 2px rgb(var(--c-bg-raised))" }} />
    );
}
