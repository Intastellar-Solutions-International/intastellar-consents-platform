// Line + soft area for a daily series, drawn with react-native-svg in the
// CMP data colour. Minimal on purpose: first/last date and the peak.
import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Line, Path, Stop } from "react-native-svg";
import { colors, space, text } from "../lib/theme.js";
import { formatNumber } from "../lib/format.js";
import { locale } from "../lib/i18n.js";

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });

export default function TrendChart({ points, height = 140, color = colors.data }) {
    const [width, setWidth] = useState(0);
    if (!points?.length) return null;
    const max = Math.max(...points.map((p) => p.value), 1);
    const pad = 4;
    const x = (i) => (points.length === 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2));
    const y = (v) => pad + (1 - v / max) * (height - pad * 2);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
    return (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${shortDate(points[0].date)} – ${shortDate(points[points.length - 1].date)}, max ${formatNumber(max)}`}>
            {width > 0 && (
                <Svg width={width} height={height}>
                    <Defs>
                        <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
                            <Stop offset="1" stopColor={color} stopOpacity="0" />
                        </LinearGradient>
                    </Defs>
                    <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={colors.border} />
                    <Path d={area} fill="url(#area)" />
                    <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </Svg>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space[2] }}>
                <Text style={{ color: colors.textMuted, fontSize: text.xs }}>{shortDate(points[0].date)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: text.xs }}>{shortDate(points[points.length - 1].date)}</Text>
            </View>
        </View>
    );
}
