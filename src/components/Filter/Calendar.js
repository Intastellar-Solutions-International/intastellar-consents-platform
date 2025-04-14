import { useState } from "react";
import Months from "./Modules/Months";
import "./Styles/Calendar.css";

export default function Calendar({ selectedDays, setSelectedDays, startDate, endDate, setDateRange }) {
    let dateToBegin = startDate;
    if (selectedDays > 0) {
        /* Subtract the selectedDays value for the end date */
        dateToBegin = new Date(new Date(endDate).setDate(new Date(endDate).getDate() - selectedDays)).toISOString().split("T")[0];
    }
    const [selectedStartDate, setStartDate] = useState(dateToBegin);
    const [selectedEndDate, setEndDate] = useState(endDate);

    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];

    const today = new Date();
    today.setDate(today.getDate() - 1);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    return (
        <div className="overflow-auto will-change-scroll flex flex-col-reverse" style={{
            scrollSnapType: "y mandatory",
            scrollBehavior: "smooth",
        }}>
            <div className="p-2">
                {
                    months.slice(0, currentMonth + 1).map((month, index) => {
                        return (
                            <div key={index} className="mt-3">
                                <h2 className="font-semibold">{month}</h2>
                                <Months
                                    key={index}
                                    currentMonth={index}
                                    year={currentYear}
                                    selectedStartDate={selectedStartDate}
                                    selectedEndDate={selectedEndDate}
                                    setStartDate={setStartDate}
                                    setEndDate={setEndDate}
                                    setSelectedDays={setSelectedDays}
                                    setDateRange={setDateRange}
                                    today={today.toISOString().split("T")[0]}
                                />
                            </div>
                        );
                    })
                }
            </div>
        </div>
    )
}