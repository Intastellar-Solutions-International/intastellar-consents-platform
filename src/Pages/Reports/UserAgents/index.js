const { useState, useEffect, useRef, useContext } = React;
import { reportsLinks } from "../Reports"
import SideNav from "../../../Components/Header/SideNav";
import useFetch from "../../../Functions/FetchHook";
import API from "../../../API/api";
const useParams = window.ReactRouterDOM.useParams;
export default function UserAgents() {
    document.title = "Reports - User agents | Intastellar Consents";
    const { handle, id } = useParams();

    API[id].getDevices.headers.Domains = "combined view";
    API[id].getDevices.headers.FromDate = "2021-01-01";
    API[id].getDevices.headers.ToDate = "2021-12-31";

    const [getDomainsUrlLoading, getDomainsUrlData, getDomainsUrlError, getDomainsUrlGetUpdated] = useFetch(5, API[id].getDevices.url, API[id].getDevices.method, API[id].getDevices.headers);

    return <>
        <SideNav links={reportsLinks} title="Reports" />
        <div className="dashboard-content">
            <h1>Reports - User agents</h1>
            {/* {
                (!getDomainsUrlLoading && !getDomainsUrlError) ? getDomainsUrlData.map((d, key) => {
                    return <div key={key}>
                        <p>{d.useragent}</p>
                    </div>
                }) : null
            } */}
        </div>
    </>
}