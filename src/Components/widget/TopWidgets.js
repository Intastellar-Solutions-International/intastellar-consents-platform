const { useState, useEffect, useRef, useContext } = React;
import Widget from "./widget";
import useFetch from "../../Functions/FetchHook";
import { Loading } from "./Loading";
import ErrorBoundary from "../Error/ErrorBoundary";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import appStorage from '../../Functions/storage.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function TopWidgets(props) {

    const APIUrl = props.API.url;
    const APIMethod = props.API.method;
    const APIHeader = props.API.header;

    const [loading, data, error, updated] = useFetch(30, APIUrl, APIMethod, APIHeader);
    if (data === "Err_Login_Expired") {
        appStorage.removeItem("globals");
        window.location.href = "/login";
        return;
    }

    const chartRef = useRef(ChartJS);
    const labels = ['January', 'February', 'March', 'April', 'May', 'June', 'July'];

    return (
        <>
            <div className="grid-container grid-3">
                {(loading) ? <Loading /> : <ErrorBoundary>
                    <Widget overviewTotal={true} totalNumber={data?.Total?.toLocaleString("de-DE")} type="Website" />
                </ErrorBoundary>
                }
                {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={data?.JS?.toLocaleString("de-DE") + "%"} type="JavaScript" /></ErrorBoundary>}
                {(loading) ? <Loading /> : <ErrorBoundary><Widget totalNumber={data?.WP?.toLocaleString("de-DE") + "%"} type="WordPress" /></ErrorBoundary>}
            </div>
        </>
    )
}