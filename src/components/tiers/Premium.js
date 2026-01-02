import { Loading } from "../widget/Loading";
import Widget from "../widget/widget";
import BarChart from "../Charts/BarChart";
import ErrorBoundary from "../Error/ErrorBoundary";

export default function PremiumTier(props) {
    const loading = props.loading;
    const activeData = props.activeData;
    const fromDate = props.fromDate;
    const toDate = props.toDate;

    return <>
        {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData} fromDate={fromDate} toDate={toDate} type="Consents given" /></ErrorBoundary>}
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
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted all cookies" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Declined.toLocaleString("de-DE") + "%"} type="Rejected non-essential" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Marketing.toLocaleString("de-DE") + "%"} type="Accepted Marketing" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Functional.toLocaleString("de-DE") + "%"} type="Accepted Functional" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Statics.toLocaleString("de-DE") + "%"} type="Accepted analytical cookies" /></ErrorBoundary >}
        </div>
        <p>The data is based of the total number of consents given.</p>
        <div className="grid-container">
            <ErrorBoundary>
                <BarChart title="Consents interactions by Device Type" data={[
                    { x: "Mobile", value: activeData?.device_type.mobile, color: "#FF6384" },
                    { x: "Desktop", value: activeData?.device_type.desktop, color: "#36A2EB" },
                    { x: "Tablet", value: activeData?.device_type.tablet, color: "#FFCE56" },
                ]} fromDate={fromDate} toDate={toDate} />
            </ErrorBoundary>
        </div>
    </>
}