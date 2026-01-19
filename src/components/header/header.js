const { useState, useEffect, useRef, useContext } = React;
import { OrganisationContext, DomainContext } from "../../App";
import "./header.css";
import logo from "./logo.svg";
import Fetch from "../../Functions/fetch";
import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import Authentication from "../../Authentication/Auth";
import Select from "../SelectInput/Selector";
import IntastellarAccounts from "../IntastellarAccounts/IntastellarAccounts";
const useHistory = window.ReactRouterDOM.useHistory;
const punycode = require("punycode");

export default function Header(props) {

    const [Organisation, setOrganisation] = useContext(OrganisationContext);
    const [currentDomain, setCurrentDomain] = useState((window.location.pathname.split("/")[2] === "view") ? decodeURI(window.location.pathname.split("/")[3]?.replace("%2E", ".")) : "Choose domain");
    const profileImage = JSON.parse(localStorage.getItem("globals"))?.user?.avatar;
    let domainList = null;
    const Name = JSON.parse(localStorage.getItem("globals"))?.user?.name?.first_name + " " + JSON.parse(localStorage.getItem("globals"))?.user?.name?.last_name;
    const navigate = useHistory();
    const [allOrganisations, setallOrganisations] = useState(null);
    const [domains, setDomains] = useState(props.domains);
    const [viewUserProfile, setViewUserProfile] = useState(false);
    const Platform = (localStorage.getItem("platform") == "gdpr") ? "Intastellar Consents | CMP" : "Ferry Booking";
    useEffect(() => {

        Fetch(API.settings.getOrganisation.url, API.settings.getOrganisation.method, API.settings.getOrganisation.headers, JSON.stringify({
            organisationMember: Authentication.getUserId()
        })).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (JSON.parse(localStorage.getItem("globals")).organisation == null) {
                JSON.parse(localStorage.getItem("globals")).organisation = data;
            }
            setallOrganisations(data);
        });

        Fetch(API[window.location.pathname.split("/")[1] || "gdpr"]?.getDomains?.url, API[window.location.pathname.split("/")[1] || "gdpr"]?.getDomains?.method, API[window.location.pathname.split("/")[1] || "gdpr"]?.getDomains?.headers).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (data.error === "Err_No_Domains") {

            } else {
                data.unshift({ domain: "combined view", installed: null, lastedVisited: null });
                data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined.";
                });
                setDomains(data);

                const allowedDomains = data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined." && d !== "combined view";
                });

                localStorage.setItem("domains", JSON.stringify(allowedDomains));

            }
        });
    }, []);


    domainList = domains?.map((d) => {
        return {
            icon: d.icon || null,
            name: punycode.toUnicode(d.domain)
        }
    })

    return (
        <>
            <header className="dashboard-header">
                <div className="dashboard-profile">
                    <section className="logo-selector-container">
                        <section className="logo_container">
                            <button className="menu" onClick={() => {
                                document.querySelector(".navOverlay").classList.toggle("expand");
                            }}>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                            </button>
                            <img className="dashboard-logo" src={logo} alt="Intastellar Solutions Logo" />
                        </section>
                        <section className="company_container">
                            {(allOrganisations && Organisation) ?
                                <Select defaultValue={Organisation}
                                    onChange={(e) => {
                                        setOrganisation(e);
                                        localStorage.setItem("organisation", e);
                                        window.location.reload();
                                    }}
                                    items={allOrganisations}
                                    style={{ right: "0" }}
                                /> : <div className="selector"></div>
                            }
                            {(domains && currentDomain) ?
                                <>
                                    <Select defaultValue={currentDomain}
                                        onChange={(e) => {
                                            const domain = e;
                                            setCurrentDomain(domain);
                                            window.location.href = `/${window.location.pathname.split("/")[1]}/view/${domain.replace('.', '%2E')}`;
                                        }}
                                        items={domainList}
                                        style={{ left: "0" }}
                                    />
                                </> : <div className="selector"></div>
                            }
                        </section>
                    </section>
                    <div className="flex profileImage">
                        <img src={profileImage} className="content-img" onClick={() => setViewUserProfile(!viewUserProfile)} />
                    </div>
                </div>
                {(viewUserProfile) ? <IntastellarAccounts profile={{
                    image: profileImage,
                    name: JSON.parse(localStorage.getItem("globals"))?.user?.name?.firstName,
                    email: JSON.parse(localStorage.getItem("globals"))?.user?.email,
                }} setIsOpen={setViewUserProfile} /> : null}
            </header>
        </>
    )
}