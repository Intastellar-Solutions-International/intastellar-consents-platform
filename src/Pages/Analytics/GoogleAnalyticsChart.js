/*
 * Ga4SessionsChart — moved here from Reports/MarketingReport/MarketingCharts.js
 * so Google Analytics 4 data gets its own Analytics dashboard page instead of
 * living inside the Marketing Reconciliation page. `totalConsents` and
 * `channelOverview` are still accepted (both optional) since the Marketing
 * Reconciliation page's own "consent coverage" concept only makes sense
 * against consent-attribution data it owns — this component just degrades
 * gracefully (skips the Coverage/Blindspots and Channel cross-reference
 * sections) when they aren't supplied, which is the case on this new page.
 */

function fmtInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return Math.round(x).toLocaleString("de-DE");
}

function fmtDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

/*
 * Maps GA4's sessionDefaultChannelGroup value to consent-platform channel names.
 * The match is intentionally broad — one GA4 group covers several possible channel
 * labels depending on how UTM tags were set up. Returns [] when no pattern applies
 * (e.g. "Referral", "Unassigned") so the cross-reference shows a genuine gap.
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

export function Ga4SessionsChart({ rows, platformBreakdown, summary, channelBreakdown, totalConsents, channelOverview, syncing }) {
    if (!rows || rows.length === 0) {
        if (!syncing) return null;
        return (
            <div className="ga4-card">
                <div className="ga4-card__header">
                    <span className="ga4-card__title">Google Analytics 4</span>
                    <span className="ga4-sessions-chart__syncing">loading…</span>
                </div>
            </div>
        );
    }

    const W = 620, H = 200;
    const PAD = { top: 20, right: 16, bottom: 40, left: 52 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const maxSessions = Math.max(...rows.map(r => Number(r.sessions) || 0), 1);
    const barW = Math.max(4, Math.min(28, (plotW / rows.length) * 0.7));
    const toX = i => PAD.left + ((i + 0.5) / rows.length) * plotW;
    const toY = v => PAD.top + plotH - (Math.max(0, v) / maxSessions) * plotH;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxSessions * f));
    const xStep = Math.ceil(rows.length / 8);

    const totalSessions = platformBreakdown?.reduce((s, p) => s + p.sessions, 0) || 0;
    const ssPlatform = platformBreakdown?.find(p => p.platform === "(other)");
    const hasSsTracking = ssPlatform && ssPlatform.sessions > 0;
    const ssShare = hasSsTracking && totalSessions > 0
        ? Math.round((ssPlatform.sessions / totalSessions) * 100) : 0;

    // KPI values — prefer aggregate summary, fall back to summing daily rows
    const kpis = summary ? [
        { label: "Sessions",      value: fmtInt(summary.sessions) },
        { label: "Users",         value: fmtInt(summary.totalUsers) },
        { label: "New users",     value: fmtInt(summary.newUsers) },
        { label: "Page views",    value: fmtInt(summary.pageViews) },
        { label: "Engagement",    value: `${(summary.engagementRate * 100).toFixed(1)}%`,
          title: "Engaged sessions as a share of total sessions (GA4's replacement for bounce rate)." },
        { label: "Avg. session",  value: fmtDuration(summary.avgSessionDuration) },
    ] : null;

    return (
        <div className="ga4-card">
            <div className="ga4-card__header">
                <span className="ga4-card__title">Google Analytics 4</span>
                <div className="ga4-card__badges">
                    {hasSsTracking && (
                        <span className="ga4-ss-badge"
                              title={`${ssShare}% of sessions from server-side tracking (Measurement Protocol / sGTM)`}>
                            ⚡ Server-side · {ssShare}%
                        </span>
                    )}
                    {syncing && <span className="ga4-sessions-chart__syncing">syncing…</span>}
                </div>
            </div>

            {/* KPI strip */}
            {kpis && (
                <div className="ga4-kpi-strip">
                    {kpis.map(k => (
                        <div key={k.label} className="ga4-kpi" title={k.title || ""}>
                            <span className="ga4-kpi__value">{k.value}</span>
                            <span className="ga4-kpi__label">{k.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Daily sessions bar chart */}
            <div className="recon-chart-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="marketing-reconciliation__trend-svg"
                     role="img" aria-label="GA4 daily sessions bar chart">
                    {yTicks.map(v => (
                        <g key={v}>
                            <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                                  stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end"
                                  fontSize="9" fill="rgba(160,175,200,0.5)">
                                {v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v}
                            </text>
                        </g>
                    ))}
                    {rows.map((r, i) => {
                        const sessions = Number(r.sessions) || 0;
                        const top = toY(sessions);
                        const ht = PAD.top + plotH - top;
                        return (
                            <rect key={r.date} x={toX(i) - barW / 2} y={top}
                                  width={barW} height={Math.max(1, ht)}
                                  rx="2" fill="rgba(227,116,0,0.75)">
                                <title>{r.date}: {fmtInt(sessions)} sessions · {fmtInt(r.users || 0)} users · {fmtInt(r.pageViews || 0)} page views</title>
                            </rect>
                        );
                    })}
                    {rows.filter((_, i) => i % xStep === 0 || i === rows.length - 1).map(r => {
                        const i = rows.indexOf(r);
                        return (
                            <text key={r.date} x={toX(i)} y={H - PAD.bottom + 14}
                                  textAnchor="middle" fontSize="9" fill="rgba(160,175,200,0.55)">
                                {(r.date || "").slice(5)}
                            </text>
                        );
                    })}
                    <text x={PAD.left - 38} y={PAD.top + plotH / 2} textAnchor="middle"
                          fontSize="9" fill="rgba(150,165,190,0.5)"
                          transform={`rotate(-90,${PAD.left - 38},${PAD.top + plotH / 2})`}>
                        Sessions / day
                    </text>
                </svg>
            </div>

            {/* Platform / server-side tracking breakdown */}
            {platformBreakdown && platformBreakdown.length > 0 && (
                <div className="ga4-platform-breakdown">
                    <h4 className="ga4-platform-breakdown__title">Session source breakdown</h4>
                    <div className="ga4-platform-breakdown__rows">
                        {platformBreakdown.map(p => {
                            const share = totalSessions > 0 ? (p.sessions / totalSessions) * 100 : 0;
                            const isSs = p.platform === "(other)";
                            return (
                                <div key={p.platform} className={`ga4-pb-row${isSs ? " ga4-pb-row--ss" : ""}`}>
                                    <span className="ga4-pb-row__name">
                                        {isSs ? (
                                            <>{p.platform}<span className="ga4-pb-row__ss-hint"> — server-side / Measurement Protocol</span></>
                                        ) : p.platform}
                                    </span>
                                    <div className="ga4-pb-row__bar-wrap">
                                        <div className="ga4-pb-row__bar"
                                             style={{ width: `${Math.max(1, share)}%`, background: isSs ? "rgba(99,102,241,0.7)" : "rgba(227,116,0,0.6)" }} />
                                    </div>
                                    <span className="ga4-pb-row__share">{share.toFixed(1)}%</span>
                                    <span className="ga4-pb-row__count">{fmtInt(p.sessions)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Coverage & Blindspots ──────────────────────────────────────── */}
            {summary && summary.sessions > 0 && totalConsents != null && (() => {
                const ga4Sess = summary.sessions;
                const capturePct = Math.min(100, (totalConsents / ga4Sess) * 100);
                const darkZone = Math.max(0, ga4Sess - totalConsents);
                const captureStr = capturePct.toFixed(1) + "%";
                return (
                    <div className="ga4-coverage">
                        <div className="ga4-coverage__header">
                            <h4 className="ga4-coverage__title">Consent coverage</h4>
                            <span className="ga4-coverage__subtitle">GA4 sessions vs consent events in this period</span>
                        </div>

                        <div className="ga4-coverage__metrics">
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{captureStr}</span>
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

                        {/* Stacked bar */}
                        <div className="ga4-coverage__bar-track" title={`${captureStr} of sessions generated a consent event`}>
                            <div className="ga4-coverage__bar-fill" style={{ width: `${capturePct}%` }} />
                        </div>
                        <div className="ga4-coverage__bar-legend">
                            <span className="ga4-coverage__legend-consent">Consent events ({fmtInt(totalConsents)})</span>
                            <span className="ga4-coverage__legend-dark">Dark zone ({fmtInt(darkZone)})</span>
                        </div>

                        <p className="ga4-coverage__note">
                            Dark zone = sessions that reached the site but generated no consent event.
                            Typical causes: returning visitors with an existing consent cookie, bounces before
                            the banner rendered, or bot traffic. A very large dark zone can also mean the CMP
                            is loading too late in the page lifecycle.
                        </p>
                    </div>
                );
            })()}

            {/* ── Channel cross-reference ────────────────────────────────────── */}
            {channelBreakdown && channelBreakdown.length > 0 && channelOverview && channelOverview.length > 0 && (() => {
                const ga4Total = channelBreakdown.reduce((s, g) => s + g.sessions, 0) || 1;
                return (
                    <div className="ga4-xref">
                        <div className="ga4-xref__header">
                            <h4 className="ga4-xref__title">GA4 channels vs consent attribution</h4>
                            <span className="ga4-xref__subtitle">
                                Approximate — GA4 channel groups and consent-platform UTM channels use different classification rules.
                            </span>
                        </div>
                        <div className="ga4-xref__scroll">
                            <table className="ga4-xref__table">
                                <thead>
                                    <tr>
                                        <th className="ga4-xref__th">GA4 channel group</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Sessions</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Share</th>
                                        <th className="ga4-xref__th">Matched consent channels</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Consents</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Coverage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {channelBreakdown.map(g => {
                                        const matched = matchConsentChannels(g.channelGroup, channelOverview);
                                        const consentSum = matched.reduce((s, c) => s + c.consents, 0);
                                        const covPct = g.sessions > 0 && matched.length > 0
                                            ? (consentSum / g.sessions) * 100 : null;
                                        const sessionShare = (g.sessions / ga4Total) * 100;
                                        const isBlindspot = g.channelGroup === "Unassigned" ||
                                            (g.sessions > 50 && matched.length === 0) ||
                                            (covPct !== null && covPct < 5);
                                        return (
                                            <tr key={g.channelGroup} className={isBlindspot ? "ga4-xref__row--blind" : ""}>
                                                <td className="ga4-xref__td">
                                                    {isBlindspot && (
                                                        <span className="ga4-xref__blind-badge" title="Low or no consent attribution for this GA4 channel — potential tracking gap">
                                                            blind spot
                                                        </span>
                                                    )}
                                                    {g.channelGroup}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{fmtInt(g.sessions)}</td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{sessionShare.toFixed(1)}%</td>
                                                <td className="ga4-xref__td ga4-xref__td--channels">
                                                    {matched.length > 0
                                                        ? matched.map(c => c.channel).join(", ")
                                                        : <span className="ga4-xref__no-match">no match</span>}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">
                                                    {matched.length > 0 ? fmtInt(consentSum) : "—"}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">
                                                    {covPct !== null
                                                        ? <span className={covPct < 10 ? "ga4-xref__cov--low" : covPct > 50 ? "ga4-xref__cov--high" : "ga4-xref__cov--mid"}>
                                                            {covPct.toFixed(1)}%
                                                          </span>
                                                        : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="ga4-xref__note">
                            Coverage = consent events / GA4 sessions for matched channels. Below 10% is flagged as a
                            potential blindspot. "Unassigned" traffic has no UTM tags and is invisible to both GA4
                            channel grouping and consent attribution — these are true dark sessions.
                        </p>
                    </div>
                );
            })()}
        </div>
    );
}
