// Daily trend for one channel on the Campaign consent page (index.js).
import Line from "../../../Components/Charts/Line";
import { ymdLocal } from "../../../Components/Filter/filterDatePresets.js";
import { t } from "../../../i18n/index.js";

const { useMemo } = React;

function EmptyNote({ children }) {
    return <p className="marketing-charts__empty">{children}</p>;
}


function tsChannelRow(r) {
    /*
     * Normalise a raw timeseries row (snake_case or camelCase) into the
     * shape `deriveMarketingChannel` reads. `"—"` is the same "missing"
     * sentinel the aggregated endpoint returns, so derivation heuristics
     * see identical input regardless of which endpoint produced the row.
     */
    const utmSource = String(r.utm_source ?? r.utmSource ?? "—") || "—";
    const utmMedium = String(r.utm_medium ?? r.utmMedium ?? "—") || "—";
    const utmCampaign = String(r.utm_campaign ?? r.utmCampaign ?? "—") || "—";
    const referrer = String(
        r.referrer_host ?? r.referrerHost ?? r.referrer ?? "—"
    );
    return {
        utmSource,
        utmMedium,
        utmCampaign,
        referrer: referrer || "—",
    };
}

function dailyConsentsForChannel(timeseriesRows, selectedChannel, deriveChannel) {
    if (!Array.isArray(timeseriesRows) || timeseriesRows.length === 0) return [];
    if (!selectedChannel || typeof deriveChannel !== "function") return [];
    const byDate = new Map();
    for (const r of timeseriesRows) {
        const channel = deriveChannel(tsChannelRow(r));
        if (channel !== selectedChannel) continue;
        const d = String(r.date ?? "").slice(0, 10);
        if (!d) continue;
        const cur = byDate.get(d) ?? 0;
        byDate.set(d, cur + (Number(r.consents) || 0));
    }
    return [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([date, consents]) => ({ date, consents }));
}

function buildLineSeries(primaryDaily, baselineDaily) {
    if (primaryDaily.length === 0) return [];
    return primaryDaily.map((d, i) => {
        const cmp = baselineDaily[i];
        return {
            date: d.date,
            num: d.consents,
            previousPeriod:
                cmp != null
                    ? { date: cmp.date, num: Number(cmp.consents) || 0 }
                    : null,
        };
    });
}

export function MarketingTimeseriesChart({
    channelName,
    deriveChannel,
    timeseriesRows,
    baselineTimeseriesRows,
    fromDate,
    toDate,
    compareEnabled,
    loading,
    errorMessage,
}) {
    const primaryDaily = useMemo(
        () => dailyConsentsForChannel(timeseriesRows, channelName, deriveChannel),
        [timeseriesRows, channelName, deriveChannel]
    );
    const baselineDaily = useMemo(
        () =>
            compareEnabled
                ? dailyConsentsForChannel(baselineTimeseriesRows, channelName, deriveChannel)
                : [],
        [baselineTimeseriesRows, channelName, deriveChannel, compareEnabled]
    );

    const lineData = useMemo(
        () => buildLineSeries(primaryDaily, compareEnabled ? baselineDaily : []),
        [primaryDaily, baselineDaily, compareEnabled]
    );

    const hasPoints = lineData.length > 0;
    const endpointReturnedRows = Array.isArray(timeseriesRows) && timeseriesRows.length > 0;
    const fromYmd = fromDate ? ymdLocal(fromDate) : "";
    const toYmd = toDate ? ymdLocal(toDate) : "";

    return (
        <section
            className="marketing-charts marketing-charts--timeseries"
            aria-labelledby="marketing-timeseries-h"
        >
            <h2 id="marketing-timeseries-h" className="marketing-report-section__title">
                {channelName ? t("{channel} — over time", { channel: channelName }) : t("Consent decisions over time")}
            </h2>
            <p className="marketing-report-section__hint">
                {t("Consent decisions per day for this channel. With a comparison on, the dashed line is the matching day in the comparison period.")}
            </p>
            <div className="marketing-charts__card marketing-charts__card--timeseries">
                <div className="marketing-charts__card-body marketing-charts__card-body--tall">
                    {loading ? (
                        <EmptyNote>{t("Loading daily trend…")}</EmptyNote>
                    ) : errorMessage ? (
                        <EmptyNote>{errorMessage}</EmptyNote>
                    ) : !hasPoints ? (
                        <EmptyNote>
                            {endpointReturnedRows
                                ? t("No daily data for {channel} in this period.", { channel: channelName })
                                : t("No daily data for this period yet.")}
                        </EmptyNote>
                    ) : (
                        <Line
                            data={lineData}
                            title={t("Decisions")}
                            fromDate={fromYmd}
                            toDate={toYmd}
                            compareEnabled={compareEnabled}
                            showInsights
                            showRangeControls
                        />
                    )}
                </div>
            </div>
        </section>
    );
}
