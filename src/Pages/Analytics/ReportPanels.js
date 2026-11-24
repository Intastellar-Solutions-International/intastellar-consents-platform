// Detail panels that used to live only on the Overview page. Overview now
// shows insights + a small snapshot (GA4-style Home), so these moved to the
// sidebar report each belongs to: outbound clicks → Acquisition, frustration
// signals → Heatmap, consent impact → Consent. Each takes the
// analytics-report(-detail) payload as `data` and renders nothing when its
// slice is empty.
import { MiniBar, formatPercent, elementLabel } from "./_shared.js";
import { IconExternalLink, IconCursorClick, IconShieldCheck } from "./Icons.js";
import { STATISTICS_CONSENT } from "../../Functions/consentMetrics.js";
import { appLocale } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

/**
 * "How it's calculated" for modelled sessions (api/_modelled-traffic.js) —
 * shown wherever a modelled number appears, so it's never a black box.
 * `modelled`: the report's { method, coverage } (coverage in percent).
 */
export function ModelledNote({ modelled }) {
    if (!modelled) return null;
    return (
        <details className="sa-model-note">
            <summary>{t("Modelled sessions include visitors who declined statistics cookies. How it's calculated")}</summary>
            <p>{t("Every page view is counted, also from visitors who declined statistics cookies, but their page views can't be linked into sessions. We group page views by day, type of referrer (none, search, social, other) and device, and work out the share of consenting views in each group. Each consenting session then stands for 1 ÷ that share. Small groups use the day's or the site's share.")}</p>
            <p>{t("Assumption: within a group, visitors who decline view about as many pages per visit as visitors who accept. No visitor is identified or tracked for this.")}</p>
            {modelled.coverage < 99 ? (
                <p>{t("{coverage} of page views are in groups with consenting visitors; the rest can't be modelled and are left out.", { coverage: formatPercent(modelled.coverage) })}</p>
            ) : null}
        </details>
    );
}

export function OutboundClicksPanel({ data }) {
    const rows = data?.topOutbound || [];
    if (!rows.length) return null;
    const max = Math.max(...rows.map(o => o.clicks), 1);
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">
                <IconExternalLink className="sa-icon" /> Outbound clicks
                <span className="sa-panel__consent-note">{(data.outboundClicks || 0).toLocaleString(appLocale())} total</span>
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
                            <td className="sa-table__num">{o.clicks.toLocaleString(appLocale())}</td>
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
                                <td className="sa-table__num">{s.clicks.toLocaleString(appLocale())}</td>
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
                                <td className="sa-table__num">{p.rageClicks.toLocaleString(appLocale())}</td>
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
export function ConsentImpactPanel({ impact, modelled }) {
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
                {t("Visitors who decline statistics cookies are counted as anonymous page views, without sessions. This estimates your real number of sessions, grouped by day, referrer and device.")}
            </p>
            <div className="sa-ci-kpis">
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label" title={STATISTICS_CONSENT.description}>
                        {STATISTICS_CONSENT.label}
                    </span>
                    <span className="sa-ci-kpi__value">{formatPercent(consentRate)}</span>
                </div>
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label">Observed sessions</span>
                    <span className="sa-ci-kpi__value">{observedSessions.toLocaleString(appLocale())}</span>
                </div>
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label">{t("Modelled sessions")}</span>
                    <span className="sa-ci-kpi__value">{estimatedTrue.toLocaleString(appLocale())}</span>
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
            <ModelledNote modelled={modelled} />
        </div>
    );
}
