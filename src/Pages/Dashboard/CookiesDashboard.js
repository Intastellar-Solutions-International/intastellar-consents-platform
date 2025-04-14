const { useState, useEffect, useRef, useContext } = React;
import API from "../../API/api";
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext, OrganisationContext } from "../../App.js";
import useFetch from "../../Functions/FetchHook";
import Table from "../../Components/Tabel/index.js";

export default function CookiesDashboard() {
    document.title = "Cookies | Intastellar Consents";
    const { handle, id } = useParams();
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);

    API[id].getCookies.headers.Domains = currentDomain;
    let url = API[id].getCookies.url;
    let method = API[id].getCookies.method;
    let header = API[id].getCookies.headers;
    let consent = null;

    const [loading, data, error, getUpdated] = useFetch(5, url, method, header);

    return (
        <>
            <div className="dashboard-content">
                <h1>Cookies Dashboard</h1>
                {
                    !loading ? data.status == "success" ? <>
                        {
                            <Table data={data.data.map((cookie, index) => {
                                const cookieName = JSON.parse(cookie.cookiename)?.map((c, key) => {
                                    return Object.keys(c).reduce((object, key) => {
                                        return object;
                                    })
                                })

                                return {
                                    name: cookieName,
                                    domain: cookie.domain,
                                }
                            })} headers={["Cookie", "Domain"]} />
                        }
                    </> : null : <div className="loading"></div>
                }
            </div>
        </>
    )
}