// What consent is worth: conversions that can / can't be attributed to a
// channel, a "5 points more consent" estimate, and banner A/B tests compared
// by downstream conversions. Backed by api/analytics-consent-revenue.js.
const { useState, useEffect } = React;
const Link = window.ReactRouterDOM.Link;
import { ScannerHost } from "../../API/host.js";
import { authHeaders, formatPercent, formatCurrency } from "./_shared.js";
import { IconShieldCheck } from "./Icons.js";
import { appLocale } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString(appLocale()));
const money = (n, currency) => (currency ? formatCurrency(n, currency) : fmt(n));
const per1k = (n) => (n == null ? "—" : n.toLocaleString(appLocale(), { maximumFractionDigits: 1 }));

function useConsentRevenue(domain, from, to) {
    const [state, setState] = useState({ loading: true, data: null });
    useEffect(() => {
        if (!domain || !from || !to) return undefined;
        let cancelled = false;
        setState({ loading: true, data: null });
        const qs = new URLSearchParams({ domain, from, to });
        fetch(`${ScannerHost}/api/analytics-consent-revenue?${qs}`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => { if (!cancelled) setState({ loading: false, data }); })
            .catch(() => { if (!cancelled) setState({ loading: false, data: null }); });
        return () => { cancelled = true; };
    }, [domain, from, to]);
    return state;
}

function Diff({ value, unit }) {
    if (value == null) return <span>—</span>;
    const sign = value > 0 ? "+" : "";
    const cls = value > 0 ? "up" : value < 0 ? "down" : "same";
    return <span className={`sa-seg-diff sa-seg-diff--${cls}`}>{unit === "pp" ? t("{value} pp", { value: `${sign}${value.toFixed(1)}` }) : `${sign}${Math.round(value)} %`}</span>;
}

function ExperimentTable({ experiment, currency, showMoney }) {
    return (
        <div className="sa-consent-rev__exp">
            <h4 className="sa-seg-dims__key">{t("Banner test {id}", { id: experiment.id })}</h4>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th>{t("Variant")}</th>
                        <th className="sa-table__num">{t("Page views")}</th>
                        <th className="sa-table__num">{t("Consent rate")}</th>
                        <th className="sa-table__num" title={t("Lead and sale conversions per 1,000 page views, from every visitor")}>{t("Conversions / 1,000")}</th>
                        <th className="sa-table__num" title={t("Conversions per 1,000 page views that can be attributed to a channel")}>{t("Attributable / 1,000")}</th>
                        {showMoney && <th className="sa-table__num">{t("Attributable revenue")}</th>}
                    </tr>
                </thead>
                <tbody>
                    {experiment.variants.map((v) => (
                        <tr key={v.variant}>
                            <td>
                                {v.variant}{v.isControl ? <span className="sa-consent-rev__tag">{t("control")}</span> : null}
                                {v.smallSample ? <span className="sa-consent-rev__tag sa-consent-rev__tag--warn" title={t("Under 500 page views — too little traffic to trust a difference yet.")}>{t("small sample")}</span> : null}
                            </td>
                            <td className="sa-table__num">{fmt(v.pageviews)}</td>
                            <td className="sa-table__num">{v.consentRate != null ? formatPercent(v.consentRate * 100) : "—"} {v.vsControl ? <Diff value={v.vsControl.consentRatePoints} unit="pp" /> : null}</td>
                            <td className="sa-table__num">{per1k(v.per1k)}</td>
                            <td className="sa-table__num">{per1k(v.attributablePer1k)} {v.vsControl ? <Diff value={v.vsControl.attributablePer1kPct} unit="%" /> : null}</td>
                            {showMoney && <td className="sa-table__num">{money(v.attributableRevenue, currency)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Money (revenue, attributable revenue) only on dashboards where sales carry
// a value — showsRevenue() in _shared.js; conversions show everywhere.
export function ConsentRevenuePanel({ domain, from, to, revenueMode }) {
    const { loading, data } = useConsentRevenue(domain, from, to);
    if (loading || !data) return null;
    const { conversions, whatIf, experiments } = data;
    const showMoney = !!revenueMode;
    const revenue = showMoney ? data.revenue : { currency: data.revenue.currency };
    const currency = revenue.currency;
    return (
        <div className="sa-panel sa-consent-rev">
            <h3 className="sa-panel__title"><IconShieldCheck className="sa-icon" /> {showMoney ? t("Consent and revenue") : t("Consent and conversions")}</h3>
            <p className="sa-panel__sub">
                {t("Every conversion is counted, but only conversions from visitors who accepted statistics cookies can be traced back to a channel or campaign.")}
            </p>
            {conversions.total ? (
                <>
                    <div className="sa-ci-kpis">
                        <div className="sa-ci-kpi">
                            <span className="sa-ci-kpi__label">{t("Conversions")}</span>
                            <span className="sa-ci-kpi__value">{fmt(conversions.total)}</span>
                            {revenue.total ? <span className="sa-ci-kpi__note">{money(revenue.total, currency)}</span> : null}
                        </div>
                        <div className="sa-ci-kpi">
                            <span className="sa-ci-kpi__label">{t("Attributable to a channel")}</span>
                            <span className="sa-ci-kpi__value">{fmt(conversions.attributable)}</span>
                            <span className="sa-ci-kpi__note">{formatPercent((conversions.attributableShare || 0) * 100)}{revenue.attributable ? ` · ${money(revenue.attributable, currency)}` : ""}</span>
                        </div>
                        <div className="sa-ci-kpi">
                            <span className="sa-ci-kpi__label">{t("Not attributable (declined)")}</span>
                            <span className="sa-ci-kpi__value">{fmt(conversions.unattributed)}</span>
                            {revenue.unattributed ? <span className="sa-ci-kpi__note">{money(revenue.unattributed, currency)}</span> : null}
                        </div>
                    </div>
                    {whatIf && whatIf.conversions > 0 ? (
                        <p className="sa-consent-rev__whatif">
                            {showMoney && whatIf.revenue > 0
                                ? t("If {points} percentage points more visitors accepted, about {count} more conversions ({revenue}) in this period could be traced to a channel.", { points: whatIf.points, count: fmt(whatIf.conversions), revenue: money(whatIf.revenue, currency) })
                                : t("If {points} percentage points more visitors accepted, about {count} more conversions in this period could be traced to a channel.", { points: whatIf.points, count: fmt(whatIf.conversions) })}
                        </p>
                    ) : null}
                </>
            ) : (
                <p className="sa-notice">{showMoney ? t("No lead or sale conversions in this period yet.") : t("No conversions in this period yet.")}</p>
            )}

            <h4 className="sa-consent-rev__sub">{t("Banner A/B tests")}</h4>
            {experiments.length ? (
                <>
                    <p className="sa-history-note">{t("A higher consent rate only pays off if conversions follow. Compare attributable conversions per 1,000 page views, not just the consent rate.")}</p>
                    {experiments.map((e) => <ExperimentTable key={e.id} experiment={e} currency={currency} showMoney={showMoney} />)}
                </>
            ) : (
                <p className="sa-history-note">
                    {t("No banner test in this period. Run one to see how a banner change affects attributable conversions — the analytics records the variant each visitor saw from now on.")}
                    {" "}<Link to="/experiments">{t("Banner experiments")}</Link>
                </p>
            )}
        </div>
    );
}
