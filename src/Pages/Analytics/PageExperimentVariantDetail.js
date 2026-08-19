const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain, analyticsPageExperimentsPath } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../API/host.js";
import { authHeaders, InfoTip } from "./_shared.js";
import "./Analytics.css";

function fmtDuration(seconds) {
    if (seconds == null) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
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
                                                    {detail.engagement.engagedRate != null ? (detail.engagement.engagedRate * 100).toFixed(1) + "%" : "—"}
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
                                                                    {c.conversionRate != null ? (c.conversionRate * 100).toFixed(2) + "%" : "—"}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        <h4 className="pxp-detail__section-title">
                                            Top clicked elements
                                            <InfoTip text="Every click recorded on this page after a session's first exposure to this variant, grouped by the element clicked and ranked by click count." />
                                        </h4>
                                        {!detail.clicks || detail.clicks.topElements.length === 0 ? (
                                            <p className="sa-panel__sub">No clicks recorded for this variant yet.</p>
                                        ) : (
                                            <ul className="pxp-detail-clicks">
                                                {detail.clicks.topElements.map((el, i) => (
                                                    <li key={i} className="pxp-detail-clicks__row">
                                                        <code className="pxp-detail-clicks__selector">
                                                            {el.tag}{el.id ? `#${el.id}` : ""}{el.className ? `.${el.className.split(" ")[0]}` : ""}
                                                        </code>
                                                        {el.text && <span className="pxp-detail-clicks__text">&ldquo;{el.text}&rdquo;</span>}
                                                        <span className="pxp-detail-clicks__n">{el.n.toLocaleString("de-DE")} clicks</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
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
