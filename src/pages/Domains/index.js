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
                <h2>Analytics</h2>
                <h3>List of all domains</h3>
                <p>On all these domains the Intastellar Cookie Consents is implemented</p>
                <section className="grid-container grid-3">
                    {
                        (loading) ? <Loading /> : data?.map(
                            (domain, key) => {
                                const main = domain["domain"];

                                const timestamp = domain[1];

                                const installed = domain["installed"];
                                const lastVisited = domain["lastedVisited"];
                                const icon = domain["icon"];
                                return (
                                    <>
                                        <a key={key} className="link widget" href={"http://" + main} target="_blank" rel="noopener nofollow noreferer">
                                            {punycode.toUnicode(main)} <br />
                                            Last visited: {lastVisited} <br />
                                            Installed: {installed} <br />
                                            {icon ? <img src={icon} alt="icon" className="domainIcon" /> : null}
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