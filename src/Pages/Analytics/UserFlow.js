const { useState, useEffect } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
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
                setData(await r.json());
            })
            .catch(() => setError("Could not load user flow data."))
            .finally(() => setLoading(false));
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
    if (!data.goal) return `acquisition channel → next ${data.flowDepth} pages · session-linked events`;
    if (data.direction === "from") {
        return `acquisition channel → next ${data.flowDepth} pages, filtered to sessions that converted to “${data.goal}” · session-linked events`;
    }
    return `last ${data.flowDepth} pages before converting to “${data.goal}” · session-linked events`;
}

export default function AnalyticsUserFlow() {
    document.title = "User Flow | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const [goal, setGoal] = useState("");
    const [direction, setDirection] = useState("to");
    const events = useEventDefs(domain);

    const { data, loading, error } = useUserFlow(domain, fromIso, toIso, goal, direction);
    const hasData = data && !data.noSiteKey && (data.channelEdges?.length > 0);
    const goalOptions = events.filter(ev => ev.sessionCount > 0);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="User Flow"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view the user flow.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !loading && data && !data.noSiteKey && !hasData && (
                        <p className="sa-notice">
                            {goal
                                ? `No session-linked conversions for “${goal}” in the selected period.`
                                : "No session-linked traffic for the selected period. Full events appear once visitors accept statistics cookies."}
                        </p>
                    )}

                    {domain && !data?.noSiteKey && goalOptions.length > 0 && (
                        <div className="sa-flow-controls">
                            <select
                                className="sa-select"
                                value={goal}
                                onChange={e => { setGoal(e.target.value); setDirection("to"); }}
                            >
                                <option value="">All traffic</option>
                                {goalOptions.map(ev => (
                                    <option key={ev.name} value={ev.name}>
                                        {(ev.label || ev.name)} ({ev.sessionCount.toLocaleString("de-DE")})
                                    </option>
                                ))}
                            </select>
                            {goal && (
                                <div className="sa-flow-tabs" role="radiogroup" aria-label="Direction">
                                    <button
                                        type="button"
                                        className={"sa-flow-tab" + (direction === "to" ? " --active" : "")}
                                        aria-pressed={direction === "to"}
                                        onClick={() => setDirection("to")}
                                    >
                                        Backward from goal
                                    </button>
                                    <button
                                        type="button"
                                        className={"sa-flow-tab" + (direction === "from" ? " --active" : "")}
                                        aria-pressed={direction === "from"}
                                        onClick={() => setDirection("from")}
                                    >
                                        Forward, filtered
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {domain && hasData && (
                        <div className="sa-panel">
                            <h3 className="sa-panel__title">
                                <IconTrendingUp className="sa-icon" /> Visitor flow
                                <span className="sa-panel__consent-note">{flowHeaderNote(data)}</span>
                            </h3>
                            <UserFlowDiagram
                                data={data}
                                conversionNode={data.conversionNode}
                                ariaLabel={
                                    data.goal
                                        ? `Visitor flow ${data.direction === "from" ? "toward" : "leading up to"} conversions to ${data.goal} — click a page to trace its full path`
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
