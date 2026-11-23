// A ranked list with a proportional bar under each label — pages, sources,
// countries. Values are pre-formatted by the caller.
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space, text } from "../lib/theme.js";

export default function BarList({ rows, color = colors.data, mono = false }) {
    const max = Math.max(...rows.map((r) => r.value), 1);
    return (
        <View style={{ gap: space[3] }}>
            {rows.map((r) => (
                <View key={r.key} accessible accessibilityLabel={`${r.label}: ${r.display}`}>
                    <View style={styles.head}>
                        <Text style={[styles.label, mono && styles.mono]} numberOfLines={1}>{r.label}</Text>
                        <Text style={styles.value}>{r.display}</Text>
                    </View>
                    <View style={styles.track}>
                        <View style={[styles.fill, { width: `${Math.max(3, (r.value / max) * 100)}%`, backgroundColor: color }]} />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    head: { flexDirection: "row", justifyContent: "space-between", gap: space[3], marginBottom: 6 },
    label: { flex: 1, color: colors.textPrimary, fontSize: text.sm },
    mono: { fontFamily: "Menlo", fontSize: 13 },
    value: { color: colors.textSecondary, fontSize: text.sm, fontVariant: ["tabular-nums"] },
    track: { height: 6, borderRadius: radius.sm, backgroundColor: colors.bgSunken, overflow: "hidden" },
    fill: { height: "100%", borderRadius: radius.sm },
});
