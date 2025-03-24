import { Loading } from "../widget/Loading";
import Widget from "../widget/widget";
import Pie from "../Charts/Pie";

export default function PremiumTier(props) {
    const loading = props.loading;
    const activeData = props.activeData;
    const fromDate = props.fromDate;
    const toDate = props.toDate;

    return <>
        {(loading) ? <Loading /> : <Widget totalNumber={activeData} fromDate={fromDate} toDate={toDate} type="Consents given" />}
        {/* {
            (loading) ? <Loading /> :
                (activeData) ? <Line data={activeData?.dailyNum} data2={activeData?.dailyNum} fromDate={fromDate} toDate={toDate} title={"Daily user interactions"} /> : null

        } */}
        {/* <div className="grid-container grid-3">
                {
                    (loading) ? <Loading /> : <Pie data={[
                        {x: "Accepted", value: activeData?.interactions_number.accept},
                        {x: "Declined", value: activeData?.interactions_number.decline},
                        {x: "Only Marketing", value: activeData?.interactions_number.marketing},
                        {x: "Only Functional", value: activeData?.interactions_number.functional},
                        {x: "Only Statics", value: activeData?.interactions_number.statics}
                    ]} />
                }
                {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted cookies" />}
                {(loading) ? <Loading /> : <Widget totalNumber={ activeData?.Declined.toLocaleString("de-DE") + "%"} type="Declined cookies" /> }
            </div> */}
        <div className="grid-container grid-5">
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted cookies" />}
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Declined.toLocaleString("de-DE") + "%"} type="Declined cookies" />}
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Marketing.toLocaleString("de-DE") + "%"} type="Accepted Marketing" />}
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Functional.toLocaleString("de-DE") + "%"} type="Accepted Functional" />}
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Statics.toLocaleString("de-DE") + "%"} type="Accepted Statics" />}
        </div>
    </>
}