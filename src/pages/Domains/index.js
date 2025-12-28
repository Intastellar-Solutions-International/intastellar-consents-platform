import Fetch from "../../Functions/FetchHook";
import API from "../../API/api";
import "./Style.css";
import { Loading, CurrentPageLoading } from "../../Components/widget/Loading";
import StickyPageTitle from "../../Components/Header/Sticky";
const { useState, useEffect, useRef } = React;
const punycode = require("punycode");
export default function Websites() {

    const [loading, data, error] = Fetch(10, API.gdpr.getDomains.url, API.gdpr.getDomains.method, API.gdpr.getDomains.headers);
    const [activeData, setActiveData] = useState(null);
    const [loadingAudit, setLoading] = useState(false);

    const id = "gdpr";

    API[id].audit.headers["FromDate"] = new Date().toISOString();
    API[id].audit.headers["ToDate"] = new Date().toISOString();

    function generateAudit() {
        fetch(API[id].audit.url, {
            method: API[id].audit.method,
            headers: API[id].audit.headers,
        }).then((res) => res.json()).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setActiveData(data);
        }
        ).catch((err) => {
            console.error(err);
        }).finally(() => {
            setLoading(false);
        });
    }

    return (
        <>
            <StickyPageTitle >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h1>Domains</h1>
                    <section>
                        <button onClick={() => generateAudit()}>Generate Audit report</button>
                    </section>
                </div>
            </StickyPageTitle>
            <main className="dashboard-content">
                <p>On all these domains the Intastellar Cookie Consents is implemented</p>
                <section className="grid-container grid-3">
                    {
                        (loading) ? <Loading /> : data?.map(
                            (domain, key) => {
                                const main = domain["domain"];

                                const timestamp = domain[1];

                                const installed = domain["installed"] ? domain["installed"] : null;
                                const comapnyName = domain["companyName"] && domain["companyName"] != "undefined" ? domain["companyName"] : main;
                                const lastVisited = domain["lastedVisited"] ? domain["lastedVisited"] : null;
                                const icon = domain["icon"];

                                return (
                                    <>
                                        <a key={key} className="link widget" href={"http://" + main} target="_blank" rel="noopener nofollow noreferer">
                                            {icon ? <img src={icon} alt="icon" className="domainIcon" /> : null}
                                            {comapnyName ? <h2 className="companyName">{comapnyName}</h2> : null}
                                            <p>{punycode.toUnicode(main)}</p>
                                            <p>Installed: {installed && installed !== "Invalid Date" && installed !== "0000-00-00T00:00:00.000Z" ? installed : null}</p>
                                            <p>Last visited: {lastVisited && lastVisited !== "Invalid Date" ? lastVisited : null}</p>
                                        </a>
                                    </>
                                )
                            }
                        )
                    }
                </section>
            </main>
        </>
    )
}