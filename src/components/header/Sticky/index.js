import Filter from "../../Filter/index.js";
import { LoadingBar } from "../../../Components/widget/Loading";
export default function StickyPageTitle({ loadingUpdated, finalLoaded, title, url, method, header, numberofDays, getLastDays, setActiveData, fromDate, toDate, setFromDate, setToDate, previousPeriod, previousPeriod2, children }) {
    window.addEventListener("scroll", (e) => {
        if (window.scrollY > 0) {
            document.querySelector(".infoHeader").classList.add("sticky");
        } else {
            document.querySelector(".infoHeader").classList.remove("sticky");
        }
    })
    
    console.log("Children in StickyPageTitle:", children);

    if (!children){
        return <>
            <div className="infoHeader" style={{ padding: "10px 0" }}>
                {loadingUpdated || finalLoaded ? <LoadingBar /> : null}
                <div className="dashboard-content" style={{
                    display: "grid",
                    gridTemplateColumns: "1fr .5fr",
                    alignItems: "center",
                }}>
                    <h1 style={{ fontSize: "1.5em" }}>{title}</h1>
                    {
                        (numberofDays) ?
                            <Filter
                                numberOfDays={getLastDays}
                                setNumberOfDays={numberofDays}
                                compareRange={0}
                                date={{
                                    start: fromDate ?? new Date(Date.now() - (getLastDays * 24 * 60 * 60 * 1000)),
                                    end: toDate ?? new Date(Date.now()),
                                    previousStart: previousPeriod ?? new Date(Date.now() - (getLastDays * 24 * 60 * 60 * 1000) - (getLastDays * 24 * 60 * 60 * 1000)),
                                    previousEnd: previousPeriod2 ?? new Date(Date.now() - (getLastDays * 24 * 60 * 60 * 1000))
                                }}
                                setFromDate={setFromDate}
                                setToDate={setToDate}
                            /> : null
                    }
                    {/* {(url) ? <Filter url={url} method={method} header={header} setLastDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} /> : null} */}
                </div>
            </div>
        </>
    } else {
        console.log("Hello children" + children);
        return <>
            <div className="infoHeader" style={{ padding: "10px 0" }}>
                {loadingUpdated || finalLoaded ? <LoadingBar /> : null}
                <div className="dashboard-content" style={{
                    display: "grid",
                    gridTemplateColumns: "1fr .5fr",
                    alignItems: "center",
                }}>
                    {children}
                </div>
            </div>
        </>
        
    }

}