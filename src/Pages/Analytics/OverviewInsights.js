// Overview "Home" content, GA4-style: a handful of generated insights plus a
// small snapshot of top pages / sources / countries. Every card links to the
// sidebar report that holds the detail — Home itself no longer carries the
// full tables (see ReportPanels.js for the ones that moved).
const Link = window.ReactRouterDOM.Link;
import { formatPercent, pctChange, MiniBar } from "./_shared.js";
import {
    IconAlertTriangle, IconCheckCircle, IconInfoCircle, IconDocument, IconMegaphone, IconGlobe,
} from "./Icons.js";
import { appLocale } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

const MAX_INSIGHTS = 6;
// The top of the page leads with the first insight and lists the next ones;
// the Insights row further down only shows what's left.
export const TOP_FINDINGS = 3;

const fmt = n => Number(n || 0).toLocaleString(appLocale());
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
            const up = change >= 0;
            const vars = { change: pct(change) };
            out.push({
                id: "traffic",
                tone: up ? "good" : "bad",
                score: 60 + Math.min(Math.abs(change), 100) / 2,
                title: useUsers
                    ? (up ? t("Active users up {change}", vars) : t("Active users down {change}", vars))
                    : (up ? t("Events up {change}", vars) : t("Events down {change}", vars)),
                detail: t("{current} this period vs {previous} in the previous one.", { current: fmt(cur), previous: fmt(prev) }),
                to: paths.acquisition, cta: t("See where traffic comes from"),
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
                    ? t("New traffic source: {source}", { source: riser.referrer })
                    : t("{source} sent {change} more traffic", { source: riser.referrer, change: pct(change) }),
                detail: riser.prev === 0
                    ? t("{events} events, none in the previous period.", { events: fmt(riser.events) })
                    : t("{events} events vs {previous} before.", { events: fmt(riser.events), previous: fmt(riser.prev) }),
                to: paths.acquisition, cta: t("Open Acquisition"),
            });
        }
        if (faller) {
            out.push({
                id: "source-down",
                tone: "bad",
                score: 50 + Math.min(Math.abs(faller.change), 100) / 4,
                title: t("Traffic from {source} fell {change}", { source: faller.referrer, change: pct(faller.change) }),
                detail: t("{events} events vs {previous} in the previous period.", { events: fmt(faller.cur), previous: fmt(faller.prev) }),
                to: paths.acquisition, cta: t("Open Acquisition"),
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
                title: t("New audience: visitors from {country}", { country: fresh.code }),
                detail: t("{events} events this period — now one of your top 5 countries.", { events: fmt(fresh.events) }),
                to: paths.audience, cta: t("Open Audience"),
            });
        }
    }

    // ── Consent rate vs industry ───────────────────────────────────────────
    const bench = data.industryBenchmark;
    if (bench && data.totals.consentRate != null) {
        const diff = data.totals.consentRate - bench.consentRatePct;
        if (Math.abs(diff) >= 10) {
            const below = diff < 0;
            const vars = {
                pts: Math.round(Math.abs(diff)), industry: t(bench.label),
                rate: formatPercent(data.totals.consentRate), benchmark: formatPercent(bench.consentRatePct),
            };
            out.push({
                id: "consent-benchmark",
                tone: below ? "bad" : "good",
                score: (below ? 55 : 30) + Math.min(Math.abs(diff), 60) / 3,
                title: below
                    ? t("Statistics consent {pts} pts below the {industry} average", vars)
                    : t("Statistics consent {pts} pts above the {industry} average", vars),
                detail: below
                    ? t("{rate} of visitors accept statistics cookies, against {benchmark} on average. Every visitor who declines is missing from your sessions and conversions.", vars)
                    : t("{rate} of visitors accept statistics cookies, against {benchmark} on average.", vars),
                to: paths.consent, cta: below ? t("See how visitors answer your banner") : t("Open Consent"),
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
                title: change >= 0
                    ? t("Conversions up {change}", { change: pct(change) })
                    : t("Conversions down {change}", { change: pct(change) }),
                detail: t("{current} vs {previous} in the previous period.", { current: fmt(conversions), previous: fmt(prevConversions) }),
                to: paths.conversions, cta: t("Open Conversions"),
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
            title: t("Only {rate} complete form \"{form}\"", { rate: formatPercent(weakForm.completionRate), form: weakForm.formId }),
            detail: t("{started} started, {submitted} submitted.", { started: fmt(weakForm.started), submitted: fmt(weakForm.submitted) }),
            to: paths.forms, cta: t("Open Forms"),
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
            title: t("{rate} of sessions show rage clicks", { rate: `${frustration}%` }),
            detail: topPage
                ? t("Most on {page} ({count} rage clicks).", { page: topPage.page, count: fmt(topPage.rageClicks) })
                : t("Visitors click repeatedly on something that doesn't respond."),
            to: paths.heatmap, cta: t("Open Heatmap"),
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
                title: t("{page} views up {change}", { page: best.pathname, change: pct(best.change) }),
                detail: t("{views} views vs {previous} before.", { views: fmt(best.views), previous: fmt(best.prev) }),
                to: paths.acquisition, cta: t("Open Acquisition"),
            });
        }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, MAX_INSIGHTS);
}

const TONE_ICON = { good: IconCheckCircle, bad: IconAlertTriangle, info: IconInfoCircle };
const toneLabel = (tone) => (tone === "good" ? t("Positive") : tone === "bad" ? t("Needs attention") : t("Notable"));

// "Last 30 days", from the dates actually requested — the range picker's
// day count isn't updated when a custom from/to is picked.
export function periodLabel(fromIso, toIso) {
    const days = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000) + 1;
    if (!Number.isFinite(days) || days < 1) return t("This period");
    return days === 1 ? t("One day") : t("Last {days} days", { days });
}

// The block at the top of a report page: one finding in large type, a line
// of evidence under it, up to two more findings, and a link to act on the
// first. `lead`/`bullets` carry a tone (good | bad | info) for the marker.
export function TopFindings({ period, lead, sub, bullets = [], cta }) {
    const LeadIcon = lead.tone ? TONE_ICON[lead.tone] : null;
    return (
        <section className="sa-top-findings" aria-labelledby="sa-top-findings-title">
            <p className="sa-top-findings__eyebrow" id="sa-top-findings-title">
                {t("{period} · what stands out", { period })}
            </p>
            <p className={`sa-top-findings__lead${lead.tone ? ` sa-top-findings__lead--${lead.tone}` : ""}`}>
                {LeadIcon && <LeadIcon className="sa-top-findings__icon" role="img" aria-label={toneLabel(lead.tone)} />}
                <span>{lead.text}</span>
            </p>
            {sub && <p className="sa-top-findings__sub">{sub}</p>}
            {(bullets.length > 0 || cta) && (
                <div className="sa-top-findings__foot">
                    {bullets.length > 0 && (
                        <ul className="sa-top-findings__list">
                            {bullets.map(b => (
                                <li key={b.text} className={`sa-top-findings__item sa-top-findings__item--${b.tone || "info"}`}>
                                    {b.to ? <Link to={b.to}>{b.text}</Link> : b.text}
                                </li>
                            ))}
                        </ul>
                    )}
                    {cta && <Link className="sa-top-findings__cta" to={cta.to}>{cta.label} →</Link>}
                </div>
            )}
        </section>
    );
}

export function InsightsSection({ insights, compareLabel }) {
    return (
        <section className="sa-insights" aria-labelledby="sa-insights-title">
            <div className="sa-section-hd">
                <h3 id="sa-insights-title" className="sa-section-hd__title">{t("More insights")}</h3>
                <span className="sa-section-hd__sub">{compareLabel}</span>
            </div>
            {/* One scrollable row; focusable so it can be scrolled with the keyboard */}
            <div className="sa-insights__grid" role="region" aria-label={t("More insights")} tabIndex={0}>
                {insights.map(i => {
                    const Icon = TONE_ICON[i.tone];
                    return (
                        <Link key={i.id} to={i.to} className={`sa-insight sa-insight--${i.tone}`}>
                            <span className="sa-insight__tone">
                                <Icon className="sa-insight__icon" aria-hidden="true" />
                                {toneLabel(i.tone)}
                            </span>
                            <span className="sa-insight__title" title={i.title}>{i.title}</span>
                            <span className="sa-insight__detail">{i.detail}</span>
                            <span className="sa-insight__cta">{i.cta} →</span>
                        </Link>
                    );
                })}
            </div>
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
