const { useState, useEffect, useRef, useContext } = React;
import Widget from "./widget";
import useFetch from "../../Functions/FetchHook";
import { Loading } from "./Loading";
import ErrorBoundary from "../Error/ErrorBoundary";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import Pie from "../Charts/Pie";
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

    const dataset = data?.map((item) => {
        return {
            name: item.design.toUpperCase(),
            value: item.bannerCount
        }
    });

    return (
        <>
            <div className="grid-container grid-3">
                {(loading) ? <Loading /> : <ErrorBoundary>
                    {
                        <Pie data={
                            dataset
                        } />
                    }
                </ErrorBoundary>
                }
            </div>
        </>
    )
}