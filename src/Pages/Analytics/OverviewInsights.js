// Overview "Home" content, GA4-style: a handful of generated insights plus a
// small snapshot of top pages / sources / countries. Every card links to the
// sidebar report that holds the detail — Home itself no longer carries the
// full tables (see ReportPanels.js for the ones that moved).
const Link = window.ReactRouterDOM.Link;
import { formatPercent, pctChange, MiniBar } from "./_shared.js";
import {
    IconAlertTriangle, IconCheckCircle, IconInfoCircle, IconDocument, IconMegaphone, IconGlobe,
} from "./Icons.js";

const MAX_INSIGHTS = 6;

const fmt = n => Number(n || 0).toLocaleString("de-DE");
const pct = v => formatPercent(Math.abs(v), 0);

// Pure: current + previous-period report → ranked insight cards. Each rule
// has a minimum volume so a 2 → 4 visit change doesn't surface as "+100%".
// `paths` maps report names to sidebar URLs; `conversions`/`prevConversions`
// are passed in (totalConversions lives in index.js, which imports this).
export function buildInsights({ data, prevData, conversions, prevConversions, paths }) {
    if (!data?.totals) return [];
    const out = [];
    const prevTotals = prevData?.totals;

    // ── Overall traffic ────────────────────────────────────────────────────
    if (prevTotals) {
        const useUsers = (prevTotals.engagedUsers || 0) >= 10;
        const cur  = useUsers ? data.totals.engagedUsers : data.totals.total;
        const prev = useUsers ? prevTotals.engagedUsers : prevTotals.total;
        const change = pctChange(cur, prev);
        if (change != null && Math.abs(change) >= 15 && (useUsers || prev >= 50)) {
            const what = useUsers ? "Active users" : "Events";
            out.push({
                id: "traffic",
                tone: change >= 0 ? "good" : "bad",
                score: 60 + Math.min(Math.abs(change), 100) / 2,
                title: `${what} ${change >= 0 ? "up" : "down"} ${pct(change)}`,
                detail: `${fmt(cur)} this period vs ${fmt(prev)} in the previous one.`,
                to: paths.acquisition, cta: "See where traffic comes from",
            });
        }
    }

    // ── Traffic sources: biggest riser and biggest faller ──────────────────
    if (prevData?.referrers) {
        const prevBy = new Map(prevData.referrers.map(r => [r.referrer, r.events]));
        let riser = null, faller = null;
        for (const r of data.referrers || []) {
            const prev = prevBy.get(r.referrer) || 0;
            const delta = r.events - prev;
            if (r.events >= 10 && delta >= 10 && (!riser || delta > riser.delta)) riser = { ...r, prev, delta };
        }
        const curBy = new Map((data.referrers || []).map(r => [r.referrer, r.events]));
        for (const r of prevData.referrers) {
            if (r.events < 20) continue;
            const cur = curBy.get(r.referrer) || 0;
            const change = pctChange(cur, r.events);
            if (change <= -40 && (!faller || change < faller.change)) faller = { referrer: r.referrer, cur, prev: r.events, change };
        }
        if (riser) {
            const change = pctChange(riser.events, riser.prev);
            out.push({
                id: "source-up",
                tone: "good",
                score: 45 + Math.min(change ?? 100, 100) / 4,
                title: riser.prev === 0
                    ? `New traffic source: ${riser.referrer}`
                    : `${riser.referrer} sent ${pct(change)} more traffic`,
                detail: riser.prev === 0
                    ? `${fmt(riser.events)} events, none in the previous period.`
                    : `${fmt(riser.events)} events vs ${fmt(riser.prev)} before.`,
                to: paths.acquisition, cta: "Open Acquisition",
            });
        }
        if (faller) {
            out.push({
                id: "source-down",
                tone: "bad",
                score: 50 + Math.min(Math.abs(faller.change), 100) / 4,
                title: `Traffic from ${faller.referrer} fell ${pct(faller.change)}`,
                detail: `${fmt(faller.cur)} events vs ${fmt(faller.prev)} in the previous period.`,
                to: paths.acquisition, cta: "Open Acquisition",
            });
        }
    }

    // ── New country among the top 5 ────────────────────────────────────────
    if (prevData?.countries) {
        const prevCodes = new Set(prevData.countries.filter(c => c.events > 0).map(c => c.code));
        const fresh = (data.countries || []).slice(0, 5).find(c => c.events >= 10 && !prevCodes.has(c.code));
        if (fresh) {
            out.push({
                id: "country-new",
                tone: "info",
                score: 35,
                title: `New audience: visitors from ${fresh.code}`,
                detail: `${fmt(fresh.events)} events this period — now one of your top 5 countries.`,
                to: paths.audience, cta: "Open Audience",
            });
        }
    }

    // ── Consent rate vs industry ───────────────────────────────────────────
    const bench = data.industryBenchmark;
    if (bench && data.totals.consentRate != null) {
        const diff = data.totals.consentRate - bench.consentRatePct;
        if (Math.abs(diff) >= 10) {
            const below = diff < 0;
            out.push({
                id: "consent-benchmark",
                tone: below ? "bad" : "good",
                score: (below ? 55 : 30) + Math.min(Math.abs(diff), 60) / 3,
                title: `Consent rate ${Math.round(Math.abs(diff))} pts ${below ? "below" : "above"} the ${bench.label} average`,
                detail: `${formatPercent(data.totals.consentRate)} vs ${formatPercent(bench.consentRatePct)}.`
                    + (below ? " Fewer consented visitors means less session-level data." : ""),
                to: paths.consent, cta: "Open Consent",
            });
        }
    }

    // ── Conversions ────────────────────────────────────────────────────────
    if (prevData && (prevConversions || 0) >= 5) {
        const change = pctChange(conversions, prevConversions);
        if (change != null && Math.abs(change) >= 20) {
            out.push({
                id: "conversions",
                tone: change >= 0 ? "good" : "bad",
                score: 58 + Math.min(Math.abs(change), 100) / 3,
                title: `Conversions ${change >= 0 ? "up" : "down"} ${pct(change)}`,
                detail: `${fmt(conversions)} vs ${fmt(prevConversions)} in the previous period.`,
                to: paths.conversions, cta: "Open Conversions",
            });
        }
    }

    // ── Worst form ─────────────────────────────────────────────────────────
    const weakForm = (data.formFunnel || [])
        .filter(f => f.started >= 10 && f.completionRate != null && f.completionRate < 40)
        .sort((a, b) => a.completionRate - b.completionRate)[0];
    if (weakForm) {
        out.push({
            id: "form",
            tone: "bad",
            score: 48 + (40 - weakForm.completionRate) / 2,
            title: `Only ${formatPercent(weakForm.completionRate)} complete form "${weakForm.formId}"`,
            detail: `${fmt(weakForm.started)} started, ${fmt(weakForm.submitted)} submitted.`,
            to: paths.forms, cta: "Open Forms",
        });
    }

    // ── Rage clicks ────────────────────────────────────────────────────────
    const frustration = data.rageClicks?.frustrationRate || 0;
    if (frustration >= 2) {
        const topPage = data.topRagePages?.[0];
        out.push({
            id: "rage",
            tone: "bad",
            score: 42 + Math.min(frustration, 20) * 2,
            title: `${frustration}% of sessions show rage clicks`,
            detail: topPage ? `Most on ${topPage.page} (${fmt(topPage.rageClicks)} rage clicks).` : "Visitors click repeatedly on something that doesn't respond.",
            to: paths.heatmap, cta: "Open Heatmap",
        });
    }

    // ── Page riser (only pages in both periods' top lists — a page missing
    // from the previous top list isn't necessarily new) ─────────────────────
    if (prevData?.topPages) {
        const prevBy = new Map(prevData.topPages.map(p => [p.pathname, p.views]));
        let best = null;
        for (const p of data.topPages || []) {
            const prev = prevBy.get(p.pathname);
            if (!prev || p.views < 20) continue;
            const change = pctChange(p.views, prev);
            if (change >= 50 && (!best || change > best.change)) best = { ...p, prev, change };
        }
        if (best) {
            out.push({
                id: "page-up",
                tone: "info",
                score: 32 + Math.min(best.change, 200) / 10,
                title: `${best.pathname} views up ${pct(best.change)}`,
                detail: `${fmt(best.views)} views vs ${fmt(best.prev)} before.`,
                to: paths.acquisition, cta: "Open Acquisition",
            });
        }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, MAX_INSIGHTS);
}

const TONE_ICON = { good: IconCheckCircle, bad: IconAlertTriangle, info: IconInfoCircle };
const TONE_LABEL = { good: "Positive", bad: "Needs attention", info: "Notable" };

export function InsightsSection({ insights, comparing, compareLabel }) {
    return (
        <section className="sa-insights" aria-labelledby="sa-insights-title">
            <div className="sa-section-hd">
                <h3 id="sa-insights-title" className="sa-section-hd__title">Insights</h3>
                <span className="sa-section-hd__sub">{compareLabel}</span>
            </div>
            {comparing ? (
                <p className="sa-insights__empty">Comparing with the previous period&hellip;</p>
            ) : insights.length === 0 ? (
                <p className="sa-insights__empty">
                    Nothing stands out this period — traffic, sources and conversions are in line with the previous one.
                </p>
            ) : (
                // One scrollable row; focusable so it can be scrolled with the keyboard
                <div className="sa-insights__grid" role="region" aria-label="Insights" tabIndex={0}>
                    {insights.map(i => {
                        const Icon = TONE_ICON[i.tone];
                        return (
                            <Link key={i.id} to={i.to} className={`sa-insight sa-insight--${i.tone}`}>
                                <span className="sa-insight__tone">
                                    <Icon className="sa-insight__icon" aria-hidden="true" />
                                    {TONE_LABEL[i.tone]}
                                </span>
                                <span className="sa-insight__title" title={i.title}>{i.title}</span>
                                <span className="sa-insight__detail">{i.detail}</span>
                                <span className="sa-insight__cta">{i.cta} →</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function SnapshotCard({ icon: Icon, title, rows, valueLabel, to, cta }) {
    const max = Math.max(...rows.map(r => r.value), 1);
    return (
        <div className="sa-panel sa-snapshot">
            <h3 className="sa-panel__title"><Icon className="sa-icon" /> {title}</h3>
            {rows.length ? (
                <table className="sa-table">
                    <thead>
                        <tr>
                            <th>{valueLabel[0]}</th>
                            <th className="sa-table__num">{valueLabel[1]}</th>
                            <th className="sa-table__bar" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.label}>
                                <td className="sa-table__path" title={r.label}>{r.label}</td>
                                <td className="sa-table__num">{fmt(r.value)}</td>
                                <td className="sa-table__bar"><MiniBar value={r.value} max={max} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="sa-insights__empty">No data yet</p>
            )}
            <Link className="sa-panel__footer-link" to={to}>{cta} →</Link>
        </div>
    );
}

export function SnapshotRow({ data, paths }) {
    return (
        <section className="sa-snapshot-row" aria-label="Snapshot">
            <SnapshotCard icon={IconDocument} title="Top pages" valueLabel={["Page", "Views"]}
                rows={(data.topPages || []).slice(0, 5).map(p => ({ label: p.pathname, value: p.views }))}
                to={paths.acquisition} cta="All pages" />
            <SnapshotCard icon={IconMegaphone} title="Top sources" valueLabel={["Source", "Events"]}
                rows={(data.referrers || []).slice(0, 5).map(r => ({ label: r.referrer, value: r.events }))}
                to={paths.acquisition} cta="Traffic acquisition" />
            <SnapshotCard icon={IconGlobe} title="Top countries" valueLabel={["Country", "Events"]}
                rows={(data.countries || []).slice(0, 5).map(c => ({ label: c.code, value: c.events }))}
                to={paths.audience} cta="Audience" />
        </section>
    );
}
