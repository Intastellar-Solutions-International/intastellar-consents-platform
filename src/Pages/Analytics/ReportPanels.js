// Detail panels that used to live only on the Overview page. Overview now
// shows insights + a small snapshot (GA4-style Home), so these moved to the
// sidebar report each belongs to: outbound clicks → Acquisition, frustration
// signals → Heatmap, consent impact → Consent. Each takes the
// analytics-report(-detail) payload as `data` and renders nothing when its
// slice is empty.
import { MiniBar, formatPercent, elementLabel } from "./_shared.js";
import { IconExternalLink, IconCursorClick, IconShieldCheck } from "./Icons.js";

export function OutboundClicksPanel({ data }) {
    const rows = data?.topOutbound || [];
    if (!rows.length) return null;
    const max = Math.max(...rows.map(o => o.clicks), 1);
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">
                <IconExternalLink className="sa-icon" /> Outbound clicks
                <span className="sa-panel__consent-note">{(data.outboundClicks || 0).toLocaleString("de-DE")} total</span>
            </h3>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th>Destination</th>
                        <th className="sa-table__num">Clicks</th>
                        <th className="sa-table__bar" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map(o => (
                        <tr key={o.host}>
                            <td className="sa-table__path">{o.host}</td>
                            <td className="sa-table__num">{o.clicks.toLocaleString("de-DE")}</td>
                            <td className="sa-table__bar">
                                <MiniBar value={o.clicks} max={max} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function FrustrationPanel({ data }) {
    const selectors = data?.topRageSelectors || [];
    const pages = data?.topRagePages || [];
    if (!selectors.length && !pages.length) return null;
    const maxSelector = Math.max(...selectors.map(s => s.clicks), 1);
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">
                <IconCursorClick className="sa-icon" /> Frustration signals
                {data.rageClicks?.frustrationRate > 0 && (
                    <span className="sa-panel__consent-note">
                        {data.rageClicks.frustrationRate}% of sessions
                    </span>
                )}
            </h3>
            {selectors.length > 0 && (
                <table className="sa-table">
                    <thead>
                        <tr>
                            <th>Element</th>
                            <th>ID / Class</th>
                            <th className="sa-table__num">Rage clicks</th>
                            <th className="sa-table__bar" />
                        </tr>
                    </thead>
                    <tbody>
                        {selectors.map(s => (
                            <tr key={s.selector}>
                                <td className="sa-form-id" title={s.selector}>{elementLabel({ tag: s.elementTag })}</td>
                                <td className="sa-rage__detail">
                                    {s.elementId    && <span className="sa-rage__id">#{s.elementId}</span>}
                                    {s.elementClass && <span className="sa-rage__cls">.{s.elementClass.split(" ").filter(Boolean).join(" .")}</span>}
                                    {!s.elementId && !s.elementClass && <span className="sa-rage__none">—</span>}
                                </td>
                                <td className="sa-table__num">{s.clicks.toLocaleString("de-DE")}</td>
                                <td className="sa-table__bar">
                                    <MiniBar value={s.clicks} max={maxSelector} color="rgb(var(--c-danger) / 0.45)" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {pages.length > 0 && (
                <table className="sa-table" style={selectors.length > 0 ? { marginTop: "1rem" } : {}}>
                    <thead>
                        <tr>
                            <th>Page</th>
                            <th className="sa-table__num">Rage clicks</th>
                            <th className="sa-table__num">Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pages.map(p => (
                            <tr key={p.page}>
                                <td className="sa-table__path">{p.page}</td>
                                <td className="sa-table__num">{p.rageClicks.toLocaleString("de-DE")}</td>
                                <td className="sa-table__num">{p.rate != null ? `${p.rate}%` : "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ── Consent Impact Estimator ──────────────────────────────────────────────────
// Shows observed vs estimated true traffic, accounting for the ~25-35% of
// visitors who decline full consent and are therefore counted with less
// granularity. Uses only analytics_events (consent_level column) — the
// consent platform's separate DB is not consulted here.
export function ConsentImpactPanel({ impact }) {
    if (!impact || impact.estimatedTrue == null) return null;
    const { consentRate, observedSessions, estimatedTrue } = impact;
    const hidden = Math.max(0, estimatedTrue - observedSessions);
    const hiddenPct = estimatedTrue > 0 ? Math.round((hidden / estimatedTrue) * 100) : 0;

    return (
        <div className="sa-panel sa-consent-impact">
            <h3 className="sa-panel__title">
                <IconShieldCheck className="sa-icon" /> Consent Impact Estimator
            </h3>
            <p className="sa-panel__sub">
                Visitors who decline full consent are visible only as anonymous events — their sessions
                cannot be stitched. This estimates your true session volume based on the observed consent rate.
            </p>
            <div className="sa-ci-kpis">
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label" title="This analytics tracker's own full-consent rate — not the CMP banner's acceptance rate shown on the Marketing tab, which is a different metric from a different system.">
                        Full-consent rate
                    </span>
                    <span className="sa-ci-kpi__value">{formatPercent(consentRate)}</span>
                </div>
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label">Observed sessions</span>
                    <span className="sa-ci-kpi__value">{observedSessions.toLocaleString("de-DE")}</span>
                </div>
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label">Estimated true total</span>
                    <span className="sa-ci-kpi__value">{estimatedTrue.toLocaleString("de-DE")}</span>
                    <span className="sa-ci-kpi__note">~{hiddenPct}% of traffic uncounted in session analytics</span>
                </div>
            </div>
            <div className="sa-ci-bar-wrap">
                <div className="sa-ci-bar">
                    <div className="sa-ci-bar__observed" style={{ width: (100 - hiddenPct) + "%" }} title="Observed (full consent)" />
                    <div className="sa-ci-bar__hidden"   style={{ width: hiddenPct + "%" }} title="Estimated uncounted (declined/minimal consent)" />
                </div>
                <div className="sa-ci-bar-labels">
                    <span>Observed</span>
                    <span>Uncounted</span>
                </div>
            </div>
        </div>
    );
}
