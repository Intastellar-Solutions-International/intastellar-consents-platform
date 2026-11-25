// Conversions, built around goals: pick a goal (a form's lead type such as
// "Demo", other forms, or a registered lead / sale event) and every panel
// follows it — trend, the path to it, what brings it, time to convert and
// device. Backed by api/analytics-goals.js; setting goals up lives in
// Analytics settings → Goals.
const { useState, useEffect, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
const Link = window.ReactRouterDOM.Link;
import { analyticsSettingsPath, analyticsFormsPath } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../API/host.js";
import { useAnalyticsPage, authHeaders, formatPercent, useCompareRange, MiniBar } from "./_shared.js";
import { IconTarget, IconTrendingUp, IconFunnel, IconAlertTriangle } from "./Icons.js";
import ConversionCampaigns from "./ConversionCampaigns.js";
import FunnelBuilder from "./FunnelBuilder.js";
import TrendLineChart from "./TrendLineChart.js";
import { useExcludeBots } from "../../Functions/botFilter.js";
import "./Analytics.css";
import { appLocale } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

const GOALS_URL = `${ScannerHost}/api/analytics-goals`;
const fmt = (n) => Number(n || 0).toLocaleString(appLocale());

function channelLabel(key) {
    return key === "organic" ? t("Organic search")
        : key === "paid" ? t("Paid search & ads")
        : key === "paid_social" ? t("Paid social")
        : key === "referral" ? t("Referral")
        : t("Direct");
}

function deviceLabel(key) {
    return key === "mobile" ? t("Mobile") : key === "tablet" ? t("Tablet") : key === "desktop" ? t("Desktop") : t("Unknown");
}

let countryNames = null;
function countryName(code) {
    if (!code) return t("Unknown country");
    try {
        countryNames = countryNames || new Intl.DisplayNames([appLocale()], { type: "region" });
        return countryNames.of(code) || code;
    } catch {
        return code;
    }
}

function goalLabel(goal) {
    if (goal.key === "all") return t("All conversions");
    if (goal.key === "forms") return t("Other forms");
    return goal.label;
}

/** Goal, breakdown and touch live in the URL so a view can be shared. */
function readParams() {
    const p = new URLSearchParams(window.location.search);
    return {
        goal: p.get("goal") || "all",
        by: ["channel", "campaign", "landing", "country"].includes(p.get("by")) ? p.get("by") : "channel",
        touch: p.get("touch") === "last" ? "last" : "first",
    };
}

function useGoals(domain, from, to, view, tick) {
    const [excludeBots] = useExcludeBots();
    const [state, setState] = useState({ loading: true, data: null, error: null });
    useEffect(() => {
        if (!domain || !from || !to) return undefined;
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));
        const qs = new URLSearchParams({ domain, from, to, goal: view.goal, by: view.by, touch: view.touch });
        fetch(`${GOALS_URL}?${qs}`, { headers: { ...authHeaders(), ExcludeBots: excludeBots ? "1" : "0" } })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((data) => { if (!cancelled) setState({ loading: false, data, error: null }); })
            .catch(() => { if (!cancelled) setState({ loading: false, data: null, error: t("Conversions could not be loaded.") }); });
        return () => { cancelled = true; };
    }, [domain, from, to, view.goal, view.by, view.touch, excludeBots, tick]);
    return state;
}

function Trend({ value }) {
    if (value == null || !Number.isFinite(value)) return null;
    if (Math.round(value) === 0) return <span className="sa-goal-trend">±0%</span>;
    const up = value > 0;
    return (
        <span className={`sa-goal-trend sa-goal-trend--${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {formatPercent(Math.abs(value), 0)}
        </span>
    );
}

function GoalChips({ goals, selected, onSelect }) {
    return (
        <div className="sa-goal-chips" role="tablist" aria-label={t("Goals")}>
            {goals.map((g) => (
                <button
                    key={g.key}
                    type="button"
                    role="tab"
                    aria-selected={g.key === selected}
                    className={"sa-goal-chip" + (g.key === selected ? " sa-goal-chip--active" : "")}
                    onClick={() => onSelect(g.key)}
                >
                    <span className="sa-goal-chip__label">{goalLabel(g)}</span>
                    <span className="sa-goal-chip__count">{fmt(g.count)}</span>
                    <Trend value={g.trend} />
                </button>
            ))}
        </div>
    );
}

function GoalHero({ data, fromDate, toDate }) {
    const { selected, totals, daily } = data;
    const trendData = useMemo(() => daily.map((d) => ({ date: d.date, num: d.count })), [daily]);
    const name = goalLabel(selected);
    return (
        <div className="sa-panel sa-goal-hero">
            <div className="sa-goal-hero__head">
                <div>
                    <p className="sa-goal-hero__eyebrow">{name}</p>
                    <p className="sa-goal-hero__value">
                        {fmt(selected.count)} <Trend value={selected.trend} />
                    </p>
                    <p className="sa-goal-hero__sub">
                        {totals.rate != null
                            ? t("{rate} of consented sessions converted ({count} of {sessions})", { rate: formatPercent(totals.rate), count: fmt(totals.convertedSessions), sessions: fmt(totals.consentedSessions) })
                            : t("No consented sessions in this period")}
                    </p>
                </div>
                <p className="sa-goal-hero__note">
                    {t("{attributable} of {total} can be traced to a source — the rest came from visitors who declined statistics cookies.", { attributable: fmt(totals.attributable), total: fmt(totals.conversions) })}
                </p>
            </div>
            <TrendLineChart data={trendData} fromDate={fromDate} toDate={toDate} title={name} height={200} />
        </div>
    );
}

function GoalPath({ path, domain }) {
    const labels = {
        visited: path.kind === "form" ? t("Visited a page with the form") : t("Visited a page where it happens"),
        started: t("Started the form"),
        converted: t("Converted"),
    };
    const first = path.steps[0]?.count || 0;
    return (
        <div className="sa-panel sa-goal-path">
            <h3 className="sa-panel__title"><IconFunnel className="sa-icon" /> {t("Path to this goal")}</h3>
            <p className="sa-panel__sub">{t("Sessions of visitors who accepted statistics cookies.")}</p>
            <ol className="sa-goal-path__steps">
                {path.steps.map((s) => (
                    <li key={s.key} className="sa-goal-path__step">
                        <span className="sa-goal-path__label">{labels[s.key]}</span>
                        <span className="sa-goal-path__bar"><MiniBar value={s.count} max={Math.max(first, 1)} /></span>
                        <span className="sa-goal-path__count">{fmt(s.count)}</span>
                        <span className="sa-goal-path__drop">{s.dropPct != null ? `−${formatPercent(s.dropPct, 0)}` : ""}</span>
                    </li>
                ))}
            </ol>
            {path.errors.network > 0 && (
                <p className="sa-goal-path__alert">
                    <IconAlertTriangle className="sa-icon" aria-hidden="true" />
                    <span>
                        {t("{count} submissions of this form failed with a network error — requests may not have reached you. Test the form on the live site.", { count: fmt(path.errors.network) })}
                        {" "}<Link to={analyticsFormsPath(domain)}>{t("Open Forms")}</Link>
                    </span>
                </p>
            )}
            {path.errors.validation > 0 && (
                <p className="sa-history-note">{t("{count} times a visitor was stopped by a field error.", { count: fmt(path.errors.validation) })}</p>
            )}
        </div>
    );
}

/** "All" or "Other forms": compare the goals instead of a path. */
function GoalsCompared({ goals, onSelect }) {
    const rows = goals.filter((g) => g.key !== "all");
    const max = Math.max(...rows.map((g) => g.count), 1);
    return (
        <div className="sa-panel sa-goal-path">
            <h3 className="sa-panel__title"><IconTarget className="sa-icon" /> {t("Goals compared")}</h3>
            <p className="sa-panel__sub">{t("Pick a goal to see the path to it and what brings it.")}</p>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th>{t("Goal")}</th>
                        <th className="sa-table__num">{t("This period")}</th>
                        <th className="sa-table__num">{t("Previous period")}</th>
                        <th className="sa-table__bar" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((g) => (
                        <tr key={g.key} className="sa-loc__row--drill" onClick={() => onSelect(g.key)}>
                            <td><button type="button" className="sa-loc__place" onClick={(e) => { e.stopPropagation(); onSelect(g.key); }}>{goalLabel(g)}</button></td>
                            <td className="sa-table__num">{fmt(g.count)} <Trend value={g.trend} /></td>
                            <td className="sa-table__num">{fmt(g.prevCount)}</td>
                            <td className="sa-table__bar"><MiniBar value={g.count} max={max} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Sources({ data, view, onChange }) {
    const rows = data.breakdown;
    const total = rows.reduce((s, r) => s + r.conversions, 0) + data.notAttributable;
    const max = Math.max(...rows.map((r) => r.conversions), 1);
    const label = (key) => (view.by === "channel" ? channelLabel(key)
        : view.by === "country" ? countryName(key)
        : view.by === "campaign" ? (key || t("No campaign"))
        : (key || t("Unknown page")));
    const showRate = view.touch === "first" || view.by === "country";
    const tabs = [["channel", t("Channel")], ["campaign", t("Campaign")], ["landing", view.touch === "last" ? t("Last page") : t("Landing page")], ["country", t("Country")]];
    return (
        <div className="sa-panel sa-goal-sources">
            <div className="sa-goal-sources__head">
                <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> {t("What brings them")}</h3>
                <div className="sa-goal-sources__controls">
                    <div className="sa-loc__switch" role="group" aria-label={t("Break down by")}>
                        {tabs.map(([key, text]) => (
                            <button key={key} type="button" aria-pressed={view.by === key} onClick={() => onChange({ by: key })}>{text}</button>
                        ))}
                    </div>
                    {view.by !== "country" && (
                        <div className="sa-loc__switch" role="group" aria-label={t("Attribution")}>
                            <button type="button" aria-pressed={view.touch === "first"} onClick={() => onChange({ touch: "first" })} title={t("Where the visit that converted started")}>{t("First touch")}</button>
                            <button type="button" aria-pressed={view.touch === "last"} onClick={() => onChange({ touch: "last" })} title={t("The last page view before converting")}>{t("Last touch")}</button>
                        </div>
                    )}
                </div>
            </div>
            {rows.length === 0 && !data.notAttributable ? (
                <p className="sa-insights__empty">{t("No conversions of this goal in this period.")}</p>
            ) : (
                <table className="sa-table">
                    <thead>
                        <tr>
                            <th>{tabs.find(([k]) => k === view.by)[1]}</th>
                            <th className="sa-table__num">{t("Conversions")}</th>
                            <th className="sa-table__num">{t("Share")}</th>
                            {showRate && <th className="sa-table__num" title={t("Converted sessions out of all consented sessions that started here")}>{t("Conversion rate")}</th>}
                            <th className="sa-table__bar" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(0, 12).map((r) => (
                            <tr key={r.key || "none"}>
                                <td className="sa-table__path" title={label(r.key)}>{label(r.key)}</td>
                                <td className="sa-table__num">{fmt(r.conversions)}</td>
                                <td className="sa-table__num">{formatPercent(total ? (r.conversions / total) * 100 : 0, 0)}</td>
                                {showRate && <td className="sa-table__num">{r.rate != null ? formatPercent(r.rate) : "—"}</td>}
                                <td className="sa-table__bar"><MiniBar value={r.conversions} max={max} /></td>
                            </tr>
                        ))}
                        {data.notAttributable > 0 && (
                            <tr className="sa-loc__row--muted">
                                <td title={t("Visitors who declined statistics cookies have no session to trace")}>{t("Not traceable (no consent)")}</td>
                                <td className="sa-table__num">{fmt(data.notAttributable)}</td>
                                <td className="sa-table__num">{formatPercent(total ? (data.notAttributable / total) * 100 : 0, 0)}</td>
                                {showRate && <td className="sa-table__num">—</td>}
                                <td className="sa-table__bar" />
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function TimeAndDevice({ data }) {
    const buckets = data.timeToConvert.buckets;
    const bucketLabel = { under1m: t("Under 1 min"), "1to5m": t("1–5 min"), "5to30m": t("5–30 min"), "30mto1d": t("30 min – 1 day"), over1d: t("Over 1 day") };
    const maxB = Math.max(...buckets.map((b) => b.count), 1);
    const devices = data.devices;
    const devTotal = devices.reduce((s, d) => s + d.count, 0);
    const med = data.timeToConvert.medianMinutes;
    return (
        <div className="sa-goal-small">
            <div className="sa-panel">
                <h3 className="sa-panel__title">{t("Time to convert")}</h3>
                <p className="sa-panel__sub">
                    {med != null
                        ? t("Half convert within {minutes} minutes of arriving.", { minutes: med < 10 ? med.toFixed(1) : Math.round(med) })
                        : t("Needs consented conversions.")}
                </p>
                <ul className="sa-goal-bars">
                    {buckets.map((b) => (
                        <li key={b.key}>
                            <span>{bucketLabel[b.key]}</span>
                            <MiniBar value={b.count} max={maxB} />
                            <span className="sa-goal-bars__n">{fmt(b.count)}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="sa-panel">
                <h3 className="sa-panel__title">{t("Device")}</h3>
                <ul className="sa-goal-bars">
                    {devices.map((d) => (
                        <li key={d.key || "unknown"}>
                            <span>{deviceLabel(d.key)}</span>
                            <MiniBar value={d.count} max={Math.max(devTotal, 1)} />
                            <span className="sa-goal-bars__n">{formatPercent(devTotal ? (d.count / devTotal) * 100 : 0, 0)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function AnalyticsConversionsOverview() {
    document.title = "Conversions | Site Analytics";
    const { section } = useParams();
    const history = useHistory();
    const {
        domain, hasDomain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
        fromIso, toIso, tick, data: report, loading: reportLoading, error: reportError, showData,
    } = useAnalyticsPage();
    const compare = useCompareRange();

    // Setup moved to Analytics settings → Goals; old links still land somewhere useful
    useEffect(() => {
        if (section === "setup" && domain) history.replace(analyticsSettingsPath(domain) + "#goals");
    }, [section, domain, history]);

    const [view, setView] = useState(readParams);
    const update = (patch) => setView((v) => ({ ...v, ...patch }));
    useEffect(() => {
        const url = new URL(window.location.href);
        for (const [k, v] of Object.entries(view)) {
            const isDefault = (k === "goal" && v === "all") || (k === "by" && v === "channel") || (k === "touch" && v === "first");
            if (isDefault) url.searchParams.delete(k); else url.searchParams.set(k, v);
        }
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }, [view]);

    const { loading, data, error } = useGoals(hasDomain ? domain : null, fromIso, toIso, view, tick);
    // A goal that no longer exists (renamed lead type) falls back to All
    useEffect(() => {
        if (data && view.goal !== "all" && !data.goals.some((g) => g.key === view.goal)) update({ goal: "all" });
    }, [data, view.goal]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title="Conversions"
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
                <div className="sa-page sa-goals-page">
                    {!hasDomain && <p className="sa-notice">{t("Select a domain in the header to view conversions.")}</p>}
                    {hasDomain && (reportLoading || (loading && !data)) && <p className="sa-notice">{t("Loading…")}</p>}
                    {hasDomain && (error || reportError) && <p className="sa-notice sa-notice--error">{error || reportError}</p>}
                    {hasDomain && !reportLoading && report?.noSiteKey && <p className="sa-notice">{t("No analytics set up for this domain yet.")}</p>}

                    {data && showData && (
                        <>
                            <GoalChips goals={data.goals} selected={view.goal} onSelect={(goal) => update({ goal })} />

                            {data.goals.length <= 1 && (
                                <p className="sa-notice">
                                    {t("No conversions in this period. Every form submission counts as a lead; give your forms a lead type such as Demo or Trial to track them as separate goals.")}
                                    {" "}<Link to={analyticsSettingsPath(domain) + "#goals"}>{t("Set up goals")}</Link>
                                </p>
                            )}

                            <div className="sa-goals-top" aria-busy={loading}>
                                <GoalHero data={data} fromDate={fromDate} toDate={toDate} />
                                {data.path ? <GoalPath path={data.path} domain={domain} /> : <GoalsCompared goals={data.goals} onSelect={(goal) => update({ goal })} />}
                            </div>

                            <div className="sa-goals-bottom" aria-busy={loading}>
                                <Sources data={data} view={view} onChange={update} />
                                <TimeAndDevice data={data} />
                            </div>

                            {report && (
                                <ConversionCampaigns domain={domain} fromIso={fromIso} toIso={toIso} byCampaign={report.conversionsByCampaign} />
                            )}
                            <FunnelBuilder domain={domain} fromIso={fromIso} toIso={toIso} />

                            <p className="sa-goals-manage">
                                <Link to={analyticsSettingsPath(domain) + "#goals"}>{t("Manage goals")} →</Link>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
