const { useState } = React;

/** YYYY-MM-DD from a date-only string or Date, using local calendar day (avoids UTC shift from toISOString). */
function toDateKey(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(ymd) {
    const [y, m, day] = ymd.split("-").map(Number);
    return new Date(y, m - 1, day);
}

export default function Months({ currentMonth, year, selectedStartDate, selectedEndDate, setStartDate, setEndDate, setSelectedDays, setDateRange, today }) {
    const [clicked, setClicked] = useState({ isClicked: false, Date: "" });
    const getDatesBetween = (start, end) => {
        const dates = [];
        let cur = parseYmd(toDateKey(start));
        const endD = parseYmd(toDateKey(end));
        while (cur <= endD) {
            dates.push(toDateKey(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    };

    const rangeStartKey = toDateKey(selectedStartDate);
    const rangeEndKey = toDateKey(selectedEndDate);

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
                        // Derive YYYY-MM-DD from the cell's month + day number — not from grid index (index math was wrong for late-month days).
                        const date =
                            day != null
                                ? `${year}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                                : null;

                        let resultClass = "";

                        if (
                            date &&
                            day != null &&
                            rangeStartKey &&
                            rangeEndKey &&
                            rangeStartKey <= date &&
                            date <= rangeEndKey
                        ) {
                            resultClass = "bg-primary text-slate-100 flex justify-center items-center text-center p-4 w-[20px] h-[20px] cursor-pointer hover:text-slate-100 hover:bg-primaryHover rounded-full";
                        } else if (day != null && (today < date || date < "2022-01-01")) {
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
                                if (day === null || date == null || date > today) {
                                    return;
                                }

                                if (date < "2022-01-01") {
                                    return;
                                }

                                setClicked({ isClicked: true, Date: date });

                                if (!selectedStartDate || (selectedStartDate && selectedEndDate) || (selectedStartDate && selectedStartDate > date)) {
                                    setStartDate(date);
                                    setEndDate(null);
                                } else if (!selectedEndDate) {
                                    setEndDate(date);
                                    const calculatedDays = getDatesBetween(selectedStartDate, date).length;
                                    const startKey = toDateKey(selectedStartDate);
                                    const endKey = toDateKey(date);
                                    setSelectedDays(calculatedDays);
                                    setDateRange({ start: startKey, end: endKey });
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