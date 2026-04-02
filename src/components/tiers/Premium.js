import { Loading } from "../widget/Loading";
import Widget from "../widget/widget";
import ErrorBoundary from "../Error/ErrorBoundary";
import DeviceTypeInteractions from "../Charts/DeviceTypeInteractions";

export default function PremiumTier(props) {
    const loading = props.loading;
    const activeData = props.activeData;
    const fromDate = props.fromDate;
    const toDate = props.toDate;

    const demoMode = props.demoMode;

    return <>
        {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData} activeUsers={activeData?.activeUsers.toLocaleString("de-DE")} fromDate={fromDate} toDate={toDate} type="Consents given" /></ErrorBoundary>}
        <div className="grid-container grid-5">
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted all cookies" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Declined.toLocaleString("de-DE") + "%"} type="Only essential cookies accepted" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Marketing.toLocaleString("de-DE") + "%"} type="Accepted Marketing" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Functional.toLocaleString("de-DE") + "%"} type="Accepted Functional" /></ErrorBoundary>}
            {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={activeData?.Statics.toLocaleString("de-DE") + "%"} type="Accepted analytical cookies" /></ErrorBoundary >}
        </div>
        <p>All percentages are calculated based on the total number of consent interactions in the selected period. Category-level percentages are calculated independently and may overlap.</p>
        <div className="grid-container">
            {
                (loading) ? <Loading /> :
                (activeData) ?
                <ErrorBoundary>
                    <DeviceTypeInteractions
                        title="Consent interactions by device type"
                        activeData={activeData}
                        fromDate={fromDate}
                        toDate={toDate}
                        demoMode={demoMode}
                    />  
                </ErrorBoundary>
                : null
            }
        </div>
    </>
}