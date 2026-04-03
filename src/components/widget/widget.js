import "./Widget.css";
import Line from "../Charts/Line";
import { useState } from "react";
import { useUserLocale } from "../../Functions/userLocale";

function formatPeriodLabel(fromDate, toDate, locale) {
    if (!fromDate || !toDate) return null;
    try {
        if (fromDate === toDate) {
            return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(fromDate));
        }
        const a = new Date(fromDate);
        const b = new Date(toDate);
        return `${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(a)} – ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(b)}`;
    } catch {
        return null;
    }
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
    const locale = useUserLocale();
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

    if (props?.styleType == "small"){
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString(locale);
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
            displayValue = props?.totalNumber?.Total?.toLocaleString(locale);
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        const daily = props?.totalNumber?.dailyNum;
        const hasChart = Array.isArray(daily) && daily.length > 0;
        const periodLabel = hasChart ? formatPeriodLabel(props?.fromDate, props?.toDate, locale) : null;
        const seriesSummary = hasChart ? summarizeDailySeries(daily) : null;
        const peakDateStr =
            seriesSummary?.peakDate != null
                ? (() => {
                      try {
                          return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
                              new Date(seriesSummary.peakDate)
                          );
                      } catch {
                          return null;
                      }
                  })()
                : null;
        const lineTitle = props?.lineTitle || "Consents giving";

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
                                        {seriesSummary.peak.toLocaleString(locale)}
                                    </span>
                                    {peakDateStr ? (
                                        <span className="widget__insight-sub">{peakDateStr}</span>
                                    ) : null}
                                </div>
                                <div className="widget__insight">
                                    <span className="widget__insight-label">Daily avg</span>
                                    <span className="widget__insight-value">
                                        {seriesSummary.avg.toLocaleString(locale)}
                                    </span>
                                    <span className="widget__insight-sub">
                                        {seriesSummary.days} {seriesSummary.days === 1 ? "day" : "days"}
                                    </span>
                                </div>
                                {seriesSummary.vsPrevPct != null ? (
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
                        <div className="widget__chart-wrap">
                            <Line
                                title={lineTitle}
                                data={daily}
                                data2={daily.previousPeriod}
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