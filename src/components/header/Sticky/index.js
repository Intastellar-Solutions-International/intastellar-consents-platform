import Filter from "../../Filter/index.js";
import { LoadingBar } from "../../../Components/widget/Loading";
import Button from "../../Button/Button.js";
import SideCart from "../../SideCart/SideCart.js";

// Added showInfoButton and infoType props
export default function StickyPageTitle({
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
    
    console.log("Children in StickyPageTitle:", children);
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
                    <h1 style={{ fontSize: "1.5em" }}>
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