import Filter from "../../Filter/index.js";
import { LoadingBar } from "../../../Components/widget/Loading";
import Button from "../../Button/Button.js";
import SideCart from "../../SideCart/SideCart.js";

// Added showInfoButton and infoType props
export default function StickyPageTitle({
    demoMode = false,
    loadingUpdated,
    finalLoaded,
    title,
    url,
    method,
    header,
    numberofDays,
    getLastDays,
    setActiveData,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    previousPeriod,
    previousPeriod2,
    compareRange = 0,
    setCompareRange,
    setCompareWindowStart,
    setCompareWindowEnd,
    children,
    showInfoButton = false,
    infoType = "information"
}) {
    window.addEventListener("scroll", (e) => {
        if (window.scrollY > 0) {
            document.querySelector(".infoHeader").classList.add("sticky");
        } else {
            document.querySelector(".infoHeader").classList.remove("sticky");
        }
    })
    
    function openSideCart() {
        document.querySelector(".sideCart").classList.add("open");
    }

    if (!children) {
        return <>
            <div className="infoHeader" style={{ padding: "10px 0" }}>
                {loadingUpdated || finalLoaded ? <LoadingBar /> : null}
                <div className="dashboard-content" style={{
                    display: "grid",
                    gridTemplateColumns: "1fr .5fr",
                    alignItems: "center",
                }}>
                    <h1 className="sticky-title">
                        {title}
                        {showInfoButton && (
                            <Button className="secondary" onClick={openSideCart}>i</Button>
                        )}
                    </h1>
                    {
                        (numberofDays) ?
                            <Filter
                                numberOfDays={getLastDays}
                                setNumberOfDays={numberofDays}
                                compareRange={compareRange}
                                setCompareRange={setCompareRange}
                                setCompareWindowStart={setCompareWindowStart}
                                setCompareWindowEnd={setCompareWindowEnd}
                                date={{
                                    start: fromDate ?? new Date(Date.now() - (getLastDays * 24 * 60 * 60 * 1000)),
                                    end: toDate ?? new Date(Date.now()),
                                    previousStart: previousPeriod ?? new Date(Date.now() - (getLastDays * 24 * 60 * 60 * 1000) - (getLastDays * 24 * 60 * 60 * 1000)),
                                    previousEnd: previousPeriod2 ?? new Date(Date.now() - (getLastDays * 24 * 60 * 60 * 1000))
                                }}
                                setFromDate={setFromDate}
                                setToDate={setToDate}
                                demoMode={demoMode}
                            /> : null
                    }
                </div>
            </div>
            {showInfoButton && <SideCart infoType={infoType} helpPage={infoType} />}
        </>
    } else {
        // With children
        return <>
            <div className="infoHeader" style={{ padding: "10px 0" }}>
                {loadingUpdated || finalLoaded ? <LoadingBar /> : null}
                <div className="dashboard-content" style={{
                    display: "grid",
                    gridTemplateColumns: "1fr .5fr",
                    alignItems: "center",
                }}>
                    {children}
                    {showInfoButton && (
                        <Button className="secondary" onClick={openSideCart}>i</Button>
                    )}
                </div>
            </div>
            {showInfoButton && <SideCart infoType={infoType} helpPage={infoType} />}
        </>
    }

}