// "What changed": names where a change against the previous period came
// from (channel, device, country, page, channel × device). Backed by
// api/analytics-explain.js.
const { useState, useEffect } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders, formatPercent } from "./_shared.js";
import { IconTrendingUp } from "./Icons.js";
import { appLocale, formatDate } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

const CHANNEL_LABELS = { organic: "Organic Search", paid: "Paid", paid_social: "Paid Social", referral: "Referral", direct: "Direct" };
const DEVICE_LABELS = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", other: "Other" };
const DIMENSIONS = [
    ["channel", "Channel"], ["device", "Device"], ["country", "Country"], ["page", "Page"], ["channel_device", "Channel and device"],
];

function countryName(code) {
    if (!code) return t("Unknown");
    try { return new Intl.DisplayNames([appLocale()], { type: "region" }).of(code) || code; } catch { return code; }
}

/** A driver's human name: "Paid Social on mobile", "Denmark", "/pricing". */
export function driverLabel(dimension, value) {
    if (dimension === "channel") return t(CHANNEL_LABELS[value] || value);
    if (dimension === "device") return t(DEVICE_LABELS[value] || value);
    if (dimension === "country") return countryName(value);
    if (dimension === "channel_device") {
        const [channel, device] = String(value).split("|");
        return t("{channel} on {device}", { channel: t(CHANNEL_LABELS[channel] || channel), device: t(DEVICE_LABELS[device] || device).toLowerCase() });
    }
    return value || "/";
}

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString(appLocale())}`;

function Summary({ r, metricLabel }) {
    const when = t("compared with {from} – {to}", { from: formatDate(r.previousFrom), to: formatDate(r.previousTo) });
    if (!r.meaningful) {
        return <p>{t("{metric}: no notable change {when} ({change}).", { metric: metricLabel, when, change: r.pct != null ? `${r.pct > 0 ? "+" : ""}${formatPercent(r.pct)}` : signed(r.delta) })}</p>;
    }
    const verb = r.delta > 0 ? t("rose") : t("fell");
    const pct = r.pct != null ? ` ${formatPercent(Math.abs(r.pct))}` : "";
    return (
        <p className="sa-explain__summary">
            {t("{metric} {verb}{pct} ({delta}) {when}.", { metric: metricLabel, verb, pct, delta: signed(r.delta), when })}
            {r.headline ? <> {t("Most of it: {name} ({delta}, {share} of the change).", { name: driverLabel(r.headline.dimension, r.headline.value), delta: signed(r.headline.delta), share: formatPercent(Math.min(100, r.headline.share * 100)) })}</> : null}
            {r.offset ? <> {t("Partly offset by {name} ({delta}).", { name: driverLabel(r.offset.dimension, r.offset.value), delta: signed(r.offset.delta) })}</> : null}
        </p>
    );
}

export function ChangeExplainer({ domain, from, to, excludeBots }) {
    const [metric, setMetric] = useState("pageviews");
    const [result, setResult] = useState(null);
    useEffect(() => {
        if (!domain || !from || !to) return undefined;
        let cancelled = false;
        const qs = new URLSearchParams({ domain, from, to, metric });
        fetch(`${ScannerHost}/api/analytics-explain?${qs}`, { headers: { ...authHeaders(), ExcludeBots: excludeBots ? "1" : "0" } })
            .then((r) => (r.ok ? r.json() : null))
            .then((body) => { if (!cancelled) setResult(body); })
            .catch(() => { if (!cancelled) setResult(null); });
        return () => { cancelled = true; };
    }, [domain, from, to, metric, excludeBots]);
    if (!result) return null;
    const metricLabel = metric === "sessions" ? t("Sessions (consenting)") : t("Page views");
    return (
        <div className="sa-panel sa-explain">
            <div className="sa-chart-section__hd">
                <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> {t("What changed")}</h3>
                <div className="sa-seg-metric" role="group" aria-label={t("Metric")}>
                    {[["pageviews", t("Page views")], ["sessions", t("Sessions")]].map(([key, label]) => (
                        <button key={key} type="button" aria-pressed={metric === key}
                            className={`sa-customize-btn${metric === key ? " sa-customize-btn--active" : ""}`}
                            onClick={() => setMetric(key)}>{label}</button>
                    ))}
                </div>
            </div>
            <Summary r={result} metricLabel={metricLabel} />
            {result.meaningful ? (
                <details className="sa-model-note">
                    <summary>{t("Breakdown by channel, device, country and page")}</summary>
                    <div className="sa-explain__grid">
                        {DIMENSIONS.map(([key, label]) => (result.drivers[key]?.length ? (
                            <table key={key} className="sa-table">
                                <thead><tr><th>{t(label)}</th><th className="sa-table__num">{t("Before")}</th><th className="sa-table__num">{t("Now")}</th><th className="sa-table__num">{t("Change")}</th></tr></thead>
                                <tbody>
                                    {result.drivers[key].map((d) => (
                                        <tr key={d.value}>
                                            <td className="sa-table__path" title={driverLabel(key, d.value)}>{driverLabel(key, d.value)}</td>
                                            <td className="sa-table__num">{d.previous.toLocaleString(appLocale())}</td>
                                            <td className="sa-table__num">{d.current.toLocaleString(appLocale())}</td>
                                            <td className={`sa-table__num sa-seg-diff sa-seg-diff--${d.delta > 0 ? "up" : "down"}`}>{signed(d.delta)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : null))}
                    </div>
                </details>
            ) : null}
        </div>
    );
}
