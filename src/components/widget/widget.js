import "./Widget.css";
import Line from "../Charts/Line";
export default function Widget(props) {
    const overViewTotal = (props?.overviewTotal) ? " overviewTotal" : " overviewDistribution";
    return (
        <>
            <div className={"widget" + overViewTotal}>
                <h2 className="overvieTotal-num">{(props?.totalNumber?.Total) ? props?.totalNumber?.Total?.toLocaleString("de-DE") : props?.totalNumber}</h2>
                <p>{props?.type}</p>
                {
                    (props?.totalNumber?.dailyNum) ? <Line data={props?.totalNumber?.dailyNum} data2={props?.totalNumber?.dailyNum} fromDate={props?.fromDate} toDate={props?.toDate} title={"Daily user interactions"} /> : null
                }
            </div>
        </>
    )
}