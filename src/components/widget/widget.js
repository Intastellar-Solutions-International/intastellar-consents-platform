import "./Widget.css";
import Line from "../Charts/Line";
import { useState } from "react";
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

    if (props?.styleType == "small"){
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        return (
            <>
                <div className={`key-highlight-widget small-widget ${(kpi) ? "kpi" : ""} ${(relativeDrop?.relativeDrop > 20) ? "negative" : (relativeDrop?.relativeDrop <= 20 && relativeDrop?.relativeDrop >= -20) ? "neutral" : (relativeDrop?.relativeDrop < -20) ? "positive" : ""}`} onClick={() => {
                    (details && details !== null) ? document.querySelector('.details-dialog').showModal() : null;
                }}>
                    <p className={`small-widget-type ${(explainer?.exist) ? "has-explainer" : ""}`}  onMouseEnter={() => {
                        (explainer?.exist) ? setExplainer(true) : null;
                    }} onMouseLeave={() => {
                        (explainer?.exist) ? setExplainer(false) : null;
                    }}>{props?.type}</p>
                    <h3 className="small-widget-number">{displayValue} {change ? <span className="small-widget-percentage">{`${change?.change > 0 ? "+" : "-"
                    }${Math.abs(change?.change)}pp`}</span> : ""} {percentage ? <span className="small-widget-percentage">{`${percentage}% accepted`}</span> : ""}</h3>
                    {explainer?.exist && explainerVisible ? 
                        <div className="explainer-tooltip">
                            <span className="explainer-tooltip-text">
                                {explainer.content}
                            </span>
                        </div>
                    : ""}
                </div>
            </>
        );
    } else {   
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        return (
            <div className={className + " widget" + overViewTotal} style={style}>
                <h2 className="overvieTotal-num">{displayValue}</h2>
                <p>{props?.type}</p>
                {
                    Array.isArray(props?.totalNumber?.dailyNum) && props?.totalNumber?.dailyNum.length > 0
                        ? <Line title="Consents giving" data={props?.totalNumber?.dailyNum} data2={props?.totalNumber?.dailyNum.previousPeriod} fromDate={props?.fromDate} toDate={props?.toDate} />
                        : null
                }
            </div>
        )
    }
}