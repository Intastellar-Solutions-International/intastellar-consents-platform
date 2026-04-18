import "./Styles/Filter.css";
const { useState, useEffect, useMemo } = React;
import Calendar from "./Calendar.js";
import { useUserLocale } from "../../Functions/userLocale.js";
import {
    ymdLocal,
    parseYmdLocal,
    inclusiveDayCount,
    rangeLastWeek,
    rangeThisWeek,
    rangeQuarterToDate,
    rangeThisYearToDate,
    computeCompareWindow,
    addDays,
} from "./filterDatePresets.js";

function filterPresetBtnClass(isActive) {
    return "filter-calendar-preset" + (isActive ? " filter-calendar-preset--active" : "");
}

function toCalendarDay(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    return parseYmdLocal(value);
}

export default function Filter({
    className,
    numberOfDays,
    setNumberOfDays,
    compareRange = 0,
    setCompareRange,
    date,
    setFromDate,
    setToDate,
    setCompareWindowStart,
    setCompareWindowEnd,
    demoMode,
}) {
    const locale = useUserLocale();
    const compareSwitchLabelId = React.useId();
    const compareRangeCheck = compareRange !== 0 && compareRange != null;

    const [calendar, setCalendar] = useState(false);
    const [isCompare, setIsCompare] = useState(compareRangeCheck);
    const [selectedDays, setSelectedDays] = useState(numberOfDays);
    const [selectedCompareRange, setSelectedCompareRange] = useState(compareRange);
    const [selectedComparison, setSelectedComparison] = useState(
        compareRange === numberOfDays
            ? "Previous period"
            : compareRange === numberOfDays * 2
              ? "Preceding period"
              : compareRange === numberOfDays * 3
                ? "Previous quarter"
                : compareRange === numberOfDays * 6
                  ? "Last 180 days"
                  : compareRange === "Same period last year"
                    ? "Same period last year"
                    : "Previous period"
    );
    const [dateRange, setDateRange] = useState({
        start: new Date(date.start)?.toISOString()?.split("T")[0],
        end: new Date(date.end)?.toISOString()?.split("T")[0],
    });

    const compareStart = date?.previousStart;
    const compareEnd = date?.previousEnd;

    const primarySpanDays = useMemo(() => {
        const a = parseYmdLocal(dateRange?.start);
        const b = parseYmdLocal(dateRange?.end);
        if (!Number.isFinite(a?.getTime()) || !Number.isFinite(b?.getTime())) return 1;
        return inclusiveDayCount(a, b);
    }, [dateRange?.start, dateRange?.end]);

    const previewCompare = useMemo(() => {
        if (!isCompare) return null;
        const ps = parseYmdLocal(dateRange?.start);
        const pe = parseYmdLocal(dateRange?.end);
        if (!Number.isFinite(ps?.getTime()) || !Number.isFinite(pe?.getTime())) return null;
        try {
            return computeCompareWindow(ps, pe, selectedComparison, selectedCompareRange);
        } catch {
            return null;
        }
    }, [isCompare, dateRange?.start, dateRange?.end, selectedComparison, selectedCompareRange]);

    useEffect(() => {
        setIsCompare(compareRange !== 0 && compareRange != null);
    }, [compareRange]);

    useEffect(() => {
        if (compareRange === "Same period last year") {
            setSelectedCompareRange("Same period last year");
        } else if (typeof compareRange === "number") {
            setSelectedCompareRange(compareRange);
        }
    }, [compareRange]);

    useEffect(() => {
        setDateRange({
            start: new Date(date.start)?.toISOString()?.split("T")[0],
            end: new Date(date.end)?.toISOString()?.split("T")[0],
        });
    }, [date?.start, date?.end]);

    const endXDays = dateRange?.end;
    const startXDays = dateRange?.start;

    function handleCalendarToggle() {
        setCalendar(!calendar);
    }

    function applyLocalRange(startDate, endDate, selectedLabel, compareRangeUpdater) {
        const s = ymdLocal(startDate);
        const e = ymdLocal(endDate);
        setDateRange({ start: s, end: e });
        setSelectedDays(selectedLabel);
        if (typeof compareRangeUpdater === "function") {
            compareRangeUpdater();
        } else if (compareRangeUpdater != null) {
            setSelectedCompareRange(compareRangeUpdater);
        }
    }

    function lastNDaysRelative(n, labelNum) {
        const y = addDays(new Date(), -1);
        const end = new Date(y.getFullYear(), y.getMonth(), y.getDate());
        const start = addDays(end, -(n - 1));
        applyLocalRange(start, end, labelNum, () => {
            if (selectedComparison === "Previous period") setSelectedCompareRange(n + 1);
            else if (selectedComparison === "Preceding period") setSelectedCompareRange((n + 1) * 2);
            else if (selectedComparison === "Previous quarter") setSelectedCompareRange((n + 1) * 3);
            else if (selectedComparison === "Last 180 days") setSelectedCompareRange((n + 1) * 6);
            else if (selectedComparison === "Same period last year") setSelectedCompareRange((n + 1) * 12);
            else setSelectedCompareRange(n + 1);
        });
    }

    function applyLastYearCalendar() {
        const year = new Date().getFullYear();
        const start = new Date(year - 1, 0, 2);
        const end = new Date(year - 1, 11, 31);
        applyLocalRange(start, end, 365, () => {
            if (selectedComparison === "Previous period") setSelectedCompareRange(366);
            else if (selectedComparison === "Preceding period") setSelectedCompareRange(366 * 2);
            else if (selectedComparison === "Previous quarter") setSelectedCompareRange(366 * 3);
            else if (selectedComparison === "Last 180 days") setSelectedCompareRange(366 * 6);
            else if (selectedComparison === "Same period last year") setSelectedCompareRange(366 * 12);
            else setSelectedCompareRange(366);
        });
    }

    function handleApply(e) {
        e.preventDefault();
        handleCalendarToggle();
        const ps = parseYmdLocal(startXDays);
        const pe = parseYmdLocal(endXDays);
        setFromDate(ps);
        setToDate(pe);

        if (typeof setNumberOfDays === "function") {
            const n = inclusiveDayCount(ps, pe);
            setNumberOfDays(n);
        }

        if (!isCompare) {
            setCompareRange?.(0);
            return;
        }
        if (!setCompareRange) return;

        const win = computeCompareWindow(ps, pe, selectedComparison, selectedCompareRange);
        if (win && setCompareWindowStart && setCompareWindowEnd) {
            setCompareWindowStart(win.start);
            setCompareWindowEnd(win.end);
        }
        const span = inclusiveDayCount(ps, pe);
        if (selectedComparison === "Same period last year") {
            setCompareRange("Same period last year");
        } else {
            setCompareRange(selectedCompareRange || span);
        }
    }

    const badgeText =
        typeof numberOfDays === "number" && numberOfDays >= 0
            ? "Last " + numberOfDays + " days"
            : String(numberOfDays ?? "");

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
                <span className="filter-calendar-trigger__badge">{badgeText}</span>
                <span className="filter-calendar-trigger__dates">
                    {demoMode && (
                        <span className="filter-calendar-trigger__line filter-calendar-trigger__line--demo">Demo mode</span>
                    )}
                    {!demoMode && (
                        <span className="filter-calendar-trigger__line">
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parseYmdLocal(startXDays))}
                            <span className="filter-calendar-trigger__sep">→</span>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parseYmdLocal(endXDays))}
                        </span>
                    )}
                    {compareRangeCheck && compareStart && compareEnd ? (
                        <span className="filter-calendar-trigger__line filter-calendar-trigger__line--compare">
                            <span className="filter-calendar-trigger__compare-kicker">vs</span>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(toCalendarDay(compareStart))}
                            <span className="filter-calendar-trigger__sep">→</span>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(toCalendarDay(compareEnd))}
                        </span>
                    ) : null}
                </span>
            </button>
            {calendar && (
                <div className="filter-calendar-popover" role="dialog" aria-label="Choose date range">
                    <section className="filter-calendar-popover__body">
                        <section className="filter-calendar-presets">
                            <div className="filter-calendar-presets__toggle-row">
                                <span className="filter-calendar-compare-toggle__label" id={compareSwitchLabelId}>
                                    Compare to prior period
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isCompare}
                                    aria-labelledby={compareSwitchLabelId}
                                    className={
                                        "filter-calendar-compare-switch" +
                                        (isCompare ? " filter-calendar-compare-switch--on" : "")
                                    }
                                    onClick={() => setIsCompare((v) => !v)}
                                >
                                    <span className="filter-calendar-compare-switch__thumb" aria-hidden="true" />
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    const y = addDays(new Date(), -1);
                                    const end = new Date(y.getFullYear(), y.getMonth(), y.getDate());
                                    const start = addDays(end, -2);
                                    applyLocalRange(start, end, "Yesterday", () => {
                                        if (selectedComparison === "Previous period") return setSelectedCompareRange(4);
                                        if (selectedComparison === "Preceding period") return setSelectedCompareRange(8);
                                        if (selectedComparison === "Previous quarter") return setSelectedCompareRange(12);
                                        if (selectedComparison === "Last 180 days") return setSelectedCompareRange(24);
                                        if (selectedComparison === "Same period last year") return setSelectedCompareRange(48);
                                        return setSelectedCompareRange(4);
                                    });
                                }}
                                className={filterPresetBtnClass(selectedDays === "Yesterday")}
                            >
                                Yesterday
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    lastNDaysRelative(7, 7);
                                }}
                                className={filterPresetBtnClass(selectedDays === 7)}
                            >
                                Last 7 days
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    const { start, end } = rangeLastWeek();
                                    applyLocalRange(start, end, "last_week", () =>
                                        setSelectedCompareRange(inclusiveDayCount(start, end) + 1)
                                    );
                                }}
                                className={filterPresetBtnClass(selectedDays === "last_week")}
                            >
                                Last week
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    const { start, end } = rangeThisWeek();
                                    applyLocalRange(start, end, "this_week", () =>
                                        setSelectedCompareRange(inclusiveDayCount(start, end) + 1)
                                    );
                                }}
                                className={filterPresetBtnClass(selectedDays === "this_week")}
                            >
                                This week
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    lastNDaysRelative(28, 28);
                                }}
                                className={filterPresetBtnClass(selectedDays === 28)}
                            >
                                Last 28 days
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    lastNDaysRelative(30, 30);
                                }}
                                className={filterPresetBtnClass(selectedDays === 30)}
                            >
                                Last 30 days
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    const { start, end } = rangeQuarterToDate();
                                    applyLocalRange(start, end, "qtd", () =>
                                        setSelectedCompareRange(inclusiveDayCount(start, end) + 1)
                                    );
                                }}
                                className={filterPresetBtnClass(selectedDays === "qtd")}
                            >
                                Quarter to date
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    const { start, end } = rangeThisYearToDate();
                                    applyLocalRange(start, end, "ytd", () =>
                                        setSelectedCompareRange(inclusiveDayCount(start, end) + 1)
                                    );
                                }}
                                className={filterPresetBtnClass(selectedDays === "ytd")}
                            >
                                This year
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    lastNDaysRelative(90, 90);
                                }}
                                className={filterPresetBtnClass(selectedDays === 90)}
                            >
                                Last 90 days
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    lastNDaysRelative(12 * 30, "12 months");
                                }}
                                className={filterPresetBtnClass(selectedDays === "12 months")}
                            >
                                Last 12 months
                            </button>
                            <button type="button" onClick={(e) => { e.preventDefault(); applyLastYearCalendar(); }} className={filterPresetBtnClass(selectedDays === 365)}>
                                Last year
                            </button>

                            <section className="filter-calendar-presets__compare-wrap">
                                {isCompare && (
                                    <section className="filter-calendar-presets__compare">
                                        <p className="filter-calendar-presets__compare-label">Comparison baseline</p>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedComparison("Previous period");
                                                setSelectedCompareRange(primarySpanDays);
                                            }}
                                            className={filterPresetBtnClass(selectedComparison === "Previous period")}
                                        >
                                            Previous period
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedComparison("Preceding period");
                                                setSelectedCompareRange(primarySpanDays * 2);
                                            }}
                                            className={filterPresetBtnClass(selectedComparison === "Preceding period")}
                                        >
                                            Preceding period
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedComparison("Previous quarter");
                                                setSelectedCompareRange(90);
                                            }}
                                            className={filterPresetBtnClass(selectedComparison === "Previous quarter")}
                                        >
                                            Compare window 90 days
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedComparison("Last 180 days");
                                                setSelectedCompareRange(180);
                                            }}
                                            className={filterPresetBtnClass(selectedComparison === "Last 180 days")}
                                        >
                                            Compare window 180 days
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedComparison("Same period last year");
                                                setSelectedCompareRange("Same period last year");
                                            }}
                                            className={filterPresetBtnClass(selectedComparison === "Same period last year")}
                                        >
                                            Same period last year
                                        </button>
                                    </section>
                                )}
                            </section>
                        </section>
                        <div className="filter-calendar-popover__calendar-wrap">
                            <Calendar
                                compareRange={compareRange}
                                selectedDays={selectedDays}
                                setSelectedDays={setSelectedDays}
                                startDate={dateRange.start}
                                endDate={dateRange.end}
                                setDateRange={setDateRange}
                                handleCalendarToggle={handleCalendarToggle}
                                comparePreviewStart={previewCompare ? ymdLocal(previewCompare.start) : null}
                                comparePreviewEnd={previewCompare ? ymdLocal(previewCompare.end) : null}
                            />
                        </div>
                    </section>
                    <footer className="filter-calendar-popover__footer">
                        <button type="button" onClick={handleCalendarToggle} className="filter-calendar-popover__btn filter-calendar-popover__btn--secondary">
                            Cancel
                        </button>
                        <button type="button" onClick={handleApply} className="filter-calendar-popover__btn filter-calendar-popover__btn--primary">
                            Apply
                        </button>
                    </footer>
                </div>
            )}
        </div>
    );
}
