import "./Widget.css";
import Line from "../Charts/Line";
export default function Widget(props) {

    console.log("Widget props:", props.totalNumber, typeof props.totalNumber);

    const overViewTotal = (props?.overviewTotal) ? " overviewTotal" : " overviewDistribution";
    const className = (props?.class) ? props.class : "";

    if (props?.styleType == "small"){
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        return (
            <div className="key-highlight-widget small-widget">
                <p className="small-widget-type">{props?.type}</p>
                <h3 className="small-widget-number">{displayValue}</h3>
            </div>
        );
    } else {
        let displayValue = "";
        if (typeof props.totalNumber === "object" && props?.totalNumber?.Total !== undefined && props?.totalNumber?.Total !== null) {
            displayValue = props?.totalNumber?.Total?.toLocaleString("de-DE");
        } else if (typeof props.totalNumber !== "object" && props.totalNumber !== undefined && props.totalNumber !== null) {
            displayValue = props.totalNumber;
        }
        return (
            <div className={className + " widget" + overViewTotal}>
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