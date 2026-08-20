const { useState, useEffect } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import { IconTrendingUp } from "./Icons.js";
import UserFlowDiagram from "./UserFlowDiagram.js";
import "./Analytics.css";

const FLOW_URL = `${ScannerHost}/api/analytics-user-flow`;

function useUserFlow(domain, fromIso, toIso) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${FLOW_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load user flow data."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso]);

    return { data, loading, error };
}

export default function AnalyticsUserFlow() {
    document.title = "User Flow | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading, error } = useUserFlow(domain, fromIso, toIso);
    const hasData = data && !data.noSiteKey && (data.channelEdges?.length > 0);

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
                        <p className="sa-notice">No session-linked traffic for the selected period. Full events appear once visitors accept statistics cookies.</p>
                    )}

                    {domain && hasData && (
                        <div className="sa-panel">
                            <h3 className="sa-panel__title">
                                <IconTrendingUp className="sa-icon" /> Visitor flow
                                <span className="sa-panel__consent-note">acquisition channel &rarr; next {data.flowDepth} pages &middot; full events only</span>
                            </h3>
                            <UserFlowDiagram data={data} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
