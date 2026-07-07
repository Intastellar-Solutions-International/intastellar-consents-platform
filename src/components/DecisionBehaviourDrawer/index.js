import { useEffect } from "react";
import "./Style.css";
import Widget from "../../Components/widget/widget.js";
import Select from "../../Components/SelectInput/Selector.js";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";

export function DecisionBehaviourDrawer({ isOpen, onClose, timeToDecision, onChangeRegion, timeToDecisionSlice, fromDate, toDate }) {
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        lockBodyScroll();
        return () => {
            window.removeEventListener("keydown", onKey);
            unlockBodyScroll();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const fmt = (v) => (v == null || v === 0 ? "N/A" : v.toLocaleString("de-DE"));
    const details = timeToDecisionSlice ? {
        avg: fmt(timeToDecisionSlice.avg) + (timeToDecisionSlice.avg ? "s" : ""),
        median: fmt(timeToDecisionSlice.median) + (timeToDecisionSlice.median ? "s" : ""),
        p90: fmt(timeToDecisionSlice.p90) + (timeToDecisionSlice.p90 ? "s" : ""),
        percentageOver10s: fmt(timeToDecisionSlice.percentageOver10s) + (timeToDecisionSlice.percentageOver10s ? "%" : ""),
        percentageUnder1s: fmt(timeToDecisionSlice.percentageUnder1s) + (timeToDecisionSlice.percentageUnder1s ? "%" : ""),
        count: timeToDecisionSlice.count?.toLocaleString("de-DE"),
        countOver10s: timeToDecisionSlice.countOver10s?.toLocaleString("de-DE"),
        countUnder1s: timeToDecisionSlice.countUnder1s?.toLocaleString("de-DE"),
        deviceType: timeToDecisionSlice.deviceType,
    } : null;

    return (
        <>
            <div className="behaviour-drawer-backdrop" onClick={onClose} aria-hidden />
            <aside
                className="behaviour-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="behaviour-drawer-title"
            >
                <header className="behaviour-drawer__header">
                    <div className="behaviour-drawer__header-text">
                        <h2 id="behaviour-drawer-title" className="behaviour-drawer__title">Decision behaviour</h2>
                        <p className="behaviour-drawer__sub">How long visitors take to interact with the consent banner</p>
                    </div>
                    <button
                        type="button"
                        className="behaviour-drawer__close"
                        onClick={onClose}
                        aria-label="Close decision behaviour breakdown"
                    >
                        ×
                    </button>
                </header>

                <div className="behaviour-drawer__body">
                    <Select
                        type="timeToDecision"
                        items={["global", "eu", "noneEU"]}
                        labels={["Global", "EU", "Non-EU"]}
                        defaultValue={timeToDecision}
                        onChange={onChangeRegion}
                    />

                    {timeToDecisionSlice ? (
                        <>
                            <p className="behaviour-drawer__count">
                                {timeToDecisionSlice.count?.toLocaleString("de-DE")} interactions in this period
                            </p>
                            <div className="behaviour-drawer__widgets">
                                <Widget
                                    styleType="small"
                                    totalNumber={timeToDecisionSlice.median === 0 ? "N/A" : timeToDecisionSlice.median.toLocaleString("de-DE") + "s"}
                                    explainer={{ exist: true, title: "Median time to decision", content: "Median time taken by users to decide on consent." }}
                                    type="Median time to decision"
                                    fromDate={fromDate}
                                    toDate={toDate}
                                    details={details}
                                />
                                <Widget
                                    styleType="small"
                                    totalNumber={timeToDecisionSlice.p90 === 0 ? "N/A" : timeToDecisionSlice.p90.toLocaleString("de-DE") + "s"}
                                    explainer={{ exist: true, title: "90th percentile time to decision", content: "Time taken by 90% of users to decide on consent." }}
                                    type="P90 decision time"
                                    fromDate={fromDate}
                                    toDate={toDate}
                                    details={details}
                                />
                                <Widget
                                    styleType="small"
                                    totalNumber={timeToDecisionSlice.avg === 0 ? "N/A" : timeToDecisionSlice.avg.toLocaleString("de-DE") + "s"}
                                    explainer={{ exist: true, title: "Average time to decision", content: "Average time taken by users to decide on consent." }}
                                    type="Average time to decision"
                                    fromDate={fromDate}
                                    toDate={toDate}
                                    details={details}
                                />
                                <Widget
                                    styleType="small"
                                    totalNumber={timeToDecisionSlice.percentageOver10s === 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%"}
                                    explainer={{ exist: true, title: "Decided in more than 10 seconds", content: "Percentage of users who took more than 10 seconds to decide on consent." }}
                                    type=">10s time to decision"
                                    fromDate={fromDate}
                                    toDate={toDate}
                                    details={details}
                                />
                                <Widget
                                    styleType="small"
                                    totalNumber={timeToDecisionSlice.percentageUnder1s === 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%"}
                                    explainer={{ exist: true, title: "Decided in less than 1 second", content: "Percentage of users who took less than 1 second to decide on consent." }}
                                    type="<1s time to decision"
                                    fromDate={fromDate}
                                    toDate={toDate}
                                    details={details}
                                />
                            </div>
                        </>
                    ) : (
                        <p className="behaviour-drawer__empty">No time-to-decision data for the selected region.</p>
                    )}
                </div>
            </aside>
        </>
    );
}
