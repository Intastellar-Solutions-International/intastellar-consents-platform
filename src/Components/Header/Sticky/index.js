import Filter from "../../Filter/index.js";
import { LoadingBar } from "../../../Components/widget/Loading";
import Button from "../../Button/Button.js";
import SideCart from "../../SideCart/SideCart.js";
import { isNewShell } from "../../../Functions/featureFlags.js";
import { t } from "../../../i18n/index.js";

// Added showInfoButton and infoType props
export default function StickyPageTitle({
    demoMode = false,
    loadingUpdated,
    finalLoaded,
    title,
    titleLogo,
    url,
    method,
    header,
    className,
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
    // One listener per mounted title, removed on unmount — it used to be added
    // on every render and never removed, so after navigating away the stale
    // listeners threw on the missing .infoHeader.
    const headerRef = React.useRef(null);
    React.useEffect(() => {
        const onScroll = () => headerRef.current?.classList.toggle("sticky", window.scrollY > 0);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    
    // New shell: the date range lives in the top bar. The page still owns the
    // range state — the control is just rendered into the bar's slot.
    const [dateSlot, setDateSlot] = React.useState(null);
    React.useEffect(() => {
        if (isNewShell()) setDateSlot(document.getElementById("shell-daterange-slot"));
    }, []);

    function openSideCart() {
        document.querySelector(".sideCart").classList.add("open");
    }

    const wrapDate = (el) => (dateSlot ? window.ReactDOM.createPortal(el, dateSlot) : el);

    if (!children) {
        return <>
            <div ref={headerRef} className={"infoHeader" + (className ? " " + className : "")} style={{ padding: "10px 0" }}>
                {loadingUpdated || finalLoaded ? <LoadingBar /> : null}
                <div className="dashboard-content" style={{
                    display: "grid",
                    gridTemplateColumns: "1fr .5fr",
                    alignItems: "center",
                }}>
                    <h1 className="sticky-title">
                        {titleLogo && (
                            <img src={titleLogo} alt="" aria-hidden="true" style={{ height: 28, width: 28, objectFit: "contain", verticalAlign: "middle", marginRight: 10, flexShrink: 0 }} />
                        )}
                        {/* Fixed page titles are translated here; names (domains etc.) pass through. */}
                        {typeof title === "string" ? t(title) : title}
                        {showInfoButton && (
                            <Button className="secondary" onClick={openSideCart}>i</Button>
                        )}
                    </h1>
                    {
                        (numberofDays && !(isNewShell() && !dateSlot)) ?
                            wrapDate(<Filter
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
                            />) : null
                    }
                </div>
            </div>
            {showInfoButton && <SideCart infoType={infoType} helpPage={infoType} />}
        </>
    } else {
        // With children
        return <>
            <div ref={headerRef} className="infoHeader" style={{ padding: "10px 0" }}>
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