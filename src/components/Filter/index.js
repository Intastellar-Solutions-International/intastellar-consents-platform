import "./Styles/Filter.css";
const { useState, useEffect } = React;
/* import { ToggleButton } from "~/components"; */
import Calendar from "./Calendar.js";
import { useUserLocale } from "../../Functions/userLocale.js";

function filterPresetBtnClass(isActive) {
    return "filter-calendar-preset" + (isActive ? " filter-calendar-preset--active" : "");
}

export default function Filter({
    className,
    numberOfDays,
    setNumberOfDays,
    compareRange,
    date,
    setFromDate,       // ← new
    setToDate,         // ← new
    demoMode
}) {
    const locale = useUserLocale();
    const compareRangeCheck = compareRange === 0 ? false : true;

    const [calendar, setCalendar] = useState(false);
    const [isCompare, setIsCompare] = useState(compareRangeCheck);
    const [selectedDays, setSelectedDays] = useState(numberOfDays);
    const [selectedCompareRange, setSelectedCompareRange] = useState(compareRange);
    const [selectedComparison, setSelectedComparison] = useState(
        compareRange === selectedDays ? "Previous period"
            : compareRange === selectedDays * 2 ? "Preceding period"
                : compareRange === selectedDays * 3 ? "Previous quarter"
                    : compareRange === selectedDays * 6 ? "Last 180 days"
                        : compareRange === "Same period last year" ? "Same period last year"
                            : "Previous period"
    );
    const [dateRange, setDateRange] = useState({
        start: new Date(date.start)?.toISOString()?.split("T")[0],
        end: new Date(date.end)?.toISOString()?.split("T")[0],
    });

    useEffect(() => {
        setNumberOfDays(selectedDays);
    }, [selectedDays]);

    /*  const navigate = useNavigate(); */
    const endXDays = dateRange?.end;
    const startXDays = dateRange?.start;
    const previousPeriod = date?.previousStart;
    const previousPeriod2 = date?.previousEnd;

    function handleCalendarToggle() {
        setCalendar(!calendar);
    }

    return (
        <div
            className={`filter-calendar-root calendar relative z-40 ${calendar ? "filter-calendar-root--open" : ""} ${className ?? ""}`.trim()}
        >
            <button
                type="button"
                className="filter-calendar-trigger transparent"
                aria-expanded={calendar}
                aria-haspopup="dialog"
                onClick={handleCalendarToggle}
            >
                <span className="filter-calendar-trigger__badge">
                    {numberOfDays >= 0 ? "Last " + numberOfDays + " days" : numberOfDays}
                </span>
                <span className="filter-calendar-trigger__dates">
                    {demoMode && <span className="filter-calendar-trigger__line filter-calendar-trigger__line--demo">Demo mode</span>}
                    {!demoMode && (
                        <span className="filter-calendar-trigger__line">
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(startXDays))}
                            <span className="filter-calendar-trigger__sep">→</span>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(endXDays))}
                        </span>
                    )}
                    {compareRangeCheck ? (
                        <span className="filter-calendar-trigger__line filter-calendar-trigger__line--compare">
                            <span className="filter-calendar-trigger__compare-kicker">vs</span>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(previousPeriod2))}
                            <span className="filter-calendar-trigger__sep">→</span>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(previousPeriod))}
                        </span>
                    ) : null}
                </span>
            </button>
            {calendar && (
                <div className="filter-calendar-popover" role="dialog" aria-label="Choose date range">
                    <section className="filter-calendar-popover__body">
                        <section className="filter-calendar-presets">
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 3;
                                const end = new Date().toISOString().split("T")[0];

                                date.end = new Date(new Date(end).setDate(new Date().getDate() - 1)).toISOString().split("T")[0];
                                date.start = new Date(new Date().setDate(new Date().getDate() - value + 1)).toISOString().split("T")[0];
                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays("Yesterday");
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value + 1);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value + 1 * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value + 1 * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value + 1 * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value + 1 * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === "Yesterday")}>Yesterday</button>
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 7;
                                const end = new Date().toISOString().split("T")[0];

                                date.end = new Date(new Date(end).setDate(new Date().getDate() - 1)).toISOString().split("T")[0];
                                date.start = new Date(new Date().setDate(new Date().getDate() - value + 1)).toISOString().split("T")[0];
                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays(value);
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value + 1);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value + 1 * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value + 1 * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value + 1 * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value + 1 * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === 7)}>Last 7 days</button>
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 28;
                                const end = new Date().toISOString().split("T")[0];

                                date.end = new Date(new Date(end).setDate(new Date().getDate() - 1)).toISOString().split("T")[0];
                                date.start = new Date(new Date().setDate(new Date().getDate() - value + 1)).toISOString().split("T")[0];
                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays(value);
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value + 1);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value + 1 * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value + 1 * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value + 1 * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value + 1 * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === 28)}>Last 28 days</button>
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 30;
                                const end = new Date().toISOString().split("T")[0];

                                date.end = new Date(new Date(end).setDate(new Date().getDate() - 1)).toISOString().split("T")[0];
                                date.start = new Date(new Date().setDate(new Date().getDate() - value + 1)).toISOString().split("T")[0];
                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays(value);
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value + 1);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value + 1 * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value + 1 * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value + 1 * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value + 1 * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === 30)}>Last 30 days</button>
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 90;
                                const end = new Date().toISOString().split("T")[0];

                                date.end = new Date(new Date(end).setDate(new Date().getDate() - 1)).toISOString().split("T")[0];
                                date.start = new Date(new Date().setDate(new Date().getDate() - value + 1)).toISOString().split("T")[0];

                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays(value);
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === 90)}>Last 90 days</button>
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 12 * 30;
                                const end = new Date().toISOString().split("T")[0];

                                date.end = new Date(new Date(end).setDate(new Date().getDate() - 1)).toISOString().split("T")[0];
                                date.start = new Date(new Date().setDate(new Date().getDate() - value + 1)).toISOString().split("T")[0];

                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays("12 months");
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === "12 months")}>Last 12 months</button>
                            <button onClick={(e) => {
                                e.preventDefault();
                                const value = 365;
                                // Calculate the end date to the previous 31. december of the previous year
                                const end = new Date().toISOString().split("T")[0];
                                const year = new Date().getFullYear();
                                const lastYear = new Date(year - 1, 11, 32).toISOString().split("T")[0];

                                // Calculate the start date to the previous 1. january of the previous year
                                const start = new Date(year - 1, 0, 1).toISOString().split("T")[0];

                                // Add to the start date + 1 day
                                date.start = new Date(new Date(start).setDate(new Date(start).getDate() + 1)).toISOString().split("T")[0];

                                date.end = lastYear;

                                setDateRange({ start: date.start, end: date.end });
                                setSelectedDays(value);
                                if (selectedComparison === "Previous period") {
                                    setSelectedCompareRange(value + 1);
                                } else if (selectedComparison === "Preceding period") {
                                    setSelectedCompareRange(value + 1 * 2);
                                } else if (selectedComparison === "Previous quarter") {
                                    setSelectedCompareRange(value + 1 * 3);
                                } else if (selectedComparison === "Last 180 days") {
                                    setSelectedCompareRange(value + 1 * 6);
                                } else if (selectedComparison === "Same period last year") {
                                    setSelectedCompareRange(value + 1 * 12);
                                }
                            }} className={filterPresetBtnClass(selectedDays === 365)}>Last year</button>
                            <section className="filter-calendar-presets__compare-wrap">
                                {/* {isCompare ? <div className="flex justify-between px-2">Compare <ToggleButton enabled={true} onChange={() => {
                                    setIsCompare(!isCompare);
                                }} /></div> : <div className="flex justify-between px-2">Compare <ToggleButton enabled={false} onChange={() => {
                                    setIsCompare(!isCompare);
                                }} /></div>} */}
                                {isCompare && (
                                    <section className="filter-calendar-presets__compare">
                                        <p className="filter-calendar-presets__compare-label">Comparison baseline</p>
                                        <button onClick={(e) => {
                                            e.preventDefault();
                                            const name = "Previous period";
                                            setSelectedComparison(name);
                                            setSelectedCompareRange(selectedDays);
                                        }} className={filterPresetBtnClass(selectedComparison === "Previous period")}>Previous period</button>
                                        <button onClick={(e) => {
                                            e.preventDefault();
                                            const name = "Preceding period";
                                            setSelectedComparison(name);
                                            setSelectedCompareRange(selectedDays * 2);
                                        }} className={filterPresetBtnClass(selectedComparison === "Preceding period")}>Preceding period</button>
                                        <button onClick={(e) => {
                                            e.preventDefault();
                                            const name = "Previous quarter";
                                            setSelectedComparison(name);
                                            setSelectedCompareRange(90);
                                        }} className={filterPresetBtnClass(selectedComparison === "Previous quarter")}>Last 90 days</button>
                                        <button onClick={(e) => {
                                            e.preventDefault();
                                            const name = "Last 180 days";
                                            setSelectedComparison(name);
                                            setSelectedCompareRange(180);
                                        }} className={filterPresetBtnClass(selectedComparison === "Last 180 days")}>Last 180 days</button>
                                        <button onClick={(e) => {
                                            e.preventDefault();
                                            const name = "Same period last year";
                                            setSelectedComparison(name);
                                            setSelectedCompareRange(name);
                                        }} className={filterPresetBtnClass(selectedComparison === "Same period last year")}>Same period last year</button>
                                    </section>
                                )}
                            </section>
                        </section>
                        <div className="filter-calendar-popover__calendar-wrap">
                            <Calendar compareRange={compareRange} selectedDays={selectedDays} setSelectedDays={setSelectedDays} startDate={dateRange.start} endDate={dateRange.end} setDateRange={setDateRange} handleCalendarToggle={handleCalendarToggle} />
                        </div>
                    </section>
                    <footer className="filter-calendar-popover__footer">
                        <button type="button" onClick={handleCalendarToggle} className="filter-calendar-popover__btn filter-calendar-popover__btn--secondary">
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                handleCalendarToggle();
                                setFromDate(new Date(startXDays));
                                setToDate(new Date(endXDays));
                            }}
                            className="filter-calendar-popover__btn filter-calendar-popover__btn--primary"
                        >
                            Apply
                        </button>
                    </footer>
                </div>
            )
            }
        </div>
    );
}