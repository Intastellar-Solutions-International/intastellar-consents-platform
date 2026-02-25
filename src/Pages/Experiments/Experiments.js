import SideNav from "../../Components/Header/SideNav";
import { experimentsLinks } from "../../Components/Header/SideNavLinks";
import Authentication from "../../Authentication/Auth";
import StickyPageTitle from "../../Components/Header/Sticky";
import Fetch from "../../Functions/FetchHook";
import API from "../../api/api";
const { useState, useEffect } = React;
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
const punycode = require("punycode");

import "./Experiments.css";
import Select from "../../Components/SelectInput/Selector";

ChartJS.register(ArcElement, Tooltip, Legend);

const CONVERSION_COLORS = {
    accepted: "rgba(76, 175, 80, 0.9)",
    rejected: "rgba(244, 67, 54, 0.9)",
    undecided: "rgba(158, 158, 158, 0.9)",
};

function buildConversionChartData(row) {
    const u = row.unique_user_conversion_performance || {};
    const accepted = u.users_final_accepted ?? 0;
    const rejected = u.users_final_rejected ?? 0;
    const undecided = u.undecided_users ?? 0;
    const total = accepted + rejected + undecided;
    if (total === 0) {
        return { labels: ["No data"], datasets: [{ data: [1], backgroundColor: ["rgba(128,128,128,0.3)"], borderWidth: 0 }] };
    }
    return {
        labels: ["Accepted", "Rejected", "Undecided"],
        datasets: [{
            data: [accepted, rejected, undecided],
            backgroundColor: [CONVERSION_COLORS.accepted, CONVERSION_COLORS.rejected, CONVERSION_COLORS.undecided],
            borderColor: ["rgba(255,255,255,0.2)"],
            borderWidth: 1,
        }],
    };
}

function buildDecisionChangeChartData(row) {
    const d = row.decision_event_behavior_dynamics || {};
    const total = d.decision_events_total ?? 0;
    const changes = d.decision_changes ?? 0;
    const unchanged = Math.max(0, total - changes);
    if (total === 0) {
        return { labels: ["No data"], datasets: [{ data: [1], backgroundColor: ["rgba(128,128,128,0.3)"], borderWidth: 0 }] };
    }
    return {
        labels: ["Changed mind", "No change"],
        datasets: [{
            data: [changes, unchanged],
            backgroundColor: ["rgba(255, 152, 0, 0.9)", "rgba(96, 125, 139, 0.7)"],
            borderColor: ["rgba(255,255,255,0.2)"],
            borderWidth: 1,
        }],
    };
}

const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
        legend: { display: false },
        tooltip: {
            callbacks: {
                label: (ctx) => {
                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                    return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                },
            },
        },
    },
    cutout: "65%",
};

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
    const [currentDomain, setCurrentDomain] = useState("Choose domain");
    const [experimentID, setExperimentID] = useState("Choose experiment");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    API.experiments.getExperiments.headers.Organisation = Authentication.getOrganisation();
    API.experiments.getExperiments.headers.FromDate = today.toISOString();
    API.experiments.getExperiments.headers.ToDate = today.toISOString();
    API.experiments.getExperiments.headers.Domains = currentDomain === "Choose domain" ? null : currentDomain;
    API.experiments.getExperiments.headers.ExperimentID = experimentID === "Choose experiment" ? null : experimentID;

    API.gdpr.getDomains.headers.Organisation = Authentication.getOrganisation();


    useEffect(() => {
        setLoading(true);
        fetch(API.experiments.getExperiments.url, {
            method: API.experiments.getExperiments.method,
            headers: API.experiments.getExperiments.headers,
        }).then(response => response.json()).then((data) => {
            setActiveData(Array.isArray(data) ? data : (data?.experiments ?? data?.variants ?? []));
        }).catch((error) => {
            setError(error);
        }).finally(() => {
            setLoading(false);
        });
    }, [currentDomain, experimentID]);
    
    const [loadingDomains, domains, errorDomains] = Fetch(5, API.gdpr.getDomains.url, API.gdpr.getDomains.method, API.gdpr.getDomains.headers);


    useEffect(() => {
        API.experiments.getExperiments.headers.Domains = currentDomain === "Choose domain" ? null : currentDomain;
        API.experiments.getExperiments.headers.ExperimentID = experimentID === "Choose experiment" ? null : experimentID;
    }, [currentDomain, experimentID]);

    const experiments = activeData ?? [];
    let domainList = [];
    if (domains) {
        domainList = domains?.map((d) => {
            return {
                icon: d.icon || null,
                name: punycode.toUnicode(d.domain)
            }
        })
    }

    return <>
        <SideNav links={experimentsLinks} title="Experiments" />
        <div className="dashboard-content experiments-page">
            <StickyPageTitle>
                <h1>A/B Testing</h1>
                <section className="experiments-filters">
                    <Select
                        defaultValue={currentDomain}
                        items={domainList}
                        onChange={(e) => {
                            const domain = JSON.parse(e).name;
                            setCurrentDomain(domain);
                        }}
                        align="right"
                    />
                    {/* <Select
                        defaultValue={experimentID}
                        items={experiments.map((row) => row.experiment_id)}
                        onChange={(e) => {
                            setExperimentID(e.target.value);
                        }}
                    /> */}
                </section>
            </StickyPageTitle>
            {loading && <p className="experiments-loading">Loading experiment data…</p>}
            {error && <p className="experiments-error">Failed to load experiments.</p>}
            {!loading && !error && experiments.length === 0 && (
                <p className="experiments-empty">Currently no experiments are running or no data is available for this domain.</p>
            )}
            {!loading && experiments.length > 0 && (
                <div className="experiments-grid">
                    {experiments.map((row, i) => {
                        const isWinning = row.experiment_variant === row.winning_variant;
                        return (
                        <article
                            key={row.experiment_variant + i}
                            className={`experiment-card${isWinning ? " experiment-card--winning" : ""}`}
                        >
                            <header className="experiment-card__header">
                                <h2 className="experiment-card__variant">{row.experiment_variant}</h2>
                                {isWinning && (
                                    <span className="experiment-card__winning-badge">Winning variant</span>
                                )}
                                <span className="experiment-card__design">{row.design}</span>
                                <span className="experiment-card__design">{row.domain}</span>
                            </header>
                            <div className="experiment-card__donuts">
                                <div className="experiment-card__donut-wrap" title="User outcome: Accepted / Rejected / Undecided">
                                    <Doughnut data={buildConversionChartData(row)} options={chartOptions} />
                                    <span className="experiment-card__donut-label">User outcome</span>
                                </div>
                                <div className="experiment-card__donut-wrap" title="Decision events: Changed mind vs No change">
                                    <Doughnut data={buildDecisionChangeChartData(row)} options={chartOptions} />
                                    <span className="experiment-card__donut-label">Decision change</span>
                                </div>
                            </div>
                            <section className="experiment-card__section">
                                <h3 className="experiment-card__section-title">Unique user conversion</h3>
                                <ul className="experiment-card__metrics">
                                    <li><span className="metric-label">Users assigned</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_assigned ?? "—"}</span></li>
                                    <li><span className="metric-label">Final accepted</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_final_accepted ?? "—"}</span></li>
                                    <li><span className="metric-label">Final rejected</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_final_rejected ?? "—"}</span></li>
                                    <li><span className="metric-label">Undecided</span> <span className="metric-value">{row.unique_user_conversion_performance?.undecided_users ?? "—"}</span></li>
                                    <li><span className="metric-label">Accept rate (user %)</span> <span className="metric-value">{formatPct(row.unique_user_conversion_performance?.accept_rate_user_pct)}</span></li>
                                    <li><span className="metric-label">Reject rate (user %)</span> <span className="metric-value">{formatPct(row.unique_user_conversion_performance?.reject_rate_user_pct)}</span></li>
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
                    ); })}
                </div>
            )}
        </div>
    </>
}