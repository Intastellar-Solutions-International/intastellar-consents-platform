// One headline number with its change vs the previous period. Small
// samples say "Too little data" instead of an alarming arrow — the same
// rule as the web (src/Functions/smallSample.js, shared).
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Feather from "@expo/vector-icons/Feather";
import { isLowDataCount, isLowDataRate } from "../../../../src/Functions/smallSample.js";
import { colors, radius, space, text } from "../lib/theme.js";
import { formatNumber, formatPercent } from "../lib/format.js";
import { t } from "../lib/i18n.js";

/** Change for a count (percent) or a rate (points); null when not comparable. */
export function delta({ current, previous, kind = "count", base, previousBase, goodWhen = "up" }) {
    if (current == null || previous == null) return null;
    if (kind === "rate") {
        if (isLowDataRate(base, previousBase)) return { lowData: true };
        const value = Math.round((current - previous) * 10) / 10;
        return { value, label: t("{value} pts", { value: formatNumber(Math.abs(value), { maximumFractionDigits: 1 }) }), goodWhen };
    }
    if (isLowDataCount(current, previous)) return { lowData: true };
    if (!(previous > 0)) return null;
    const value = ((current - previous) / previous) * 100;
    return { value, label: formatPercent(Math.abs(value)), goodWhen };
}

export default function KpiTile({ label, value, hint, change, onPress }) {
    let changeView = null;
    if (change?.lowData) {
        changeView = <Text style={styles.muted}>{t("Too little data")}</Text>;
    } else if (change && Number.isFinite(change.value)) {
        const up = change.value > 0;
        const flat = change.value === 0;
        const good = flat ? null : (change.goodWhen === "down" ? !up : up);
        const color = flat ? colors.textMuted : good ? colors.success : colors.dangerText;
        changeView = (
            <Text style={[styles.change, { color }]} accessibilityLabel={`${flat ? t("no change") : up ? "+" : "−"}${change.label} ${t("vs previous period")}`}>
                {flat ? "" : up ? "▲ " : "▼ "}{change.label}
            </Text>
        );
    }
    const Wrapper = onPress ? Pressable : View;
    const pressProps = onPress ? {
        accessibilityRole: "button",
        onPress: () => { Haptics.selectionAsync().catch(() => {}); onPress(); },
        style: ({ pressed }) => [styles.tile, pressed && styles.pressed],
    } : { style: styles.tile };
    return (
        <Wrapper {...pressProps}>
            <View style={styles.labelRow}>
                <Text style={styles.label} numberOfLines={2}>{label}</Text>
                {onPress ? <Feather name="chevron-right" size={14} color={colors.textMuted} /> : null}
            </View>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
            {changeView}
            {hint ? <Text style={styles.hint} numberOfLines={2}>{hint}</Text> : null}
        </Wrapper>
    );
}

/** Two tiles per row. */
export function KpiGrid({ children }) {
    return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
    tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.bgRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: space[4], gap: space[1] },
    pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
    labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space[1] },
    label: { flex: 1, color: colors.textMuted, fontSize: text.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
    value: { color: colors.textPrimary, fontSize: text.xxl, fontWeight: "600", fontVariant: ["tabular-nums"] },
    change: { fontSize: text.sm, fontVariant: ["tabular-nums"] },
    muted: { color: colors.textMuted, fontSize: text.sm },
    hint: { color: colors.textMuted, fontSize: text.xs },
});
