import "./Widget.css";
import Line from "../Charts/Line";
import { useState } from "react";

function formatPeriodLabel(fromDate, toDate) {
    if (!fromDate || !toDate) return null;
    try {
        if (fromDate === toDate) {
            return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(fromDate));
        }
        const a = new Date(fromDate);
        const b = new Date(toDate);
        return `${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(a)} – ${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(b)}`;
    } catch {
        return null;
    }
}

function formatCmpArrow(value, unit) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const n = Number(value);
    const arrow = n > 0 ? "\u2191" : n < 0 ? "\u2193" : "\u2194";
    const body = Math.abs(n).toLocaleString("de-DE", { maximumFractionDigits: 1 });
    const sign = n > 0 ? "+" : n < 0 ? "\u2212" : "";
    return `${arrow} ${sign}${body}${unit}`;
}

/** Derive peak, average, and comparison to embedded previousPeriod (same shape Line chart uses). */
function summarizeDailySeries(daily) {
    if (!Array.isArray(daily) || daily.length === 0) return null;
    let peak = -Infinity;
    let peakDate = null;
    let sum = 0;
    let prevSum = 0;
    for (const d of daily) {
        const n = Number(d?.num);
        const v = Number.isFinite(n) ? n : 0;
        sum += v;
        if (v > peak) {
            peak = v;
            peakDate = d?.date;
        }
        const pn = Number(d?.previousPeriod?.num);
        prevSum += Number.isFinite(pn) ? pn : 0;
    }
    if (!Number.isFinite(peak) || peak < 0) peak = 0;
    const avg = daily.length ? Math.round(sum / daily.length) : 0;
    let vsPrevPct = null;
    if (prevSum > 0) {
        vsPrevPct = Math.round(((sum - prevSum) / prevSum) * 100);
    }
    return { peak, peakDate, avg, sum, prevSum, vsPrevPct, days: daily.length };
}

export default function Widget(props) {
    const [explainerVisible, setExplainer] = useState(false);
    const explainer = props?.explainer ? props.explainer : null;

    const overViewTotal = (props?.overviewTotal) ? " overviewTotal" : " overviewDistribution";
    const className = (props?.class) ? props.class : "";
    const style = (props?.style) ? props.style : {};
    const percentage = (props?.percentage) ? props.percentage : null;

    const details = (props?.details) ? props.details : null;
    const kpi = (props?.kpi) ? props.kpi : false;
    const change = (props?.change) ? props.change : null;
    const relativeDrop = (props?.relativeDrop) ? props.relativeDrop : null;

    const activeUsers = (props?.activeUsers) ? props.activeUsers : null;
    const compareOn = Boolean(props.compareOn);

    if (props?.styleType == "small"){
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        const sentiment =
            relativeDrop?.relativeDrop > 20
                ? "negative"
                : relativeDrop?.relativeDrop <= 20 && relativeDrop?.relativeDrop >= -20
                  ? "neutral"
                  : relativeDrop?.relativeDrop < -20
                    ? "positive"
                    : "";
        const uniqueVisitors = activeUsers > 3 ?
            activeUsers.slice(0, -2) + "k" :
            activeUsers > 6 ?
            activeUsers.slice(0, -5) + "m" :
            activeUsers > 9 ?
            activeUsers.slice(0, -8) + "b" :
            activeUsers;

        return (
            <div
                className={`key-highlight-widget small-widget ${kpi ? "kpi" : ""} ${sentiment}`.trim()}
                role={details ? "button" : undefined}
                tabIndex={details ? 0 : undefined}
                onClick={() => {
                    if (details) document.querySelector(".details-dialog")?.showModal?.();
                }}
                onKeyDown={(e) => {
                    if (details && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        document.querySelector(".details-dialog")?.showModal?.();
                    }
                }}
            >
                <p
                    className={`small-widget-type ${explainer?.exist ? "has-explainer" : ""}`}
                    onMouseEnter={() => explainer?.exist && setExplainer(true)}
                    onMouseLeave={() => explainer?.exist && setExplainer(false)}
                >
                    {props?.type}
                </p>
                <h3 className="small-widget-number">
                    {displayValue}{" "}
                    {activeUsers ? (
                        <span className="small-widget-percentage">{`${
                            // Shorten to 2 digits and at k or m if needed
                            uniqueVisitors
                        } unique`}</span>
                    ) : null}{" "}
                    {change ? (
                        <span className="small-widget-percentage">{`${change?.change > 0 ? "+" : "-"}${Math.abs(change?.change)}pp`}</span>
                    ) : null}{" "}
                    {percentage ? <span className="small-widget-percentage">{`${percentage}% accepted`}</span> : null}
                </h3>
                {compareOn && (props.comparisonDelta != null || props.comparisonRelative != null) ? (
                    <div className="small-widget-comparison" aria-label="Comparison vs baseline period">
                        {props.comparisonDelta != null ? (
                            <span
                                className={
                                    "small-widget-comparison__line small-widget-comparison__line--pp " +
                                    (Number(props.comparisonDelta) > 0
                                        ? "is-up"
                                        : Number(props.comparisonDelta) < 0
                                          ? "is-down"
                                          : "is-flat")
                                }
                            >
                                {formatCmpArrow(props.comparisonDelta, "pp")}
                            </span>
                        ) : null}
                        {props.comparisonRelative != null ? (
                            <span
                                className={
                                    "small-widget-comparison__line small-widget-comparison__line--rel " +
                                    (Number(props.comparisonRelative) > 0
                                        ? "is-up"
                                        : Number(props.comparisonRelative) < 0
                                          ? "is-down"
                                          : "is-flat")
                                }
                            >
                                {formatCmpArrow(props.comparisonRelative, "%")}
                            </span>
                        ) : null}
                    </div>
                ) : null}
                {explainer?.exist && explainerVisible ? (
                    <div className="explainer-tooltip" role="tooltip">
                        <span className="explainer-tooltip-text">{explainer.content}</span>
                    </div>
                ) : null}
            </div>
        );
    } else {   
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        const daily = props?.totalNumber?.dailyNum;
        const hasChart = Array.isArray(daily) && daily.length > 0;
        const periodLabel = hasChart ? formatPeriodLabel(props?.fromDate, props?.toDate) : null;
        const seriesSummary = hasChart ? summarizeDailySeries(daily) : null;
        const peakDateStr =
            seriesSummary?.peakDate != null
                ? (() => {
                      try {
                          return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
                              new Date(seriesSummary.peakDate)
                          );
                      } catch {
                          return null;
                      }
                  })()
                : null;
        const lineTitle = props?.lineTitle || "Consents giving";
        const comparisonObj = props?.totalNumber?.comaprison ?? props?.totalNumber?.comparison;
        const comparisonRows = [
            { label: "Accept", deltaKey: "accepted", relKey: "acceptedRelativeDrop" },
            { label: "Essential", deltaKey: "declined", relKey: "declinedRelativeDrop" },
            { label: "Marketing", deltaKey: "marketing", relKey: "marketingRelativeDrop" },
            { label: "Functional", deltaKey: "functional", relKey: "functionalRelativeDrop" },
            { label: "Statics", deltaKey: "statics", relKey: "staticsRelativeDrop" },
        ];
        const showInlineComparison =
            compareOn &&
            comparisonObj != null &&
            typeof comparisonObj === "object" &&
            comparisonRows.some((r) => comparisonObj[r.deltaKey] != null || comparisonObj[r.relKey] != null);

        return (
            <div
                className={`${className || ""} widget${overViewTotal}${hasChart ? " widget--with-chart" : ""}`.trim()}
                style={style}
            >
                <h2 className="overvieTotal-num">
                    {displayValue}{" "}
                    {activeUsers ? (
                        <span className="small-widget-percentage">{`${activeUsers} unique visitors`}</span>
                    ) : null}
                </h2>
                <p>{props?.type}</p>
                {hasChart ? (
                    <>
                        {periodLabel ? (
                            <p className="widget__period" title="Selected reporting range">
                                {periodLabel}
                            </p>
                        ) : null}
                        {seriesSummary ? (
                            <div className="widget__insights" aria-label="Trend summary">
                                <div className="widget__insight">
                                    <span className="widget__insight-label">Peak day</span>
                                    <span className="widget__insight-value">
                                        {seriesSummary.peak.toLocaleString("de-DE")}
                                    </span>
                                    {peakDateStr ? (
                                        <span className="widget__insight-sub">{peakDateStr}</span>
                                    ) : null}
                                </div>
                                <div className="widget__insight">
                                    <span className="widget__insight-label">Daily avg</span>
                                    <span className="widget__insight-value">
                                        {seriesSummary.avg.toLocaleString("de-DE")}
                                    </span>
                                    <span className="widget__insight-sub">
                                        {seriesSummary.days} {seriesSummary.days === 1 ? "day" : "days"}
                                    </span>
                                </div>
                                {compareOn && seriesSummary.vsPrevPct != null ? (
                                    <div
                                        className={`widget__insight widget__insight--trend ${
                                            seriesSummary.vsPrevPct >= 0
                                                ? "widget__insight--up"
                                                : "widget__insight--down"
                                        }`}
                                    >
                                        <span className="widget__insight-label">vs previous</span>
                                        <span className="widget__insight-value">
                                            {seriesSummary.vsPrevPct >= 0 ? "+" : ""}
                                            {seriesSummary.vsPrevPct}%
                                        </span>
                                        <span className="widget__insight-sub">period total</span>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        {showInlineComparison ? (
                            <div className="widget__comparison-inline" aria-label="Share change vs comparison period">
                                {comparisonRows.map((row) => {
                                    const d = comparisonObj[row.deltaKey];
                                    const r = comparisonObj[row.relKey];
                                    if (d == null && r == null) return null;
                                    return (
                                        <div className="widget__comparison-chip" key={row.deltaKey}>
                                            <span className="widget__comparison-chip-label">{row.label}</span>
                                            {d != null ? (
                                                <span
                                                    className={
                                                        "widget__comparison-chip-metric " +
                                                        (Number(d) > 0 ? "is-up" : Number(d) < 0 ? "is-down" : "is-flat")
                                                    }
                                                >
                                                    {formatCmpArrow(d, "pp")}
                                                </span>
                                            ) : null}
                                            {r != null ? (
                                                <span
                                                    className={
                                                        "widget__comparison-chip-metric widget__comparison-chip-metric--rel " +
                                                        (Number(r) > 0 ? "is-up" : Number(r) < 0 ? "is-down" : "is-flat")
                                                    }
                                                >
                                                    {formatCmpArrow(r, "%")}
                                                </span>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                        <div className="widget__chart-wrap">
                            <Line
                                title={lineTitle}
                                data={daily}
                                data2={daily}
                                compareEnabled={compareOn}
                                fromDate={props?.fromDate}
                                toDate={props?.toDate}
                            />
                        </div>
                    </>
                ) : null}
            </div>
        );
    }
}