import Fetch from "../../Functions/fetch";
import API from "../../API/api";
const { useState, useEffect, useRef } = React;

export default function Form(props) {
    const [domains, setDomains] = useState(null);
    useEffect(() => {
        Fetch(API.gdpr.getDomains.url, API.gdpr.getDomains.method, API.gdpr.getDomains.headers).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            setDomains(data);
        });
    }, []);

    return <>
        <form>
            <select>
                <option selected disabled>Choose a domain for statistics overview</option>
                {
                    (domains != null) ? domains.map((domain, key) => {
                        if (domain[0] != "undefined" || domain[0] != "") {
                            return <option key={key} onChange={setCurrentDomain(domain[0])}>{domain[0]}</option>
                        }
                    }) : <option>Loading...</option>
                }
            </select>
        </form>
    </>
}