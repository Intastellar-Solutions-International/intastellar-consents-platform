import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import "./Style.css";
export function LiveView(props) {
    API.liveData.headers.Domains = props.currentDomain;

    const [loading, liveData, error, updated] = useFetch(0.25, API.liveData.url, API.liveData.method, API.liveData.headers);


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
                                // Stretch the container to the full width of the parent container.
                                width: "100%",
                                borderBottom: "1px solid rgb(192, 159, 83)",
                                marginBottom: "10px"
                            }}>
                                {/* Users count over minutes */}
                                {
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
                                        return <div key={index} className="liveView-content-data-1" style={{
                                            // Update the bars position based on the minutes gone by and move it from right to left.
                                            /* marginLeft: `${barTransformPosition}px`, */
                                            transform: `translateX(${Math.round(barTransformPosition)}px)`,
                                            transition: "transform 0.5s",
                                            width: "maxContent",
                                        }}>
                                            <div style={{
                                                height: `${(minute.count / liveData.count) * 100
                                                    }%`,
                                                minHeight: "70px",
                                                width: "4px",
                                                backgroundColor: "rgb(192, 159, 83)",
                                            }} data-time={Math.round(minute.minutes)}></div>
                                        </div>
                                    })
                                }
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
                                                width: `${(liveData?.country[key].count / liveData.count) * 100
                                                    }%`,
                                                height: "2px",
                                                backgroundColor: "rgb(222, 189, 113)",
                                                backgroundColor: "rgb(192, 159, 83)",
                                                marginBottom: "10px"
                                            }}></div>
                                            {

                                                Object.keys(
                                                    liveData?.domains
                                                ).filter((domain) => {
                                                    return liveData?.domains[domain].country.indexOf(key) > -1;
                                                }).map((domain, index) => {
                                                    console.log(liveData?.domains[domain], domain)
                                                    return <>
                                                        <div key={index} className="liveView-content-flex" style={{
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
                                                            width: `${(liveData?.domains[domain].count / liveData.count) * 100
                                                                }%`,
                                                            height: "2px",
                                                            backgroundColor: "rgb(222, 189, 113)",
                                                            marginBottom: "10px"
                                                        }}></div>
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