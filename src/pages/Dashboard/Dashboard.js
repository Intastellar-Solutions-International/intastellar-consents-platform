const { useState, useEffect, useRef, useContext } = React;
import TopWidgets from "../../Components/widget/TopWidgets.js";
import StyleWidget from "../../Components/widget/StyleWidget.js";
import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import { Loading, LoadingBar } from "../../Components/widget/Loading";

import "./Style.css";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { DomainContext, OrganisationContext } from "../../App.js";
const useParams = window.ReactRouterDOM.useParams;
import Crawler from "../../Components/Crawler";
import Line from "../../Components/Charts/Line"
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { LiveView } from "../../components/LiveView/index.js";
import { PremiumTier, BasicTier, ProTier } from "../../Components/tiers/index.js";
import Pie from "../../Components/Charts/Pie/index.js";

export default function Dashboard(props) {
    document.title = "Home | Intastellar Consents Solutions";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));

    const subscriptionStatus = JSON.parse(localStorage.getItem("subscription"));
    const userProfile = JSON.parse(localStorage.getItem("globals")).profile.image;

    const { handle, id } = useParams();
    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));

    const [loading, setLoading] = useState(false);
    const [loadingCountry, setLoadingCountry] = useState(false);

    const dashboardView = props.dashboardView;
    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

    API[id].getInteractions.headers.Domains = currentDomain;
    API[id].getInteractionsByCountry.headers.Domains = currentDomain;
    API[id].getInteractions.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractions.headers.ToDate = toDate.toISOString().split("T")[0];

    API[id].getInteractionsByCountry.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractionsByCountry.headers.ToDate = toDate.toISOString().split("T")[0];

    useEffect(() => {

        function handleScrollEvent() {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                /* console.log("you're at the bottom of the page"); */
                // here add more items in the 'filteredData' state from the 'allData' state source.
            }

        }

        window.addEventListener('scroll', handleScrollEvent)

        return () => {
            window.removeEventListener('scroll', handleScrollEvent);
        }
    }, [])

    useEffect(() => {
        setLoading(true);
        setLoadingCountry(true);

        fetch(API[id].getInteractions.url, {
            method: API[id].getInteractions.method,
            headers: API[id].getInteractions.headers,
        }).then((res) => res.json()).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setActiveData(data);
        }
        ).catch((err) => {
            console.log(err);
        }).finally(() => {
            setLoading(false);
        });

        fetch(API[id].getInteractionsByCountry.url, {
            method: API[id].getInteractionsByCountry.method,
            headers: API[id].getInteractionsByCountry.headers,
        }).then((res) => res.json()).then((country) => {
            if (country === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setactiveDataCountry(country);
        }
        ).catch((err) => {
            console.log(err);
        }).finally(() => {
            setLoadingCountry(false);
        });

    }, [fromDate, toDate]);

    document.querySelectorAll(".intInput").forEach((input) => {
        input.setAttribute("max", new Date().toISOString().split("T")[0]);
    })

    console.log(activeData, activeDataCountry, subscriptionStatus);

    return (
        <>
            <StickyPageTitle loadingUpdated={loading} title="Home" url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {/* <div className="profilePicture-container">
                    <img src={userProfile} className="profilePicture" />
                    <p className="profile-user">Welcome, {JSON.parse(localStorage.getItem("globals")).profile.name.first_name}</p>
                </div> */}
                {
                    (id === "gdpr" && organisation != null && JSON.parse(organisation).id == 1) ? <TopWidgets dashboardView={dashboardView} API={{
                        url: API[id].getTotalNumber.url,
                        method: API[id].getTotalNumber.method,
                        header: API[id].getTotalNumber.headers
                    }} /> : null
                }
                {
                    (id === "gdpr" && organisation != null && JSON.parse(organisation).id == 1) ? <StyleWidget dashboardView={dashboardView} API={{
                        url: API[id].getStyle.url,
                        method: API[id].getStyle.method,
                        header: API[id].getStyle.headers
                    }} /> : null
                }
                {/* <div className="crawler">
                    <Crawler />
                </div> */}
                <div className="" style={{ paddingTop: "40px" }}>
                    <div className="grid-container grid-2" style={{ gridTemplateColumns: "1fr .5fr", gap: "20px" }}>
                        {(loadingCountry) ? <>

                            <Loading />
                        </> : <>

                            <div className={["widget no-padding grid-3-4"]}>
                                <Map data={{

                                    Countries: activeDataCountry?.data?.Countries,
                                    total: activeData?.Total,
                                }} />
                            </div>
                        </>}
                        <div className={["widget no-padding"]}>
                            <LiveView currentDomain={currentDomain} />
                        </div>
                    </div>
                </div>
                <PremiumTier loading={loading} activeData={activeData} fromDate={fromDate} />
                {/* {subscriptionStatus?.tier === "premium" ?
                    <PremiumTier loading={loading} activeData={activeData} />
                    : (subscriptionStatus?.tier === "professional") ?
                        <ProTier loading={loading} activeData={activeData} />
                        : <BasicTier />
                } */}
            </div>
        </>
    )
}