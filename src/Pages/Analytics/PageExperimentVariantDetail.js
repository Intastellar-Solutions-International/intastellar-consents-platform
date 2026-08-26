const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain, analyticsPageExperimentsPath } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../API/host.js";
import { authHeaders, InfoTip, formatPercent } from "./_shared.js";
import "./Analytics.css";

function fmtDuration(seconds) {
    if (seconds == null) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function pagePosition(yPct) {
    if (yPct == null) return null;
    if (yPct <= 25) return { label: "Above fold", color: "#7dd590" };
    if (yPct <= 55) return { label: "Mid-page", color: "#88b0e8" };
    if (yPct <= 80) return { label: "Lower", color: "#d4b87a" };
    return { label: "Footer", color: "rgba(255,255,255,0.4)" };
}

function buildSelector(el) {
    let s = el.tag || "?";
    if (el.id) s += `#${el.id}`;
    else if (el.className) s += `.${el.className.split(" ")[0]}`;
    return s;
}

export default function PageExperimentVariantDetail() {
    const { handle, testId: testIdParam, variantId: variantIdParam } = useParams();
    const testId = parseInt(testIdParam, 10);
    const variantId = parseInt(variantIdParam, 10);
    const history = useHistory();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!variantId) return;
        let ignore = false;
        setDetail(null);
        setLoading(true);
        setError(null);
        fetch(`${ScannerHost}/api/ab-test-variant-detail?variantId=${variantId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(d => { if (!ignore) setDetail(d); })
            .catch(() => { if (!ignore) setError("Could not load variant detail."); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [variantId]);

    document.title = detail ? `${detail.label || detail.variantKey} | Page Experiments` : "Page Experiments";

    if (!domain) {
        return <div className="sa-page"><p className="sa-notice">Select a domain in the header.</p></div>;
    }

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle title={detail ? (detail.label || detail.variantKey) : "Variant detail"} />
            <div className="dashboard-content">
                <div className="sa-page">
                    <button
                        type="button"
                        className="pxp-back-link"
                        onClick={() => history.push(`${analyticsPageExperimentsPath(domain)}/${testId}`)}
                    >
                        &larr; Back to results
                    </button>

                    {loading && <p className="sa-notice">Loading&hellip;</p>}
                    {error && <p className="sa-notice sa-notice--error">{error}</p>}

                    {detail && !loading && !error && (
                        <div className="pxp-report">
                            <div className="pxp-report__card">
                                <div className="pxp-report__card-head">
                                    <h3 className="pxp-report__metric-title pxp-detail__title">
                                        {detail.label || detail.variantKey}
                                        {detail.isControl && <span className="pxp-report__baseline-chip">Baseline</span>}
                                    </h3>
                                </div>
                                <p className="pxp-report__page-url" style={{ marginBottom: 14 }}>{detail.domain}</p>

                                {!detail.hasSite ? (
                                    <p className="sa-notice">
                                        No analytics site registered for <strong>{detail.domain}</strong> yet — install the tracking
                                        script there to see engagement and conversion detail for this variant.
                                    </p>
                                ) : (
                                    <>
                                        <div className="pxp-detail-stats">
                                            <div className="pxp-detail-stat">
                                                <span className="pxp-detail-stat__value">{detail.uniqueSessions.toLocaleString("de-DE")}</span>
                                                <span className="pxp-detail-stat__label">
                                                    Visitors
                                                    <InfoTip text="Unique sessions exposed to this variant — a repeat visit from the same session only counts once. Compare to Exposures on the results table, which counts every view including repeats." />
                                                </span>
                                            </div>
                                            <div className="pxp-detail-stat">
                                                <span className="pxp-detail-stat__value">
                                                    {detail.engagement.engagedRate != null ? formatPercent(detail.engagement.engagedRate * 100) : "—"}
                                                </span>
                                                <span className="pxp-detail-stat__label">
                                                    Engaged sessions
                                                    <InfoTip text="Share of visitors who stayed at least 10 seconds, viewed more than one page, or clicked something — filters out instant bounces rather than a raw bounce rate." />
                                                </span>
                                            </div>
                                            <div className="pxp-detail-stat">
                                                <span className="pxp-detail-stat__value">{fmtDuration(detail.engagement.avgDurationSec)}</span>
                                                <span className="pxp-detail-stat__label">
                                                    Avg. time on page
                                                    <InfoTip text="Average of each session's longest recorded time-on-page, across sessions that had at least one measured pageview." />
                                                </span>
                                            </div>
                                            <div className="pxp-detail-stat">
                                                <span className="pxp-detail-stat__value">
                                                    {detail.engagement.avgScrollDepth != null ? Math.round(detail.engagement.avgScrollDepth) + "%" : "—"}
                                                </span>
                                                <span className="pxp-detail-stat__label">
                                                    Avg. scroll depth
                                                    <InfoTip text="Average of each session's deepest scroll position on the page, as a percentage of total page height." />
                                                </span>
                                            </div>
                                        </div>

                                        <h4 className="pxp-detail__section-title">
                                            Conversions
                                            <InfoTip text="Every conversion event that fired for this variant's sessions after they were first exposed to it — not just the test's one configured goal event." />
                                        </h4>
                                        {detail.conversions.length === 0 ? (
                                            <p className="sa-panel__sub">No conversion events recorded for this variant yet.</p>
                                        ) : (
                                            <div className="pxp-report__table-scroll">
                                                <table className="sa-table pxp-report__table">
                                                    <thead>
                                                        <tr>
                                                            <th>Event</th>
                                                            <th className="sa-table__num">
                                                                Conversions
                                                                <InfoTip text="Unique sessions that fired this event at least once (not total event count)." />
                                                            </th>
                                                            <th className="sa-table__num">
                                                                Rate
                                                                <InfoTip text="Converted sessions divided by this variant's total visitors." />
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detail.conversions.map(c => (
                                                            <tr key={c.name}>
                                                                <td>{c.label}</td>
                                                                <td className="sa-table__num">{c.convertedSessions.toLocaleString("de-DE")}</td>
                                                                <td className="sa-table__num">
                                                                    {c.conversionRate != null ? formatPercent(c.conversionRate * 100, 2) : "—"}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        <h4 className="pxp-detail__section-title">
                                            Top clicked elements
                                            <InfoTip text="Every click recorded after a session's first exposure to this variant, grouped by element. Position shows where on the page the element sits (as % from top). Page shows which URL the click most commonly happened on." />
                                        </h4>
                                        {!detail.clicks || detail.clicks.topElements.length === 0 ? (
                                            <p className="sa-panel__sub">No clicks recorded for this variant yet.</p>
                                        ) : (() => {
                                            const maxN = Math.max(...detail.clicks.topElements.map(e => e.n), 1);
                                            return (
                                                <div className="pxp-report__table-scroll">
                                                    <table className="sa-table pxp-report__table pxp-clicks-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Element</th>
                                                                <th>Page</th>
                                                                <th>Position</th>
                                                                <th className="sa-table__num">Clicks</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {detail.clicks.topElements.map((el, i) => {
                                                                const pos = pagePosition(el.avgYPct);
                                                                const barW = Math.round((el.n / maxN) * 100);
                                                                return (
                                                                    <tr key={i}>
                                                                        <td>
                                                                            <code className="pxp-detail-clicks__selector">
                                                                                {buildSelector(el)}
                                                                            </code>
                                                                            {el.text && (
                                                                                <span className="pxp-detail-clicks__text">&ldquo;{el.text}&rdquo;</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="pxp-clicks-table__page">
                                                                            {el.topPage ? (
                                                                                <span className="pxp-clicks-table__path" title={el.topPage}>
                                                                                    {el.topPage.length > 32 ? `…${el.topPage.slice(-30)}` : el.topPage}
                                                                                </span>
                                                                            ) : "—"}
                                                                        </td>
                                                                        <td className="pxp-clicks-table__pos">
                                                                            {pos ? (
                                                                                <span className="pxp-clicks-table__pos-chip" style={{ color: pos.color }}>
                                                                                    {pos.label}
                                                                                    <span className="pxp-clicks-table__pos-pct">
                                                                                        {el.avgYPct}%
                                                                                    </span>
                                                                                </span>
                                                                            ) : "—"}
                                                                        </td>
                                                                        <td className="sa-table__num pxp-clicks-table__n">
                                                                            <div className="pxp-clicks-table__bar-wrap">
                                                                                <div className="pxp-clicks-table__bar" style={{ width: `${barW}%` }} />
                                                                            </div>
                                                                            {el.n.toLocaleString("de-DE")}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })()}

                                        <h4 className="pxp-detail__section-title" style={{ marginTop: 28 }}>
                                            Top visited pages
                                            <InfoTip text="Pages visited by sessions exposed to this variant, ranked by pageview count. Requires the analytics tracking script to be installed on the variant's domain." />
                                        </h4>
                                        {!detail.topPages || detail.topPages.length === 0 ? (
                                            <p className="sa-panel__sub">No page visit data for this variant yet.</p>
                                        ) : (() => {
                                            const maxPv = Math.max(...detail.topPages.map(p => p.pageviews), 1);
                                            return (
                                                <div className="pxp-report__table-scroll">
                                                    <table className="sa-table pxp-report__table">
                                                        <thead>
                                                            <tr>
                                                                <th>Page</th>
                                                                <th className="sa-table__num">Pageviews</th>
                                                                <th className="sa-table__num">Sessions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {detail.topPages.map((p, i) => {
                                                                const barW = Math.round((p.pageviews / maxPv) * 100);
                                                                return (
                                                                    <tr key={i}>
                                                                        <td>
                                                                            <span className="pxp-clicks-table__path" title={p.pathname}>
                                                                                {p.pathname.length > 50 ? `${p.pathname.slice(0, 48)}…` : p.pathname}
                                                                            </span>
                                                                        </td>
                                                                        <td className="sa-table__num pxp-clicks-table__n">
                                                                            <div className="pxp-clicks-table__bar-wrap">
                                                                                <div className="pxp-clicks-table__bar" style={{ width: `${barW}%` }} />
                                                                            </div>
                                                                            {p.pageviews.toLocaleString("de-DE")}
                                                                        </td>
                                                                        <td className="sa-table__num">{p.sessions.toLocaleString("de-DE")}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })()}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
