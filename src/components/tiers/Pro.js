import { Loading } from "../widget/Loading";
import Widget from "../widget/widget";
import Pie from "../Charts/Pie";

export default function ProTier(props) {
    const loading = props.loading;
    const activeData = props.activeData;
    return <>
        {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Total.toLocaleString("de-DE")} type="Total interactions" />}
        <div className="grid-container grid-3">
            {
                (loading) ? <Loading /> : <Pie data={[
                    { x: "Accepted", value: activeData?.interactions_number.accept },
                    { x: "Declined", value: activeData?.interactions_number.decline },
                    { x: "Only Marketing", value: activeData?.interactions_number.marketing },
                    { x: "Only Functional", value: activeData?.interactions_number.functional },
                    { x: "Only Statistics", value: activeData?.interactions_number.statics }
                ]} />
            }
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted cookies" />}
            {(loading) ? <Loading /> : <Widget totalNumber={activeData?.Declined.toLocaleString("de-DE") + "%"} type="Declined cookies" />}
        </div>
    </>
}