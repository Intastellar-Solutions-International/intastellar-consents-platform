import Authentication from "../../Authentication/Auth";
import StickyPageTitle from "../../Components/Header/Sticky";
import Fetch from "../../Functions/FetchHook";
import API from "../../API/api";
const { useState, useEffect } = React;
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
const punycode = require("punycode");
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;

import experimentsIcon from "../../components/header/icons/experiment.svg";

import "./Experiments.css";

const DEFAULT_EXPERIMENT_IDS = ["asa-banner-design", "banner-test"];

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
            backgroundColor: "rgba(22, 22, 26, 0.96)",
            titleColor: "#ececec",
            bodyColor: "#c4c4c4",
            borderColor: "rgba(192, 159, 83, 0.35)",
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
                label: (ctx) => {
                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                    return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                },
            },
        },
    },
    cutout: "62%",
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
    const { experimentId: urlExperimentId } = useParams();
    const history = useHistory();
    const [activeData, setActiveData] = useState(null);
    const today = new Date();
    const [currentDomain, setCurrentDomain] = useState("Choose domain");
    const [experimentID, setExperimentID] = useState("Choose experiment");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isListView = !urlExperimentId;
    const effectiveExperimentId = urlExperimentId || experimentID;

    API.experiments.getExperiments.headers.Organisation = Authentication.getOrganisation();
    API.experiments.getExperiments.headers.FromDate = today.toISOString();
    API.experiments.getExperiments.headers.ToDate = today.toISOString();
    API.experiments.getExperiments.headers.Domains = currentDomain === "Choose domain" ? null : currentDomain;
    API.experiments.getExperiments.headers.ExperimentID = (effectiveExperimentId && effectiveExperimentId !== "Choose experiment") ? effectiveExperimentId : null;

    API.gdpr.getDomains.headers.Organisation = Authentication.getOrganisation();


    useEffect(() => {
        if (!effectiveExperimentId || effectiveExperimentId === "Choose experiment") {
            setActiveData(null);
            return;
        }
        setLoading(true);
        API.experiments.getExperiments.headers.ExperimentID = effectiveExperimentId;
        API.experiments.getExperiments.headers.Domains = currentDomain === "Choose domain" ? null : currentDomain;
        fetch(API.experiments.getExperiments.url, {
            method: API.experiments.getExperiments.method,
            headers: API.experiments.getExperiments.headers,
        }).then(response => response.json()).then((data) => {
            setActiveData(Array.isArray(data) ? data : (data?.experiments ?? data?.variants ?? []));
        }).catch((err) => {
            setError(err);
        }).finally(() => {
            setLoading(false);
        });
    }, [currentDomain, effectiveExperimentId]);
    
    const [loadingDomains, domains, errorDomains] = Fetch(5, API.gdpr.getDomains.url, API.gdpr.getDomains.method, API.gdpr.getDomains.headers);


    useEffect(() => {
        API.experiments.getExperiments.headers.Domains = currentDomain === "Choose domain" ? null : currentDomain;
        API.experiments.getExperiments.headers.ExperimentID = (effectiveExperimentId && effectiveExperimentId !== "Choose experiment") ? effectiveExperimentId : null;
    }, [currentDomain, effectiveExperimentId]);

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
        <StickyPageTitle>
            <h1 className="experiments-page__title">
                <img
                    src={experimentsIcon}
                    alt=""
                    className="experiments-page__title-icon"
                    width={24}
                    height={24}
                />
                <span>
                    A/B Testing · {isListView ? "All experiments" : effectiveExperimentId}
                </span>
            </h1>
            {!isListView && (
                <button type="button" className="experiments-back" onClick={() => history.push("/experiments")}>
                    ← All experiments
                </button>
            )}
        </StickyPageTitle>
        <div className="dashboard-content experiments-page">
            {isListView ? (
                <div className="experiments-list">
                    <p className="experiments-list-intro">Select an experiment to view variants and metrics.</p>
                    <ul className="experiments-id-list">
                        {DEFAULT_EXPERIMENT_IDS.map((id) => (
                            <li key={id}>
                                <a
                                    href={`/experiments/${id}`}
                                    className="experiments-id-link"
                                    onClick={(e) => { e.preventDefault(); history.push(`/experiments/${id}`); }}
                                >
                                    {id}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
            <>
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
                                <div className="experiment-card__title-row">
                                    <h2 className="experiment-card__variant">{row.experiment_variant}</h2>
                                    {isWinning ? (
                                        <span className="experiment-card__winning-badge">Leading variant</span>
                                    ) : null}
                                </div>
                                <div className="experiment-card__meta" aria-label="Variant context">
                                    {row.design ? (
                                        <span className="experiment-card__chip experiment-card__chip--design">
                                            <span className="experiment-card__chip-key">Design</span>
                                            {row.design}
                                        </span>
                                    ) : null}
                                    {row.domain ? (
                                        <span className="experiment-card__chip experiment-card__chip--domain">
                                            <span className="experiment-card__chip-key">Domain</span>
                                            {row.domain}
                                        </span>
                                    ) : null}
                                </div>
                            </header>

                            <div className="experiment-card__charts" role="group" aria-label="Variant charts">
                                <div
                                    className="experiment-card__chart-panel"
                                    title="User outcome: Accepted / Rejected / Undecided"
                                >
                                    <div className="experiment-card__chart-inner">
                                        <Doughnut data={buildConversionChartData(row)} options={chartOptions} />
                                    </div>
                                    <span className="experiment-card__chart-caption">User outcome</span>
                                    <span className="experiment-card__chart-hint">Accepted · Rejected · Undecided</span>
                                </div>
                                <div
                                    className="experiment-card__chart-panel"
                                    title="Decision events: Changed mind vs No change"
                                >
                                    <div className="experiment-card__chart-inner">
                                        <Doughnut data={buildDecisionChangeChartData(row)} options={chartOptions} />
                                    </div>
                                    <span className="experiment-card__chart-caption">Decision change</span>
                                    <span className="experiment-card__chart-hint">Mind change vs stable</span>
                                </div>
                            </div>

                            <div className="experiment-card__metrics-grid">
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
                            </div>
                        </article>
                    ); })}
                </div>
            )}
            </>
            )}
        </div>
    </>
}