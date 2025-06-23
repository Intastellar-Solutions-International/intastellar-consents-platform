import Fetch from "../../Functions/FetchHook";
import API from "../../API/api";
import "./Style.css";
import { Loading, CurrentPageLoading } from "../../Components/widget/Loading";
const { useState, useEffect, useRef } = React;
const punycode = require("punycode");
export default function Websites() {

    const [loading, data, error] = Fetch(10, API.gdpr.getDomains.url, API.gdpr.getDomains.method, API.gdpr.getDomains.headers);


    return (
        <>
            <main className="dashboard-content">
                <h1>List of all domains</h1>
                <p>On all these domains the Intastellar Cookie Consents is implemented</p>
                <section className="grid-container grid-3">
                    {
                        (loading) ? <Loading /> : data?.map(
                            (domain, key) => {
                                const main = domain["domain"];

                                const timestamp = domain[1];

                                const installed = domain["installed"] ? domain["installed"] : null;
                                const lastVisited = domain["lastedVisited"] ? domain["lastedVisited"] : null;
                                const icon = domain["icon"];

                                return (
                                    <>
                                        <a key={key} className="link widget" href={"http://" + main} target="_blank" rel="noopener nofollow noreferer">
                                            {icon ? <img src={icon} alt="icon" className="domainIcon" /> : null}
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