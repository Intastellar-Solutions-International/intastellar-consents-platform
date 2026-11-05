const { useState, useEffect } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { t } from "../../i18n/index.js";
import { authHeaders, useAnalyticsPageChrome, useCompareRange, usePrevRange } from "./_shared.js";
import { IconTrendingUp } from "./Icons.js";
import UserFlowDiagram from "./UserFlowDiagram.js";
import "./Analytics.css";

const FLOW_URL   = `${ScannerHost}/api/analytics-user-flow`;
const EVENTS_URL = `${ScannerHost}/api/analytics-events`;

function useUserFlow(domain, fromIso, toIso, goal, direction) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        setError(null);
        const params = { domain, from: fromIso, to: toIso };
        // Only added when a goal is picked — the no-goal request stays
        // identical to what this page has always sent.
        if (goal) { params.goal = goal; params.direction = direction; }
        const qs = new URLSearchParams(params).toString();
        fetch(`${FLOW_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                if (!ignore) setData(json);
            })
            .catch(() => { if (!ignore) setError(t("Could not load user flow data.")); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso, goal, direction]);

    return { data, loading, error };
}

// Registered conversion events for the goal dropdown — same fetch shape as
// FunnelBuilder.js's useEventDefs(domain).
function useEventDefs(domain) {
    const [events, setEvents] = useState([]);
    useEffect(() => {
        if (!domain) { setEvents([]); return; }
        fetch(`${EVENTS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { events: [] })
            .then(d => setEvents(d.events || []))
            .catch(() => setEvents([]));
    }, [domain]);
    return events;
}

function flowHeaderNote(data) {
    if (!data.goal) return t("acquisition channel → next {n} pages · session-linked events", { n: data.flowDepth });
    if (data.direction === "from") {
        return t("acquisition channel → next {n} pages, filtered to sessions that converted to “{goal}” · session-linked events", { n: data.flowDepth, goal: data.goal });
    }
    return t("last {n} pages before converting to “{goal}” · session-linked events", { n: data.flowDepth, goal: data.goal });
}

export default function AnalyticsUserFlow() {
    document.title = `${t("User Flow")} | Site Analytics`;

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const [goal, setGoal] = useState("");
    const [direction, setDirection] = useState("to");
    const events = useEventDefs(domain);

    const { data, loading, error } = useUserFlow(domain, fromIso, toIso, goal, direction);
    const hasData = data && !data.noSiteKey && (data.channelEdges?.length > 0);
    const goalOptions = events.filter(ev => ev.sessionCount > 0);

    // Compare-to-previous-period header wiring (Phase 3, docs/design-audit-plan.md).
    // The flow query is one of the heavier ones, so the previous period is
    // only fetched once compare is actually switched on in the header —
    // same goal/direction, so the diagram can match nodes one-to-one.
    const compare = useCompareRange();
    const prevRange = usePrevRange(fromDate, toDate, compare);
    const { data: compareData } = useUserFlow(
        compare.compareActive ? domain : null, prevRange.fromIso, prevRange.toIso, goal, direction
    );

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title="User Flow"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={compare.previousPeriod}
                previousPeriod2={compare.previousPeriod2}
                compareRange={compare.compareRange}
                setCompareRange={compare.setCompareRange}
                setCompareWindowStart={compare.setCompareWindowStart}
                setCompareWindowEnd={compare.setCompareWindowEnd}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">{t("Select a domain in the header to view the user flow.")}</p>
                    )}
                    {domain && loading && <p className="sa-notice">{t("Loading…")}</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">{t("No analytics set up for this domain yet.")}</p>
                    )}
                    {domain && !loading && data && !data.noSiteKey && !hasData && (
                        <p className="sa-notice">
                            {goal
                                ? t("No session-linked conversions for “{goal}” in the selected period.", { goal })
                                : t("No session-linked traffic for the selected period. Full events appear once visitors accept statistics cookies.")}
                        </p>
                    )}

                    {domain && !data?.noSiteKey && goalOptions.length > 0 && (
                        <div className="sa-flow-controls">
                            <select
                                className="sa-select"
                                value={goal}
                                onChange={e => { setGoal(e.target.value); setDirection("to"); }}
                            >
                                <option value="">{t("All traffic")}</option>
                                {goalOptions.map(ev => (
                                    <option key={ev.name} value={ev.name}>
                                        {(ev.label || ev.name)} ({ev.sessionCount.toLocaleString("de-DE")})
                                    </option>
                                ))}
                            </select>
                            {goal && (
                                <div className="sa-flow-tabs" role="radiogroup" aria-label={t("Direction")}>
                                    <button
                                        type="button"
                                        className={"sa-flow-tab" + (direction === "to" ? " --active" : "")}
                                        aria-pressed={direction === "to"}
                                        onClick={() => setDirection("to")}
                                    >
                                        {t("Backward from goal")}
                                    </button>
                                    <button
                                        type="button"
                                        className={"sa-flow-tab" + (direction === "from" ? " --active" : "")}
                                        aria-pressed={direction === "from"}
                                        onClick={() => setDirection("from")}
                                    >
                                        {t("Forward, filtered")}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {domain && hasData && (
                        <div className="sa-panel">
                            <h3 className="sa-panel__title">
                                <IconTrendingUp className="sa-icon" /> {t("Visitor flow")}
                                <span className="sa-panel__consent-note">{flowHeaderNote(data)}</span>
                            </h3>
                            <UserFlowDiagram
                                data={data}
                                compareData={compare.compareActive ? compareData : null}
                                conversionNode={data.conversionNode}
                                ariaLabel={
                                    data.goal
                                        ? (data.direction === "from"
                                            ? t("Visitor flow toward conversions to {goal} — click a page to trace its full path", { goal: data.goal })
                                            : t("Visitor flow leading up to conversions to {goal} — click a page to trace its full path", { goal: data.goal }))
                                        : undefined
                                }
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
