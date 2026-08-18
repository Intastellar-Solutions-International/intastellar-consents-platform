import { BarSegment } from "./_shared.js";
import { IconMegaphone } from "./Icons.js";

const CHANNEL_LABEL = { organic: "Organic", paid: "Paid", referral: "Referral", direct: "Direct" };
const CHANNEL_COLOR = {
    organic:  "rgba(74,222,128,0.7)",
    paid:     "rgba(251,146,60,0.7)",
    referral: "rgba(99,179,237,0.7)",
    direct:   "rgba(167,139,250,0.7)",
};
const DEVICE_LABEL = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
const DEVICE_COLOR = "rgba(192,159,83,0.7)";

function Breakdown({ rows, labelMap, colorMap, defaultColor, empty }) {
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (!rows.length || total === 0) return <p className="sa-panel__sub">{empty}</p>;
    return (
        <div className="sa-consent-list">
            {rows.map(r => {
                const pct = Math.round((r.count / total) * 100);
                const color = (colorMap && colorMap[r.key]) || defaultColor;
                return (
                    <div key={r.key} className="sa-consent-row">
                        <span className="sa-consent-row__label">{(labelMap && labelMap[r.key]) || r.key}</span>
                        <div className="sa-bar">
                            <BarSegment pct={pct} color={color} title={`${r.count} conversions`} />
                        </div>
                        <span className="sa-consent-row__pct">{pct}%</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function ConversionChannels({ byChannel, byDevice }) {
    const channelRows = (byChannel || [])
        .map(c => ({ key: c.channel, count: c.count }))
        .sort((a, b) => b.count - a.count);
    const deviceRows = (byDevice || [])
        .map(d => ({ key: d.type, count: d.count }))
        .sort((a, b) => b.count - a.count);

    return (
        <div className="sa-panel sa-conv-channels">
            <h3 className="sa-panel__title">
                <IconMegaphone className="sa-icon" /> Where conversions come from
                <span className="sa-panel__consent-note">session-linked conversions only</span>
            </h3>
            <h4 className="sa-panel__sub-title">Channel</h4>
            <Breakdown
                rows={channelRows}
                labelMap={CHANNEL_LABEL}
                colorMap={CHANNEL_COLOR}
                empty="No channel data for this period."
            />
            <div className="sa-panel__divider" />
            <h4 className="sa-panel__sub-title">Device</h4>
            <Breakdown
                rows={deviceRows}
                labelMap={DEVICE_LABEL}
                defaultColor={DEVICE_COLOR}
                empty="No device data for this period."
            />
        </div>
    );
}
