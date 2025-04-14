import { useState } from "react";

export default function Months({ currentMonth, year, selectedStartDate, selectedEndDate, setStartDate, setEndDate, setSelectedDays, setDateRange, today }) {
    const [clicked, setClicked] = useState({ isClicked: false, Date: "" });
    const getDatesBetween = (start, end) => {
        let startDate = new Date(start);
        let endDate = new Date(end);
        let dates = [];

        while (startDate <= endDate) {
            dates.push(new Date(startDate).toISOString().split("T")[0]);
            startDate.setDate(startDate.getDate() + 1);
        }

        return dates;
    };

    return (
        <div className="w-full flex flex-wrap justify-center items-center">
            <section className="calendar-grid grid-cols-7 gap-2">
                {
                    /* Adding the week days of the current month not in US style */
                    ["M", "T", "O", "T", "F", "L", "S"].map((day, index) => (
                        <div key={index} className="text-center">
                            {day}
                        </div>
                    ))
                }
                {
                    [
                        ...new Array((new Date(year, currentMonth, 1).getDay() + 6) % 7).fill(null),
                        ...new Array(new Date(year, currentMonth + 1, 0).getDate()).fill(0).map((_, day) => day + 1),
                        ...new Array((7 - (new Date(year, currentMonth + 1, 0).getDay() + 6) % 7) % 7).fill(null),
                    ].map((day, index) => {
                        const firstDayOfWeek = new Date(year, currentMonth, 1).getDay();
                        let date = new Date(year, currentMonth, index - firstDayOfWeek + 2);
                        date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                        let resultClass = "";

                        if (date && day != null && new Date(selectedStartDate).toISOString().split("T")[0] <= date && date <= new Date(selectedEndDate).toISOString().split("T")[0]) {
                            resultClass = "bg-primary text-slate-100 flex justify-center items-center text-center p-4 w-[20px] h-[20px] cursor-pointer hover:text-slate-100 hover:bg-primaryHover rounded-full";
                        } else if (today < date || date < new Date("2024-06-03").toISOString().split("T")[0]) {
                            resultClass = "text-slate-200 flex justify-center items-center text-center p-4 w-[20px] h-[20px] cursor-pointer hover:text-slate-100 hover:bg-primaryHover rounded-full";
                        } else if (clicked.isClicked && clicked.Date === date) {
                            resultClass = "bg-primary text-slate-100 flex justify-center items-center text-center p-4 w-[20px] h-[20px] cursor-pointer hover:text-slate-100 hover:bg-primaryHover rounded-full";
                        } else if (day == null) {
                            resultClass = "flex justify-center items-center text-center p-4 w-[20px] h-[20px] cursor-pointer hover:text-slate-100 rounded-full";
                        } else {
                            resultClass = "flex justify-center items-center text-center p-4 w-[20px] h-[20px] cursor-pointer hover:text-slate-100 hover:bg-primaryHover rounded-full";
                        }

                        return (
                            <button onClick={() => {
                                if (day === null || date > today) {
                                    return;
                                }

                                if (date < new Date("2024-06-03").toISOString().split("T")[0]) {
                                    return;
                                }

                                setClicked({ isClicked: true, Date: date });

                                if (!selectedStartDate || (selectedStartDate && selectedEndDate) || (selectedStartDate && selectedStartDate > date)) {
                                    setStartDate(date);
                                    setEndDate(null);
                                } else if (!selectedEndDate) {
                                    setEndDate(date);
                                    const calculatedDays = getDatesBetween(selectedStartDate, date).length;
                                    /* Add to the selectedStartDate date one day */
                                    selectedStartDate = new Date(selectedStartDate);
                                    selectedStartDate.setDate(selectedStartDate.getDate());
                                    selectedStartDate = `${selectedStartDate.getFullYear()}-${String(selectedStartDate.getMonth() + 1).padStart(2, '0')}-${String(selectedStartDate.getDate()).padStart(2, '0')}`;

                                    let end = new Date(date);
                                    end.setDate(end.getDate());
                                    end = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
                                    setSelectedDays(calculatedDays);
                                    setDateRange({ start: selectedStartDate, end: end });
                                }
                            }} key={index} className={resultClass}>
                                {
                                    day
                                }
                            </button>
                        );
                    })
                }
            </section>
        </div>
    );
}