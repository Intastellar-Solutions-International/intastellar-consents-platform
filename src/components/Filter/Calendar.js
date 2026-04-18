const { useState, useRef, useEffect } = React;
import Months from "./Modules/Months";
import "./Styles/Calendar.css";

function formatLocalYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmdLocal(s) {
    if (!s) return new Date();
    const part = String(s).split("T")[0];
    const [y, m, d] = part.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export default function Calendar({
    selectedDays,
    setSelectedDays,
    startDate,
    endDate,
    setDateRange,
    comparePreviewStart,
    comparePreviewEnd,
}) {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const yesterdayStr = formatLocalYmd(today);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // new: track which year’s calendar is visible
    const [visibleYear, setVisibleYear] = useState(currentYear);
    const handlePrevYear = () => setVisibleYear((y) => y - 1);
    const handleNextYear = () => {
        if (visibleYear < currentYear) setVisibleYear((y) => y + 1);
    };

    // compute initial dateToBegin (local calendar math — avoids UTC shifts from toISOString)
    let dateToBegin = startDate;
    if (typeof selectedDays === "number" && selectedDays > 0 && endDate) {
        const endLocal = parseYmdLocal(endDate);
        const begin = new Date(endLocal);
        begin.setDate(begin.getDate() - selectedDays);
        dateToBegin = formatLocalYmd(begin);
    }
    const [selectedStartDate, setStartDate] = useState(dateToBegin);
    const [selectedEndDate, setEndDate] = useState(endDate);

    useEffect(() => {
        setEndDate(endDate);
        if (typeof selectedDays === "number" && selectedDays > 0 && endDate) {
            const endLocal = parseYmdLocal(endDate);
            const begin = new Date(endLocal);
            begin.setDate(begin.getDate() - selectedDays);
            setStartDate(formatLocalYmd(begin));
        } else if (startDate) {
            setStartDate(startDate);
        }
    }, [startDate, endDate, selectedDays]);

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
    const scrollTargetMonthRef = useRef(null);

    /** Month index in `monthsToShow` that should be scrolled into view (current month this year, else December). */
    const scrollFocusMonthIndex =
        visibleYear === currentYear ? currentMonth : visibleYear < currentYear ? 11 : 0;

    useEffect(() => {
        const el = scrollTargetMonthRef.current;
        const scroller = containerRef.current;
        if (!el || !scroller) return;

        const run = () => {
            el.scrollIntoView({ block: "center", behavior: "instant" });
            if (typeof el.focus === "function") {
                try {
                    el.focus({ preventScroll: true });
                } catch {
                    el.focus();
                }
            }
        };

        const id = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(run);
        });
        return () => window.cancelAnimationFrame(id);
    }, [visibleYear, currentYear, currentMonth, monthsToShow.length]);

    return (
        <div ref={containerRef} className="filter-cal-scroll will-change-scroll">
            <div className="p-2 filter-cal-inner">
                <div className="filter-cal-year-nav" role="navigation" aria-label="Calendar year">
                    <button type="button" onClick={handlePrevYear} className="filter-cal-year-nav__btn" aria-label="Previous year">
                        &lsaquo;
                    </button>
                    <span className="filter-cal-year-nav__label">{visibleYear}</span>
                    <button
                        type="button"
                        onClick={handleNextYear}
                        className="filter-cal-year-nav__btn"
                        disabled={visibleYear === currentYear}
                        aria-label="Next year"
                    >
                        &rsaquo;
                    </button>
                </div>
                {comparePreviewStart && comparePreviewEnd ? (
                    <p className="filter-cal-compare-preview" role="status">
                        <span className="filter-cal-compare-preview__label">Comparison preview</span>
                        <span className="filter-cal-compare-preview__range">
                            {comparePreviewStart} → {comparePreviewEnd}
                        </span>
                        <span className="filter-cal-compare-preview__hint">
                            Gold band: selected period · Blue band: comparison baseline
                        </span>
                    </p>
                ) : null}
                {
                    monthsToShow.map((month, index) => {
                        const isScrollFocus = index === scrollFocusMonthIndex;
                        return (
                        <div
                            key={visibleYear + "-" + month}
                            ref={isScrollFocus ? scrollTargetMonthRef : null}
                            className={
                                "filter-cal-month-block" +
                                (isScrollFocus ? " filter-cal-month-block--scroll-focus" : "")
                            }
                            tabIndex={isScrollFocus ? -1 : undefined}
                            aria-current={
                                visibleYear === currentYear && index === currentMonth ? "true" : undefined
                            }
                        >
                            <h2 className="filter-cal-month-title" id={`filter-cal-month-h-${visibleYear}-${index}`}>
                                {month} {visibleYear}
                            </h2>
                            <Months
                                currentMonth={index}
                                year={visibleYear}
                                selectedStartDate={selectedStartDate}
                                selectedEndDate={selectedEndDate}
                                setStartDate={setStartDate}
                                setEndDate={setEndDate}
                                setSelectedDays={setSelectedDays}
                                setDateRange={setDateRange}
                                today={yesterdayStr}
                                compareRangeStart={comparePreviewStart}
                                compareRangeEnd={comparePreviewEnd}
                            />
                        </div>
                        );
                    })
                }
            </div>
        </div>
    );
}