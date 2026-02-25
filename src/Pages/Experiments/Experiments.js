import SideNav from "../../Components/Header/SideNav";
import { experimentsLinks } from "../../Components/Header/SideNavLinks";
import Authentication from "../../Authentication/Auth";
import StickyPageTitle from "../../Components/Header/Sticky";
import Fetch from "../../Functions/FetchHook";
import API from "../../api/api";
const { useState, useEffect } = React;

import "./Experiments.css";
import Select from "../../Components/SelectInput/Selector";

function formatPct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Math.round(Number(n)) + "%";
}
function formatMs(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    return Math.round(Number(ms)) + " ms";
}

export default function Experiments() {
    document.title = "A/B Testing | Intastellar Consents";
    const [activeData, setActiveData] = useState(null);
    const today = new Date();
    API.experiments.getExperiments.headers.Organisation = Authentication.getOrganisation();
    API.experiments.getExperiments.headers.FromDate = today.toISOString();
    API.experiments.getExperiments.headers.ToDate = today.toISOString();
    API.experiments.getExperiments.headers.Domains = "intastellarsolutions.com";
    API.experiments.getExperiments.headers.ExperimentID = "banner-test";

    const [loading, data, error] = Fetch(5, API.experiments.getExperiments.url, API.experiments.getExperiments.method, API.experiments.getExperiments.headers);

    useEffect(() => {
        if (data) {
            setActiveData(Array.isArray(data) ? data : (data?.experiments ?? []));
        } else if (error) {
            console.error(error);
        }
    }, [data, error]);

    const experiments = activeData ?? [];

    return <>
        <SideNav links={experimentsLinks} title="Experiments" />
        <div className="dashboard-content experiments-page">
            <StickyPageTitle>
                <h1>A/B Testing</h1>
            </StickyPageTitle>
            {loading && <p className="experiments-loading">Loading experiment data…</p>}
            {error && <p className="experiments-error">Failed to load experiments.</p>}
            {!loading && !error && experiments.length === 0 && (
                <p className="experiments-empty">No experiment data for this period.</p>
            )}
            {!loading && experiments.length > 0 && (
                <div className="experiments-grid">
                    {experiments.map((row, i) => (
                        <article key={row.experiment_variant + i} className="experiment-card">
                            <header className="experiment-card__header">
                                <h2 className="experiment-card__variant">{row.experiment_variant}</h2>
                                <span className="experiment-card__design">{row.design}</span>
                                <span className="experiment-card__design">{row.domain}</span>
                            </header>
                            <section className="experiment-card__section">
                                <h3 className="experiment-card__section-title">Unique user conversion</h3>
                                <ul className="experiment-card__metrics">
                                    <li><span className="metric-label">Users assigned</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_assigned ?? "—"}</span></li>
                                    <li><span className="metric-label">Final accepted</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_final_accepted ?? "—"}</span></li>
                                    <li><span className="metric-label">Final rejected</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_final_rejected ?? "—"}</span></li>
                                    <li><span className="metric-label">Undecided</span> <span className="metric-value">{row.unique_user_conversion_performance?.undecided_users ?? "—"}</span></li>
                                    <li><span className="metric-label">Accept rate (user %)</span> <span className="metric-value">{formatPct(row.unique_user_conversion_performance?.accept_rate_user_pct)}</span></li>
                                </ul>
                            </section>
                            <section className="experiment-card__section">
                                <h3 className="experiment-card__section-title">Decision event behavior</h3>
                                <ul className="experiment-card__metrics">
                                    <li><span className="metric-label">Decision events total</span> <span className="metric-value">{row.decision_event_behavior_dynamics?.decision_events_total ?? "—"}</span></li>
                                    <li><span className="metric-label">Decision changes</span> <span className="metric-value">{row.decision_event_behavior_dynamics?.decision_changes ?? "—"}</span></li>
                                    <li><span className="metric-label">Decision time (avg)</span> <span className="metric-value">{formatMs(row.decision_event_behavior_dynamics?.decision_time_avg_ms)}</span></li>
                                    <li><span className="metric-label">Change rate</span> <span className="metric-value">{formatPct(row.decision_event_behavior_dynamics?.change_rate_pct)}</span></li>
                                </ul>
                            </section>
                        </article>
                    ))}
                </div>
            )}
        </div>
    </>
}