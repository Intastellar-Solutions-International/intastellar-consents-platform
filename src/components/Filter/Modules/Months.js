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

function ymdFromDay(year, monthIndex, dayNum) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

function addDaysYmd(ymd, deltaDays) {
    const d = parseYmd(ymd);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + deltaDays);
    return toDateKey(d);
}

/**
 * Caps + horizontal bridge for a contiguous ISO date range on the month grid.
 * Bridges only when the previous/next calendar day is in range AND sits in the adjacent grid cell.
 */
function rangeSegmentFlags(dateKey, rangeStart, rangeEnd, cellIndex, cells, year, monthIndex) {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return null;
    if (dateKey < rangeStart || dateKey > rangeEnd) return null;
    const prevKey = addDaysYmd(dateKey, -1);
    const nextKey = addDaysYmd(dateKey, 1);
    const prevInRange = prevKey >= rangeStart && prevKey <= rangeEnd;
    const nextInRange = nextKey >= rangeStart && nextKey <= rangeEnd;
    const leftDay = cellIndex > 0 ? cells[cellIndex - 1] : null;
    const leftDate = leftDay != null ? ymdFromDay(year, monthIndex, leftDay) : null;
    const rightDay = cellIndex + 1 < cells.length ? cells[cellIndex + 1] : null;
    const rightDate = rightDay != null ? ymdFromDay(year, monthIndex, rightDay) : null;
    const bridgeLeft = prevInRange && leftDate === prevKey;
    const bridgeRight = nextInRange && rightDate === nextKey;
    return {
        capLeft: !prevInRange,
        capRight: !nextInRange,
        bridgeLeft,
        bridgeRight,
    };
}

function appendRangeGeometry(classes, seg, prefix) {
    if (!seg) return;
    if (seg.capLeft) classes.push(`${prefix}cap-left`);
    if (seg.capRight) classes.push(`${prefix}cap-right`);
    if (seg.bridgeLeft) classes.push(`${prefix}bridge-left`);
    if (seg.bridgeRight) classes.push(`${prefix}bridge-right`);
}

export default function Months({
    currentMonth,
    year,
    selectedStartDate,
    selectedEndDate,
    setStartDate,
    setEndDate,
    setSelectedDays,
    setDateRange,
    today,
    compareRangeStart = null,
    compareRangeEnd = null,
}) {
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

    const cmpStart =
        compareRangeStart && compareRangeEnd && compareRangeStart <= compareRangeEnd ? compareRangeStart : null;
    const cmpEnd = cmpStart ? compareRangeEnd : null;

    const monthCells = [
        ...new Array((new Date(year, currentMonth, 1).getDay() + 6) % 7).fill(null),
        ...new Array(new Date(year, currentMonth + 1, 0).getDate()).fill(0).map((_, day) => day + 1),
        ...new Array((7 - (new Date(year, currentMonth + 1, 0).getDay() + 6) % 7) % 7).fill(null),
    ];

    return (
        <div className="w-full flex flex-wrap justify-center items-center">
            <section className="calendar-grid grid-cols-7 gap-2">
                {["M", "T", "O", "T", "F", "L", "S"].map((day, index) => (
                    <div key={index} className="filter-cal-dow">
                        {day}
                    </div>
                ))}
                {monthCells.map((day, index) => {
                    const date =
                        day != null ? `${year}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;

                    const disabledFuture = day != null && date != null && date > today;
                    const disabledPast = day != null && date != null && date < "2022-01-01";
                    const disabled = disabledFuture || disabledPast;

                    const inPrimary =
                        Boolean(date && day != null && rangeStartKey && rangeEndKey && rangeStartKey <= date && date <= rangeEndKey);

                    const inCompare =
                        Boolean(date && day != null && cmpStart && cmpEnd && cmpStart <= date && date <= cmpEnd);

                    const primarySeg =
                        date && inPrimary ? rangeSegmentFlags(date, rangeStartKey, rangeEndKey, index, monthCells, year, currentMonth) : null;
                    const compareSeg =
                        date && inCompare ? rangeSegmentFlags(date, cmpStart, cmpEnd, index, monthCells, year, currentMonth) : null;

                    const classes = ["filter-cal-day"];

                    if (day == null) {
                        return <span key={index} className="filter-cal-day filter-cal-day--empty" aria-hidden="true" />;
                    }

                    if (disabled) {
                        classes.push("filter-cal-day--disabled");
                    } else if (inPrimary) {
                        classes.push("filter-cal-day--primary");
                        if (primarySeg) appendRangeGeometry(classes, primarySeg, "filter-cal-day--");
                        else {
                            classes.push("filter-cal-day--cap-left", "filter-cal-day--cap-right");
                        }
                        if (inCompare) classes.push("filter-cal-day--primary-with-compare");
                    } else if (inCompare) {
                        classes.push("filter-cal-day--compare");
                        if (compareSeg) appendRangeGeometry(classes, compareSeg, "filter-cal-day--cmp-");
                        else {
                            classes.push("filter-cal-day--cmp-cap-left", "filter-cal-day--cmp-cap-right");
                        }
                    } else if (clicked.isClicked && clicked.Date === date) {
                        classes.push("filter-cal-day--clicked");
                    } else {
                        classes.push("filter-cal-day--plain");
                    }

                    const resultClass = classes.join(" ");

                    return (
                        <button
                            onClick={() => {
                                if (date == null || date > today || date < "2022-01-01") {
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
                            }}
                            key={index}
                            type="button"
                            disabled={disabled}
                            className={resultClass}
                        >
                            {day}
                        </button>
                    );
                })}
            </section>
        </div>
    );
}
