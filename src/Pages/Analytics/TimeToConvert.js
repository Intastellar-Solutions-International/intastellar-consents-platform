import { BarSegment, formatDuration } from "./_shared.js";
import { IconClock } from "./Icons.js";

const BUCKET_COLOR = "rgba(192,159,83,0.7)";

export default function TimeToConvert({ timeToConvert, totalConversions }) {
    const sampleSize = timeToConvert?.sampleSize || 0;
    const buckets = timeToConvert?.buckets || [];
    const maxCount = Math.max(1, ...buckets.map(b => b.count));
    const unmeasurable = Math.max(0, (totalConversions || 0) - sampleSize);

    return (
        <div className="sa-panel sa-conv-ttc">
            <h3 className="sa-panel__title">
                <IconClock className="sa-icon" /> Time to convert
                <span className="sa-panel__consent-note">
                    median {formatDuration(timeToConvert?.medianSeconds)} &middot; {sampleSize.toLocaleString("de-DE")} measured
                </span>
            </h3>

            {sampleSize === 0 ? (
                <p className="sa-panel__sub">
                    Not enough session-linked conversions yet to break out time-to-convert.
                </p>
            ) : (
                <>
                    <div className="sa-consent-list">
                        {buckets.map(b => {
                            const pct = Math.round((b.count / maxCount) * 100);
                            return (
                                <div key={b.key} className="sa-consent-row sa-ttc-row">
                                    <span className="sa-consent-row__label">{b.label}</span>
                                    <div className="sa-bar">
                                        <BarSegment pct={pct} color={BUCKET_COLOR} title={`${b.count} conversions`} />
                                    </div>
                                    <span className="sa-consent-row__pct">{b.count.toLocaleString("de-DE")}</span>
                                </div>
                            );
                        })}
                    </div>
                    {unmeasurable > 0 && (
                        <p className="sa-panel__consent-note sa-ttc-note">
                            {unmeasurable.toLocaleString("de-DE")} conversion{unmeasurable !== 1 ? "s" : ""} without analytics
                            consent can't be timed — no session to measure from.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
