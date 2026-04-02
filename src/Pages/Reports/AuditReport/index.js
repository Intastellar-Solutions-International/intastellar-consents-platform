import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks } from "../Reports";
import { useState } from "react";

export default function AuditReport() {
    const today = new Date();
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(new Date().getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date());
    const previousPeriod = new Date(new Date().setDate(today.getDate() - getLastDays));
    const previousPeriod2 = new Date(new Date().setDate(today.getDate() - getLastDays * 2));
    const [activeData, setActiveData] = useState(null);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: "1" }}>
                <StickyPageTitle loadingUpdated={false} finalLoaded={true} title="Audit report" numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
                <div className="dashboard-content">
                    <section className="filter">
                        {/* <Filter url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} date={{
                            start: fromDate,
                            end: toDate,
                            previousStart: previousPeriod,
                            previousEnd: previousPeriod2,
                        }} setFromDate={setFromDate} setToDate={setToDate} /> */}   
                    </section>
                </div>
            </article>
        </>
    )
}