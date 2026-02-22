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

    if (props?.styleType == "small"){
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        return (
            <>
                <div className="key-highlight-widget small-widget" onClick={() => {
                    (details && details !== null) ? document.querySelector('.details-dialog').showModal() : null;
                }}>
                    <p className={`small-widget-type ${(explainer?.exist) ? "has-explainer" : ""}`}  onMouseEnter={() => {
                        (explainer?.exist) ? setExplainer(true) : null;
                    }} onMouseLeave={() => {
                        (explainer?.exist) ? setExplainer(false) : null;
                    }}>{props?.type}</p>
                    <h3 className="small-widget-number">{displayValue} {percentage ? <span className="small-widget-percentage">{`${percentage}% accepted`}</span> : ""}</h3>
                    {explainer?.exist && explainerVisible ? 
                        <div className="explainer-tooltip">
                            <span className="explainer-tooltip-text">
                                {explainer.content}
                            </span>
                        </div>
                    : ""}
                </div>
                {
                    (details && details !== null) ? <dialog className="details-dialog" modal >
                        <button className="details-close-button" onClick={() => document.querySelector('.details-dialog').close()}>Close</button>
                        <div className="details-content">
                            <section className="grid-container grid-2">
                                <article>
                                    <h2>General Overview</h2>
                                    <section className="grid-container grid-2">
                                        {
                                            details != null && Object.keys(details ?? {}).map((key, index) => {
                                                return <div key={index} className="details-item">
                                                    <h4>{key}</h4>
                                                        {
                                                            typeof details?.[key] === 'object' ? <p>{details?.[key]?.count.toLocaleString("de-DE")}</p> : <p>{details?.[key]?.count.toLocaleString("de-DE")}</p>
                                                        }
                                                        {
                                                            typeof details?.[key] === 'object' ? <p>{details?.[key]?.p90.toLocaleString("de-DE")}</p> : <p>{details?.[key]?.p90.toLocaleString("de-DE")}</p>
                                                        }
                                                        {
                                                            typeof details?.[key] === 'object' ? <p>{details?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p> : <p>{details?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p>
                                                        }
                                                </div>
                                            })
                                        }
                                    </section>
                                </article>
                                <article>
                                    <h2>Time to Decision</h2>
                                    <section className="grid-container grid-2">
                                        {
                                            details != null && Object.keys(details?.timeToDecision ?? {}).map((key, index) => {
                                                return <div key={index} className="details-item">
                                                    <h4>{key}</h4>
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.count.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.count.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.p90.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.p90.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.percentageUnder1s.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.percentageUnder1s.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.countOver10s.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.countOver10s.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.countUnder1s.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.countUnder1s.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.timeToDecision?.[key] === 'object' ? <p>{details?.timeToDecision?.[key]?.percentageUnder1s.toLocaleString("de-DE")}</p> : <p>{details?.timeToDecision?.[key]?.percentageUnder1s.toLocaleString("de-DE")}</p>
                                                    }
                                                </div>
                                            })
                                        }
                                    </section>
                                </article>
                                <article>
                                    <h2>Device Overview</h2>
                                    <section className="grid-container grid-2">
                                        {
                                            details != null && Object.keys(details?.deviceType ?? {}).map((key, index) => {
                                                return <div key={index} className="details-item">
                                                    <h4>{key}</h4>
                                                    {
                                                        typeof details?.deviceType?.[key] === 'object' ? <p>{details?.deviceType?.[key]?.count.toLocaleString("de-DE")}</p> : <p>{details?.deviceType?.[key]?.count.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.deviceType?.[key] === 'object' ? <p>{details?.deviceType?.[key]?.p90.toLocaleString("de-DE")}</p> : <p>{details?.deviceType?.[key]?.p90.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.deviceType?.[key] === 'object' ? <p>{details?.deviceType?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p> : <p>{details?.deviceType?.[key]?.percentageOver10s.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.deviceType?.[key] === 'object' ? <p>{details?.deviceType?.[key]?.count.toLocaleString("de-DE")}</p> : <p>{details?.deviceType?.[key]?.count.toLocaleString("de-DE")}</p>
                                                    }
                                                    {
                                                        typeof details?.deviceType?.[key] === 'object' ? <p>{details?.deviceType?.[key]?.percentageUnder1s.toLocaleString("de-DE")}</p> : <p>{details?.deviceType?.[key]?.percentageUnder1s.toLocaleString("de-DE")}</p>
                                                    }
                                                </div>
                                            })
                                        }
                                    </section>
                                </article>
                            </section>
                        </div>
                    </dialog> : null
                }
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