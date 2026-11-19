/*
 * Ga4SessionsChart — raw chart content (no outer card wrapper).
 * The parent (GoogleAnalytics.js) wraps it in a sa-panel.
 *
 * Still exported so MarketingReport/index.js comment doesn't become stale —
 * that page no longer imports this but the comment refers to where it moved.
 *
 * Optional props (only used by the Marketing Reconciliation page):
 *   totalConsents, channelOverview — renders consent coverage + channel xref
 *   when supplied.
 */

import { formatPercent } from "./_shared.js";
import { appLocale } from "../../Functions/format.js";

function fmtInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return Math.round(x).toLocaleString(appLocale());
}

/*
 * Maps GA4's sessionDefaultChannelGroup value to consent-platform channel names.
 */
function matchConsentChannels(ga4Group, channelOverview) {
    const matchers = {
        "Paid Search":    c => /(google ads|microsoft ads|bing)/i.test(c.channel),
        "Paid Shopping":  c => /(google ads|microsoft ads)/i.test(c.channel),
        "Cross-network":  c => /google ads/i.test(c.channel),
        "Organic Search": c => /organic search/i.test(c.channel),
        "Paid Social":    c => /ads/i.test(c.channel) && /(facebook|instagram|linkedin|tiktok|twitter|pinterest|meta)/i.test(c.channel),
        "Paid Video":     c => /tiktok ads/i.test(c.channel),
        "Organic Social": c => !/ads/i.test(c.channel) && /(facebook \(organic\)|^instagram$|^linkedin$|^tiktok$|twitter|^pinterest$)/i.test(c.channel),
        "Direct":         c => /^direct$/i.test(c.channel),
        "Email":          c => /email/i.test(c.channel),
        "Affiliates":     c => /affiliate/i.test(c.channel),
    };
    const fn = matchers[ga4Group];
    if (!fn) return [];
    return (channelOverview || []).filter(fn);
}

/*
 * Platform / server-side tracking breakdown — shared between the GA dashboard
 * and any future Marketing Reconciliation embed.
 */
export function Ga4PlatformBreakdown({ platformBreakdown }) {
    if (!platformBreakdown?.length) return null;
    const totalSessions = platformBreakdown.reduce((s, p) => s + p.sessions, 0);
    return (
        <div className="ga4-platform-breakdown">
            <h4 className="ga4-platform-breakdown__title">Session source</h4>
            <div className="ga4-platform-breakdown__rows">
                {platformBreakdown.map(p => {
                    const share = totalSessions > 0 ? (p.sessions / totalSessions) * 100 : 0;
                    const isSs  = p.platform === "(other)";
                    return (
                        <div key={p.platform} className={`ga4-pb-row${isSs ? " ga4-pb-row--ss" : ""}`}>
                            <span className="ga4-pb-row__name">
                                {isSs ? (
                                    <>{p.platform}<span className="ga4-pb-row__ss-hint"> — server-side</span></>
                                ) : p.platform}
                            </span>
                            <div className="ga4-pb-row__bar-wrap">
                                <div className="ga4-pb-row__bar"
                                     style={{ width: `${Math.max(1, share)}%`, background: isSs ? "rgba(99,102,241,0.6)" : "rgba(145,158,180,0.35)" }} />
                            </div>
                            <span className="ga4-pb-row__share">{formatPercent(share)}</span>
                            <span className="ga4-pb-row__count">{fmtInt(p.sessions)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/*
 * Consent coverage + channel cross-reference — only used by Marketing
 * Reconciliation; degrades gracefully when totalConsents / channelOverview
 * are not supplied.
 */
export function Ga4SessionsChart({ rows, platformBreakdown, summary, channelBreakdown, totalConsents, channelOverview, syncing }) {
    if (!rows || rows.length === 0) {
        if (!syncing) return null;
        return <p className="sa-notice" style={{ margin: 0 }}>Loading Google Analytics data…</p>;
    }

    const W = 620, H = 200;
    const PAD = { top: 20, right: 16, bottom: 40, left: 52 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const maxSessions = Math.max(...rows.map(r => Number(r.sessions) || 0), 1);
    const barW = Math.max(4, Math.min(28, (plotW / rows.length) * 0.7));
    const toX  = i => PAD.left + ((i + 0.5) / rows.length) * plotW;
    const toY  = v => PAD.top + plotH - (Math.max(0, v) / maxSessions) * plotH;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxSessions * f));
    const xStep  = Math.ceil(rows.length / 8);

    const totalSessions = platformBreakdown?.reduce((s, p) => s + p.sessions, 0) || 0;
    const ssPlatform    = platformBreakdown?.find(p => p.platform === "(other)");
    const hasSsTracking = ssPlatform && ssPlatform.sessions > 0;
    const ssShare = hasSsTracking && totalSessions > 0
        ? Math.round((ssPlatform.sessions / totalSessions) * 100) : 0;

    return (
        <>
            {/* Header badges */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
                <span style={{ fontSize: "0.72rem", color: "rgba(145,158,180,0.55)", fontWeight: 500 }}>
                    {syncing ? "Syncing…" : "Daily sessions"}
                </span>
                {hasSsTracking && (
                    <span className="ga4-ss-badge"
                          title={`${ssShare}% of sessions from server-side tracking (Measurement Protocol / sGTM)`}>
                        ⚡ Server-side · {ssShare}%
                    </span>
                )}
            </div>

            {/* Bar chart */}
            <div className="recon-chart-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="marketing-reconciliation__trend-svg"
                     role="img" aria-label="GA4 daily sessions">
                    {yTicks.map(v => (
                        <g key={v}>
                            <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                                  stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end"
                                  fontSize="9" fill="rgba(160,175,200,0.4)">
                                {v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v}
                            </text>
                        </g>
                    ))}
                    {rows.map((r, i) => {
                        const s = Number(r.sessions) || 0;
                        const top = toY(s), ht = PAD.top + plotH - top;
                        return (
                            <rect key={r.date} x={toX(i) - barW / 2} y={top}
                                  width={barW} height={Math.max(1, ht)} rx="2"
                                  fill="rgba(145,158,180,0.3)">
                                <title>{r.date}: {fmtInt(s)} sessions · {fmtInt(r.users || 0)} users</title>
                            </rect>
                        );
                    })}
                    {rows.filter((_, i) => i % xStep === 0 || i === rows.length - 1).map(r => {
                        const i = rows.indexOf(r);
                        return (
                            <text key={r.date} x={toX(i)} y={H - PAD.bottom + 14}
                                  textAnchor="middle" fontSize="9" fill="rgba(160,175,200,0.4)">
                                {(r.date || "").slice(5)}
                            </text>
                        );
                    })}
                </svg>
            </div>

            {/* Platform breakdown (inside chart panel) */}
            <Ga4PlatformBreakdown platformBreakdown={platformBreakdown} />

            {/* ── Consent coverage — only when totalConsents is passed ──────── */}
            {summary && summary.sessions > 0 && totalConsents != null && (() => {
                const ga4Sess    = summary.sessions;
                const capturePct = Math.min(100, (totalConsents / ga4Sess) * 100);
                const darkZone   = Math.max(0, ga4Sess - totalConsents);
                return (
                    <div className="ga4-coverage">
                        <div className="ga4-coverage__header">
                            <h4 className="ga4-coverage__title">Consent coverage</h4>
                            <span className="ga4-coverage__subtitle">GA4 sessions vs consent events</span>
                        </div>
                        <div className="ga4-coverage__metrics">
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{formatPercent(capturePct)}</span>
                                <span className="ga4-coverage__metric-label">capture rate</span>
                            </div>
                            <div className="ga4-coverage__metric ga4-coverage__metric--dark">
                                <span className="ga4-coverage__metric-value">{fmtInt(darkZone)}</span>
                                <span className="ga4-coverage__metric-label">session dark zone</span>
                            </div>
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{fmtInt(totalConsents)}</span>
                                <span className="ga4-coverage__metric-label">consent events</span>
                            </div>
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{fmtInt(ga4Sess)}</span>
                                <span className="ga4-coverage__metric-label">GA4 sessions</span>
                            </div>
                        </div>
                        <div className="ga4-coverage__bar-track">
                            <div className="ga4-coverage__bar-fill" style={{ width: `${capturePct}%` }} />
                        </div>
                        <div className="ga4-coverage__bar-legend">
                            <span className="ga4-coverage__legend-consent">Consent events ({fmtInt(totalConsents)})</span>
                            <span className="ga4-coverage__legend-dark">Dark zone ({fmtInt(darkZone)})</span>
                        </div>
                    </div>
                );
            })()}

            {/* ── Channel cross-reference — only when channelOverview is passed */}
            {channelBreakdown && channelBreakdown.length > 0 && channelOverview && channelOverview.length > 0 && (() => {
                const ga4Total = channelBreakdown.reduce((s, g) => s + g.sessions, 0) || 1;
                return (
                    <div className="ga4-xref">
                        <div className="ga4-xref__header">
                            <h4 className="ga4-xref__title">GA4 channels vs consent attribution</h4>
                            <span className="ga4-xref__subtitle">Approximate — classification rules differ.</span>
                        </div>
                        <div className="ga4-xref__scroll">
                            <table className="ga4-xref__table">
                                <thead>
                                    <tr>
                                        <th className="ga4-xref__th">GA4 channel</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Sessions</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Share</th>
                                        <th className="ga4-xref__th">Consent channels</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Consents</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Coverage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {channelBreakdown.map(g => {
                                        const matched    = matchConsentChannels(g.channelGroup, channelOverview);
                                        const consentSum = matched.reduce((s, c) => s + c.consents, 0);
                                        const covPct     = g.sessions > 0 && matched.length > 0
                                            ? (consentSum / g.sessions) * 100 : null;
                                        const sessionShare  = (g.sessions / ga4Total) * 100;
                                        const isBlindspot   = g.channelGroup === "Unassigned" ||
                                            (g.sessions > 50 && matched.length === 0) ||
                                            (covPct !== null && covPct < 5);
                                        return (
                                            <tr key={g.channelGroup} className={isBlindspot ? "ga4-xref__row--blind" : ""}>
                                                <td className="ga4-xref__td">
                                                    {isBlindspot && <span className="ga4-xref__blind-badge">blind spot</span>}
                                                    {g.channelGroup}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{fmtInt(g.sessions)}</td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{formatPercent(sessionShare)}</td>
                                                <td className="ga4-xref__td ga4-xref__td--channels">
                                                    {matched.length > 0 ? matched.map(c => c.channel).join(", ") : <span className="ga4-xref__no-match">no match</span>}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{matched.length > 0 ? fmtInt(consentSum) : "—"}</td>
                                                <td className="ga4-xref__td ga4-xref__td--num">
                                                    {covPct !== null
                                                        ? <span className={covPct < 10 ? "ga4-xref__cov--low" : covPct > 50 ? "ga4-xref__cov--high" : "ga4-xref__cov--mid"}>{formatPercent(covPct)}</span>
                                                        : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}
