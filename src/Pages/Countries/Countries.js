const { useState, useEffect, useRef, useContext } = React;
import Select from "../../Components/SelectInput/Selector.js";
import NotAllowed from "../../Components/NotAllowed/NotAllowed";
import { isJson } from "../../Functions/isJson.js";
import AddDomain from "../../Components/AddDomain/AddDomain";
import useFetch from "../../Functions/FetchHook";
import Unknown from "../../Components/Error/Unknown.js";
import { Loading } from "../../Components/widget/Loading.js";
import API from "../../API/api.js";
import "./Style.css";
import SideNav from "../../Components/Header/SideNav.js";
import { DomainContext, OrganisationContext } from "../../App.js";
import { reportsLinks } from "../Reports/Reports.js";

export default function UserConsents(props) {
    document.title = "Countries | Intastellar Consents | CMP";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const organisations = props.organisations;


    API.gdpr.getDomainsUrl.headers.Domains = currentDomain;
    const [getDomainsUrlLoading, getDomainsUrlData, getDomainsUrlError, getDomainsUrlGetUpdated] = useFetch(5, API.gdpr.getDomainsUrl.url, API.gdpr.getDomainsUrl.method, API.gdpr.getDomainsUrl.headers);
    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: "1" }}>
                <section style={{ padding: "40px", backgroundColor: "rgb(218, 218, 218)", color: "#626262" }}>
                    <h1>Reports</h1>
                    <h2 style={{ display: "flex" }}>Countries</h2>
                </section>
                <div className="dashboard-content">

                </div>
            </article>
        </>
    )
}