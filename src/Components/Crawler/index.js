const { useState, useEffect, useRef, createContext } = React;
import Select from "../SelectInput/Selector";
import Button from "../Button/Button";
import Table from "../Tabel";
import TextInput from "../InputFields/textInput";
import LoadingSpinner from "../LoadingSpinner/LoadingSpinner";
import Highlighter from "../Highlighter/Highlighter";
import "./Style.css";

export default function Crawler({domains, websiteStatus = null, setWebsiteStatus = null}){
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [fetchedWebsites, setFetchedWebsites] = useState("");
    const [crawlerItem, setCrawlerItem] = useState("");
    const [defaultValue, setDefaultValue] = useState("or Select a Website");
    if(websiteStatus === null){
        [websiteStatus, setWebsiteStatus] = useState("Not Crawled");
    }

    if(window.location.pathname === "/crawler" || window.location.pathname === "/check"){
        document.title = "CookieBot | Intastellar Consents Platform"; 
    }

    function crawlWebsite(e){
        e.preventDefault();
        setWebsiteStatus("Crawling...");
        setLoading(true);
        fetch("https://apis.intastellarsolutions.com/crawl-website", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                url: "https://" + crawlerItem
            })
        }).then(res => res.json()).then(res => {
            if(res === "Err_Invalid_Website"){
                setWebsiteStatus("Invalid Website");
                setLoading(false);
                return;
            }
            setLoading(false);
            setWebsiteStatus("Crawled");
            setData(res);
            setFetchedWebsites(crawlerItem);
        }).catch(err => {
            setLoading(false);
            setError(err);
        });
    }

    return <>
        <div className="form">
            <section className="crawler-intro">
                <h2>CookieBot {<Highlighter type="--coming">Coming Soon</Highlighter>}</h2>
                <p>Find all cookies on your Website both first party and thrid party cookies.</p>
                <p>Enter your website below to get started.</p>
                <form className="crawler-form" onSubmit={crawlWebsite}>
                    <TextInput placeholder="Enter Website" onChange={(e) => {
                        if(e.target.value.indexOf("https://") !== -1){
                            e.target.value = e.target.value.replace("https://", "");
                        }
                        setCrawlerItem(e.target.value)
                    }} />
                    {domains &&
                    <Select defaultValue={defaultValue} key={""} items={domains?.map((d) => {
                        return d.domain;
                    })} onChange={
                        (e) => {
                            setCrawlerItem(e);
                            setDefaultValue(e);
                        }
                    } />}
                    <Button className="crawl-cta" onClick={crawlWebsite}>Find Cookies</Button>
                </form>
            </section>
            <section className="crawler-intro">
                <p>Free to use</p>
                <p>Instant Report</p>
            </section>
            {
                data === "Err_Development_Only" && <p>Sorry, this feature is only available in development mode</p>
            }
            {
                websiteStatus === "Crawled" && data !== "Err_Development_Only" && <p>Found {data?.length - 1} cookies on your website across {data?.map((crawledUrl) => crawledUrl?.crawledUrls?.length)} sites</p>
            }

            {loading && <LoadingSpinner />}
            {!loading && data !== "Err_Development_Only" && data?.length - 1 > 0 && <>
                <h3>First party & third party Cookies found on {fetchedWebsites.replace("https://", "").replace("http://", "").replace("www.", "")}</h3>
                <Table headers={["Name", "Domain"]} data={data} />
            </>
            }
        </div>
    </>;
}