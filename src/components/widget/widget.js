import "./Widget.css";
import Line from "../Charts/Line";
export default function Widget(props) {
    const overViewTotal = (props?.overviewTotal) ? " overviewTotal" : " overviewDistribution";
    const className = (props?.class) ? props.class : "";

    return (
        <div className={className + " widget" + overViewTotal}>
            <h2 className="overvieTotal-num">{(props?.totalNumber?.Total) ? props?.totalNumber?.Total?.toLocaleString("de-DE") : props?.totalNumber}</h2>
            <p>{props?.type}</p>
            {
                (props?.totalNumber?.dailyNum) ? <Line title="Consents giving" data={props?.totalNumber?.dailyNum} data2={props?.totalNumber?.dailyNum.previousPeriod} fromDate={props?.fromDate} toDate={props?.toDate} /> : null
            }
        </div>
    )
}