import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import "./Style.css";
const useState = window.React.useState;
const useEffect = window.React.useEffect;
export function LiveView(props) {
    API.liveData.headers.Domains = props.currentDomain;

    const [loading, liveData, error, updated] = useFetch(0.25, API.liveData.url, API.liveData.method, API.liveData.headers);
    const [domainLiveView, setDomainLiveView] = useState({
        domain: "",
        open: false
    });

    return <>
        {
            (!loading) ?
                <div className="liveView">
                    <div className="liveView-content">
                        <p className="liveView-content-title">USERS IN LAST 30 MINUTES</p>
                        <div className="liveView-content-data">
                            <div className="liveView-content-data-1">
                                <p className="liveView-content-data-1-number">{liveData?.count}</p>
                            </div>
                            <div className="liveView-container" style={{
                                gap: "1px",
                                display: "flex",
                                alignItems: "flex-end",
                                // Stretch the container to the full width of the parent container.
                                width: "100%",
                                borderBottom: "1px solid rgb(192, 159, 83)",
                                marginBottom: "10px",
                            }}>
                                {
                                    Array.from({ length: 30 }, (_, index) => {
                                        const visitData = liveData?.visitsOverTime.find(minute => Math.round(minute.minutes) === index + 1);

                                        return <div key={index} className="liveView-container-bar" style={{
                                            width: document.querySelector(".liveView-container")?.clientWidth / 30,
                                            height: `${Math.round(visitData?.minutes) == index + 1 ? "60" : "2"}px`,
                                            backgroundColor: "rgb(192, 159, 83)",
                                            transition: "height 0.5s ease-in-out",
                                            // Set the opacity to 1 if there is data for the minute, otherwise keep it 0.
                                            opacity: "1"
                                        }}></div>
                                    })
                                }
                                {/* {
                                    liveData?.visitsOverTime.map((minute, index) => {
                                        // Calulate the position of the bar based on the number of minutes gone by.

                                        // Calculate the position of the bar based on the number of minutes gone by and take the container width as 30 minutes.
                                        // Get the parent container width.
                                        const containerWidth = document.querySelector(".liveView-container")?.clientWidth;
                                        // Calculate the position of the bar based on the number of minutes gone by and take the container width as 30 minutes.
                                        const barTransformPosition = ((containerWidth / 30) * minute.minutes) - 4;

                                        if (Math.round(minute.minutes) > 30) {
                                            return null;
                                        }

                                        // Display a bar for each minute with the height of the bar being the number of users in that minute.
                                        // Update the bars position based on the number of users in that minute.
                                        return 
                                    })
                                } */}
                            </div>
                            <div className="liveView-content-data-2">
                                {
                                    // Loop through the 'liveData.contry' object and display the country name.
                                    Object.keys(
                                        liveData?.country
                                    ).map((key, index) => {
                                        return <div key={index} className="liveView-content-country" style={{
                                            marginBottom: (liveData?.country.length - 1 === index) ? "0" : "40px"
                                        }}>
                                            <div className="liveView-content-flex">
                                                <p className="liveView-content-data-1-text">{key}</p>
                                                <p className="liveView-content-data-1-text">{liveData?.country[key].count}</p>
                                            </div>
                                            <div style={{
                                                width: `100%`,
                                                height: "2px",
                                                backgroundColor: "#c4c4c4",
                                                marginBottom: "10px"
                                            }}>
                                                <div style={{
                                                    width: `${(liveData?.country[key].count / liveData.count) * 100
                                                        }%`,
                                                    height: "2px",
                                                    backgroundColor: "rgb(222, 189, 113)",
                                                    marginBottom: "10px"
                                                }}></div>
                                            </div>
                                            {
                                                domainLiveView.open && domainLiveView.domain === key ?
                                                    <div className="liveView-content-data-1-domain" style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "10px",
                                                        padding: "10px",
                                                        borderRadius: "5px",
                                                        backgroundColor: "white",
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
                                                        backgroundColor: "white"
                                                    }}
                                                    >
                                                        <div className="liveView-content-data-1-domain-title">
                                                            <p className="liveView-content-data-1-text">Domain</p>
                                                            <p className="liveView-content-data-1-text">Count</p>
                                                        </div>
                                                    </div>
                                                    : null
                                            }
                                            {
                                                Object.keys(
                                                    liveData?.domains
                                                ).filter((domain) => {
                                                    return liveData?.domains[domain].country.indexOf(key) > -1;
                                                }).map((domain, index) => {
                                                    return <>
                                                        <div key={index} onClick={() => {
                                                            setDomainLiveView({
                                                                domain: domain,
                                                                open: true
                                                            });
                                                        }} className="liveView-content-flex" style={{
                                                            fontSize: "12px",
                                                        }}>
                                                            <p className="liveView-content-data-1-text">{domain}</p>
                                                            <p className="liveView-content-data-1-text">{
                                                                liveData?.domains[domain].country.filter((country) => {
                                                                    return country === key;
                                                                }).length
                                                            }</p>
                                                        </div>
                                                        <div key={index} style={{
                                                            width: `100%`,
                                                            height: "2px",
                                                            backgroundColor: "#c4c4c4",
                                                            marginBottom: "10px",
                                                            position: "relative",
                                                            overflow: "hidden",
                                                        }}>
                                                            <div style={{
                                                                width: `${(liveData?.domains[domain].country.filter((country) => {
                                                                    return country === key;
                                                                }).length / liveData.count) * 100
                                                                    }%`,
                                                                height: "2px",
                                                                position: "absolute",
                                                                top: "0",
                                                                backgroundColor: "rgb(222, 189, 113)"
                                                            }}></div>
                                                        </div>
                                                    </>
                                                })
                                            }
                                        </div>
                                    })
                                }
                            </div>
                        </div>
                    </div>
                </div>
                : null
        }
    </>
}