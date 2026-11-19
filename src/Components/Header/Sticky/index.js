import Filter from "../../Filter/index.js";
import { LoadingBar } from "../../../Components/widget/Loading";
import Button from "../../Button/Button.js";
import { openHelp } from "../../Help/index.js";
import { isNewShell } from "../../../Functions/featureFlags.js";
import { t } from "../../../i18n/index.js";

// ── Date range ⇄ URL ──────────────────────────────────────────────────────
// Every dashboard page (CMP and Analytics) hands its range + setters to this
// header, so the URL sync lives here once instead of in ~60 pages: a refresh,
// the back button or a shared link keeps the selected range.
//   ?from=-30&to=today&days=30   rolling window ending today (stays "last 30
//                                days" when reopened tomorrow)
//   ?from=2026-10-01&to=2026-10-31&days=31   fixed custom range
// The default (last 30 days) isn't written, so URLs stay clean.
const DAY_MS = 24 * 60 * 60 * 1000;
function localYmd(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function startOfToday() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
}
export function readDateRangeFromUrl(search = window.location.search) {
    const q = new URLSearchParams(search);
    const from = q.get("from"), to = q.get("to");
    if (!from || !to) return null;
    const days = parseInt(q.get("days"), 10);
    if (to === "today") {
        const back = parseInt(from, 10);
        if (!Number.isFinite(back) || back > 0 || back < -3650) return null;
        const today = startOfToday();
        return { fromDate: new Date(today.getTime() + back * DAY_MS), toDate: new Date(), days: Number.isFinite(days) ? days : -back };
    }
    const f = parseYmd(from), t = parseYmd(to);
    if (!f || !t || f > t) return null;
    return { fromDate: f, toDate: t, days: Number.isFinite(days) ? days : Math.round((t - f) / DAY_MS) + 1 };
}
function writeDateRangeToUrl({ fromDate, toDate, days }) {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const today = startOfToday();
    const endsToday = localYmd(toDate) === localYmd(today);
    const back = Math.round((new Date(localYmd(fromDate) + "T00:00:00").getTime() - today.getTime()) / DAY_MS);
    const isDefault = endsToday && back === -30 && (days == null || days === 30);
    if (isDefault) {
        q.delete("from"); q.delete("to"); q.delete("days");
    } else if (endsToday) {
        q.set("from", String(back)); q.set("to", "today");
        if (days != null) q.set("days", String(days)); else q.delete("days");
    } else {
        q.set("from", localYmd(fromDate)); q.set("to", localYmd(toDate));
        if (days != null) q.set("days", String(days)); else q.delete("days");
    }
    const next = url.pathname + (q.toString() ? "?" + q.toString() : "") + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState(window.history.state, "", next);
    }
}

// Added showInfoButton and infoType props
// Below this the top bar has no room for the date range, so it sits in the page header.
const DATE_IN_PAGE_QUERY = "(max-width: 1180px)";

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
    // Optional controls (e.g. a page's filters) placed in the same row,
    // between the title and the date range, so the sticky header keeps its
    // one-line height; they scroll sideways when space runs out.
    toolbar,
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
    // On phones there is no room in the bar, so it stays with the page title.
    const [dateSlot, setDateSlot] = React.useState(null);
    const [dateInPage, setDateInPage] = React.useState(() => window.matchMedia(DATE_IN_PAGE_QUERY).matches);
    const dateInTopBar = isNewShell() && !dateInPage;
    React.useEffect(() => {
        const query = window.matchMedia(DATE_IN_PAGE_QUERY);
        const onChange = () => setDateInPage(query.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);
    React.useEffect(() => {
        setDateSlot(dateInTopBar ? document.getElementById("shell-daterange-slot") : null);
    }, [dateInTopBar]);

    // Restore the range from the URL once, then mirror every change back.
    // Pages without date setters (title-only headers) are left alone.
    const canSyncDates = typeof setFromDate === "function" && typeof setToDate === "function";
    const restoredRef = React.useRef(false);
    React.useEffect(() => {
        if (!canSyncDates || restoredRef.current) return;
        restoredRef.current = true;
        const fromUrl = readDateRangeFromUrl();
        if (!fromUrl) return;
        setFromDate(fromUrl.fromDate);
        setToDate(fromUrl.toDate);
        if (typeof numberofDays === "function") numberofDays(fromUrl.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    React.useEffect(() => {
        // Skip until the restore above has run, or the page's default range
        // would overwrite the URL before it's read.
        if (!canSyncDates || !restoredRef.current || !fromDate || !toDate) return;
        writeDateRangeToUrl({ fromDate, toDate, days: typeof getLastDays === "number" ? getLastDays : null });
    }, [canSyncDates, fromDate, toDate, getLastDays]);

    // The "i" button opens the matching Help hub article (src/help/articles/<infoType>.md);
    // an unknown id opens the hub's start page.
    function openPageHelp() {
        openHelp(infoType);
    }

    const wrapDate = (el) => (dateSlot ? window.ReactDOM.createPortal(el, dateSlot) : el);

    if (!children) {
        return <>
            <div ref={headerRef} className={"infoHeader" + (className ? " " + className : "") + (toolbar ? " infoHeader--toolbar" : "")} style={{ padding: "10px 0" }}>
                {loadingUpdated || finalLoaded ? <LoadingBar /> : null}
                <div className="dashboard-content" style={{
                    display: "grid",
                    gridTemplateColumns: toolbar ? "auto minmax(0, 1fr) auto" : "1fr .5fr",
                    columnGap: toolbar ? "var(--space-4)" : undefined,
                    alignItems: "center",
                }}>
                    <h1 className="sticky-title">
                        {titleLogo && (
                            <img src={titleLogo} alt="" aria-hidden="true" style={{ height: 28, width: 28, objectFit: "contain", verticalAlign: "middle", marginRight: 10, flexShrink: 0 }} />
                        )}
                        {/* Fixed page titles are translated here; names (domains etc.) pass through. */}
                        {typeof title === "string" ? t(title) : title}
                        {showInfoButton && (
                            <Button className="secondary" onClick={openPageHelp} aria-label={t("Help for this page")}>i</Button>
                        )}
                    </h1>
                    {toolbar ? <div className="infoHeader__toolbar">{toolbar}</div> : null}
                    {
                        (numberofDays && !(dateInTopBar && !dateSlot)) ?
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
                        <Button className="secondary" onClick={openPageHelp} aria-label={t("Help for this page")}>i</Button>
                    )}
                </div>
            </div>
        </>
    }

}