const { useState, useRef } = React;
import Months from "./Modules/Months";
import "./Styles/Calendar.css";

export default function Calendar({ selectedDays, setSelectedDays, startDate, endDate, setDateRange }) {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // new: track which year’s calendar is visible
    const [visibleYear, setVisibleYear] = useState(currentYear);
    const handlePrevYear = () => setVisibleYear((y) => y - 1);
    const handleNextYear = () => {
        if (visibleYear < currentYear) setVisibleYear((y) => y + 1);
    };

    // compute initial dateToBegin
    let dateToBegin = startDate;
    if (selectedDays > 0) {
        dateToBegin = new Date(new Date(endDate).setDate(new Date(endDate).getDate() - selectedDays))
            .toISOString().split("T")[0];
    }
    const [selectedStartDate, setStartDate] = useState(dateToBegin);
    const [selectedEndDate, setEndDate] = useState(endDate);

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    // decide which months to render
    const monthsToShow =
        visibleYear === currentYear
            ? months.slice(0, currentMonth + 1)
            : months;

    const containerRef = useRef(null);

    const handleScroll = (e) => {
        if (e.target.scrollTop < 50) {
            handlePrevYear();
        } else if (e.target.scrollTop > containerRef.current.scrollHeight - e.target.clientHeight - 50) {
            handleNextYear();
        }
    };

    return (
        <div
            ref={containerRef}
            /* onScroll={handleScroll} */
            className="overflow-auto will-change-scroll flex flex-col-reverse"
            style={{
                scrollSnapType: "y mandatory",
                scrollBehavior: "smooth",
            }}
        >
            <div className="p-2">
                {/* year navigation */}
                <div className="flex justify-between items-center mb-2">
                    <button onClick={handlePrevYear} className="px-2">&lsaquo;</button>
                    <span className="font-semibold">{visibleYear}</span>
                    <button onClick={handleNextYear} className="px-2" disabled={visibleYear === currentYear}>&rsaquo;</button>
                </div>
                {
                    monthsToShow.map((month, index) => (
                        <div key={index + "-" + visibleYear} className="mt-3">
                            <h2 className="font-semibold">{month}</h2>
                            <Months
                                currentMonth={index}
                                year={visibleYear}
                                selectedStartDate={selectedStartDate}
                                selectedEndDate={selectedEndDate}
                                setStartDate={setStartDate}
                                setEndDate={setEndDate}
                                setSelectedDays={setSelectedDays}
                                setDateRange={setDateRange}
                                today={today.toISOString().split("T")[0]}
                            />
                        </div>
                    ))
                }
            </div>
        </div>
    );
}