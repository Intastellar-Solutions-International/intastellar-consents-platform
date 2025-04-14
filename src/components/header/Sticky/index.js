import Filter from "../../Filter/index.js";
export default function StickyPageTitle({ title, url, method, header, numberofDays, getLastDays, setActiveData, fromDate, toDate, setFromDate, setToDate, previousPeriod, previousPeriod2 }) {
    window.addEventListener("scroll", (e) => {
        if (window.scrollY > 0) {
            document.querySelector(".infoHeader").classList.add("sticky");
        } else {
            document.querySelector(".infoHeader").classList.remove("sticky");
        }
    })
    return <>
        <div className="infoHeader" style={{ padding: "10px 0" }}>
            <div className="dashboard-content" style={{
                display: "grid",
                gridTemplateColumns: "1fr .5fr",
                alignItems: "center",
            }}>
                <h1 style={{ fontSize: "1.5em" }}>{title}</h1>
                {/* {
                    <Filter
                        numberOfDays={numberofDays}
                        setNumberOfDays={setActiveData}
                        compareRange={0}
                        startDate={fromDate}
                        date={
                            {
                                start: fromDate,
                                end: toDate,
                                previousStart: previousPeriod,
                                previousEnd: previousPeriod2
                            }
                        }
                    />
                } */}
                {/* {(url) ? <Filter url={url} method={method} header={header} setLastDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} /> : null} */}
            </div>
        </div>
    </>
}