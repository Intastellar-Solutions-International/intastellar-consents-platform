// A daily series you can scrub: touch and slide to read any day's value.
// The previous period is drawn dashed, day-aligned, for comparison.
// Plain react-native-svg + PanResponder (no extra native modules).
import { useEffect, useMemo, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { colors, space, text } from "../lib/theme.js";
import { locale } from "../lib/i18n.js";

const fullDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });

/**
 * points:   [{ date: "YYYY-MM-DD", value }]
 * previous: [{ value }] — same length/order as the previous period (optional)
 * format:   value → string
 * labels:   { current, previous } for the readout
 */
export default function InteractiveChart({ points, previous, format = String, labels = {}, height = 200, color = colors.data, maxValue }) {
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(null);

    const pad = { top: 12, bottom: 8, x: 4 };
    const prevValues = previous?.length ? previous.map((p) => p.value) : null;
    const max = maxValue ?? Math.max(...points.map((p) => p.value), ...(prevValues || []), 1);
    const x = (i) => (points.length === 1 ? width / 2 : pad.x + (i / (points.length - 1)) * (width - pad.x * 2));
    const y = (v) => pad.top + (1 - v / max) * (height - pad.top - pad.bottom);

    const paths = useMemo(() => {
        if (!width || !points.length) return null;
        const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
        const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
        const prev = prevValues
            ? prevValues.slice(0, points.length).map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
            : null;
        return { line, area, prev };
    }, [width, points, prevValues, max, height]); // eslint-disable-line react-hooks/exhaustive-deps

    const indexAt = (px) => {
        if (points.length < 2) return 0;
        const i = Math.round(((px - pad.x) / (width - pad.x * 2)) * (points.length - 1));
        return Math.max(0, Math.min(points.length - 1, i));
    };
    // A light tick each time the finger reaches another day.
    useEffect(() => { if (active != null) Haptics.selectionAsync().catch(() => {}); }, [active]);
    const scrubTo = (px) => setActive(indexAt(px));
    const responder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => scrubTo(e.nativeEvent.locationX),
        onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
        onPanResponderRelease: () => setActive(null),
        onPanResponderTerminate: () => setActive(null),
    }), [width, points.length]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!points.length) return null;
    const shown = active ?? points.length - 1;
    const point = points[shown];
    const prevValue = prevValues?.[shown];
    const summary = `${shortDate(points[0].date)} – ${shortDate(points[points.length - 1].date)}. ${labels.current || ""} ${format(points[points.length - 1].value)}${prevValues ? `, ${labels.previous || ""} ${format(prevValues[prevValues.length - 1])}` : ""}`;

    return (
        <View accessible accessibilityLabel={summary}>
            <View style={styles.readout}>
                <Text style={styles.readDate}>{fullDate(point.date)}</Text>
                <View style={styles.readValues}>
                    <View style={styles.readItem}>
                        <View style={[styles.swatch, { backgroundColor: color }]} />
                        <Text style={styles.readValue}>{format(point.value)}</Text>
                    </View>
                    {prevValue != null && (
                        <View style={styles.readItem}>
                            <View style={[styles.swatch, styles.swatchDashed]} />
                            <Text style={styles.readPrev}>{format(prevValue)}</Text>
                        </View>
                    )}
                </View>
            </View>
            <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
                {width > 0 && paths && (
                    <Svg width={width} height={height}>
                        <Defs>
                            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={color} stopOpacity="0.3" />
                                <Stop offset="1" stopColor={color} stopOpacity="0" />
                            </LinearGradient>
                        </Defs>
                        {[0.25, 0.5, 0.75].map((f) => (
                            <Line key={f} x1={0} x2={width} y1={pad.top + f * (height - pad.top - pad.bottom)} y2={pad.top + f * (height - pad.top - pad.bottom)} stroke={colors.borderSubtle} />
                        ))}
                        <Path d={paths.area} fill="url(#fill)" />
                        {paths.prev ? <Path d={paths.prev} fill="none" stroke={colors.textMuted} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
                        <Path d={paths.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                        {active != null && (
                            <>
                                <Line x1={x(shown)} x2={x(shown)} y1={0} y2={height} stroke={colors.textMuted} strokeOpacity={0.6} />
                                <Circle cx={x(shown)} cy={y(point.value)} r={5} fill={colors.bgBase} stroke={color} strokeWidth={2.5} />
                            </>
                        )}
                    </Svg>
                )}
            </View>
            <View style={styles.axis}>
                <Text style={styles.axisText}>{shortDate(points[0].date)}</Text>
                <Text style={styles.axisText}>{shortDate(points[points.length - 1].date)}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    readout: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space[2], minHeight: 24 },
    readDate: { color: colors.textMuted, fontSize: text.xs },
    readValues: { flexDirection: "row", gap: space[3] },
    readItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    swatch: { width: 10, height: 3, borderRadius: 2 },
    swatchDashed: { backgroundColor: colors.textMuted, opacity: 0.7 },
    readValue: { color: colors.textPrimary, fontSize: text.sm, fontWeight: "600", fontVariant: ["tabular-nums"] },
    readPrev: { color: colors.textMuted, fontSize: text.sm, fontVariant: ["tabular-nums"] },
    axis: { flexDirection: "row", justifyContent: "space-between", marginTop: space[2] },
    axisText: { color: colors.textMuted, fontSize: text.xs },
});
