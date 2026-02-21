import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import "./Style.css";
const useState = window.React.useState;
const useEffect = window.React.useEffect;
export function LiveView(props) {
    console.log("LiveView props:", props);
    API.liveData.headers.Domains = props.currentDomain;
    const demoMode = props.demoMode;

    const [loading, liveData, error, updated] = useFetch(0.25, API.liveData.url, API.liveData.method, API.liveData.headers);
    const [domainLiveView, setDomainLiveView] = useState({
        domain: "",
        country: "",
        open: false
    });
    // Add a state to force re-render when liveData changes
    const [barRenderKey, setBarRenderKey] = useState(0);
    useEffect(() => {
        setBarRenderKey(prev => prev + 1);
    }, [liveData]);

    return <>
        {
            (!loading) ?
                <div className="liveView">
                    <div className="liveView-content">
                        <p className="liveView-content-title">INTERACTIONS IN LAST 30 MINUTES {demoMode ? "(DEMO MODE IS ON)" : ""}</p>
                        <div className="liveView-content-data">
                            <div className="liveView-content-data-1">
                                <p className="liveView-content-data-1-number">{liveData?.count}</p>
                            </div>
                            <div className="liveView-container" key={barRenderKey} style={{
                                gap: "1px",
                                display: "flex",
                                alignItems: "flex-end",
                                width: "100%",
                                borderBottom: "1px solid rgb(192, 159, 83)",
                                marginBottom: "10px",
                            }}>
                                {
                                    (() => {
                                        // Build an array of counts for each minute (1-30)
                                        let counts = Array(30).fill(0);
                                        if (liveData?.visitsOverTime && Array.isArray(liveData.visitsOverTime)) {
                                            liveData.visitsOverTime.forEach(event => {
                                                const idx = Math.round(event.minutes) - 1;
                                                if (idx >= 0 && idx < 30) {
                                                    counts[idx]++;
                                                }
                                            });
                                        }
                                        const maxCount = Math.max(1, ...counts);

                                        console.log("LiveView counts array:", counts);

                                        return counts.map((count, index) => {
                                            // Scale bar height: min 2px, max 60px
                                            const barHeight = count > 0
                                                ? Math.round((count / maxCount) * 60)
                                                : 2;

                                            console.log("Bar height for index", index, "with count", count, "is", barHeight);

                                            return <div key={index} className="liveView-container-bar" style={{
                                                width: `calc(100% / 30)`,
                                                height: `${barHeight}px`,
                                                backgroundColor: "rgb(192, 159, 83)",
                                                transition: "height 0.5s ease-in-out",
                                                opacity: count > 0 ? "1" : "0.3"
                                            }} title={count > 0 ? `${count} interactions` : "0 interactions"}></div>
                                        });
                                    })()
                                }
                            </div>
                            <div className="liveView-content-data-2">
                                {
                                    // Loop through the 'liveData.country' object and display the country name.
                                    Object.keys(liveData?.country || {}).map((key, countryIndex) => {
                                        const countryCount = liveData?.country[key]?.count ?? 0;
                                        const totalCount = liveData?.count || 1;
                                        const countryKeys = Object.keys(liveData?.country || {});
                                        const isLastCountry = countryIndex === countryKeys.length - 1;

                                        return <div key={key} className="liveView-content-country" style={{
                                            marginBottom: isLastCountry ? "0" : "40px"
                                        }}>
                                            <div className="liveView-content-flex">
                                                <p className="liveView-content-data-1-text">{key}</p>
                                                <p className="liveView-content-data-1-text">{countryCount}</p>
                                            </div>
                                            <div style={{
                                                width: "100%",
                                                height: "2px",
                                                backgroundColor: "#c4c4c4",
                                                marginBottom: "10px"
                                            }}>
                                                <div style={{
                                                    width: `${(countryCount / totalCount) * 100}%`,
                                                    height: "2px",
                                                    backgroundColor: "rgb(222, 189, 113)",
                                                    marginBottom: "10px"
                                                }}></div>
                                            </div>
                                            {
                                                !demoMode &&
                                                Object.keys(liveData?.domains || {})
                                                    .filter((domain) => {
                                                        const domainCountries = liveData?.domains[domain]?.country;
                                                        return Array.isArray(domainCountries) && domainCountries.includes(key);
                                                    })
                                                    .map((domain) => {
                                                        const domainCountryCount = (liveData?.domains[domain]?.country || []).filter((c) => c === key).length;
                                                        const barWidthPercent = totalCount > 0 ? (domainCountryCount / totalCount) * 100 : 0;

                                                        return <div key={`${key}-${domain}`} style={{ marginBottom: "10px" }}>
                                                            <div onClick={() => {
                                                                setDomainLiveView({
                                                                    domain: domain,
                                                                    country: key,
                                                                    open: true
                                                                });
                                                            }} className="liveView-content-flex" style={{
                                                                fontSize: "12px",
                                                                cursor: "pointer",
                                                            }}>
                                                                <p className="liveView-content-data-1-text">{domain}</p>
                                                                <p className="liveView-content-data-1-text">{domainCountryCount}</p>
                                                            </div>
                                                            {
                                                                domainLiveView.open && domainLiveView.domain === domain && domainLiveView.country === key && (
                                                                    <div className="liveView-content-data-1-domain" style={{
                                                                        display: "flex",
                                                                        flexDirection: "column",
                                                                        gap: "10px",
                                                                        padding: "10px",
                                                                        position: "absolute",
                                                                        top: "0",
                                                                        left: "0",
                                                                        right: "0",
                                                                        bottom: "0",
                                                                        zIndex: "999",
                                                                        overflowY: "scroll",
                                                                        maxHeight: "400px",
                                                                        width: "100%",
                                                                        boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.1)",
                                                                        border: "1px solid #c4c4c4",
                                                                        borderRadius: "5px",
                                                                        backgroundColor: "rgb(63, 63, 63)"
                                                                    }}>
                                                                        <div className="liveView-content-data-1-domain-title">
                                                                            <p className="liveView-content-data-1-text">Domain: {domain}</p>
                                                                            <button onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setDomainLiveView({
                                                                                    domain: "",
                                                                                    country: "",
                                                                                    open: false
                                                                                });
                                                                            }} className="dropdown-menu-button">Close</button>
                                                                        </div>
                                                                        {
                                                                            (() => {
                                                                                const consents = liveData?.domains[domain]?.consent || [];
                                                                                const countries = liveData?.domains[domain]?.country || [];
                                                                                // Only show consents for visits from the selected country (consent[i] matches country[i])
                                                                                return consents.flatMap((consent, consentIdx) => {
                                                                                    if (countries[consentIdx] !== key) return [];
                                                                                    const consentData = (consent && typeof consent === "string") ? JSON.parse(consent) : consent;
                                                                                    if (!Array.isArray(consentData)) return [];
                                                                                    return consentData.map((consentItem, idx) => {
                                                                                        const isAccepted = consentItem?.checked === "checked" || consentItem?.checked === true;
                                                                                        return (
                                                                                            <div key={`${domain}-${consentIdx}-${idx}`} className="liveView-content-data-1-domain-consent">
                                                                                                <p className="liveView-content-data-1-text">{consentItem?.type}</p>
                                                                                                <p className="liveView-content-data-1-text">{isAccepted ? "Accepted" : "Declined"}</p>
                                                                                            </div>
                                                                                        );
                                                                                    });
                                                                                });
                                                                            })()
                                                                        }
                                                                    </div>
                                                                )
                                                            }
                                                            <div style={{
                                                                width: "100%",
                                                                height: "2px",
                                                                backgroundColor: "#c4c4c4",
                                                                marginBottom: "10px",
                                                                position: "relative",
                                                                overflow: "hidden",
                                                            }}>
                                                                <div style={{
                                                                    width: `${barWidthPercent}%`,
                                                                    height: "2px",
                                                                    position: "absolute",
                                                                    top: "0",
                                                                    backgroundColor: "rgb(222, 189, 113)"
                                                                }}></div>
                                                            </div>
                                                        </div>;
                                                    })
                                            }
                                        </div>;
                                    })
                                }
                            </div>
                        </div>
                    </div>
                </div >
                : null
        }
    </>
}