// Small building blocks in the CMP style: dark cards, muted labels,
// gold only for the primary action.
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, space, text } from "../lib/theme.js";

export function Screen({ title, header, children, refreshing, onRefresh }) {
    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
            >
                {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
                {header}
                {children}
            </ScrollView>
        </SafeAreaView>
    );
}

export function Card({ title, children, style }) {
    return (
        <View style={[styles.card, style]}>
            {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
            {children}
        </View>
    );
}

export function Button({ label, onPress, variant = "primary", disabled, loading }) {
    const primary = variant === "primary";
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            disabled={disabled || loading}
            style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : styles.buttonSecondary, (pressed || disabled) && { opacity: 0.7 }]}
        >
            {loading ? <ActivityIndicator color={primary ? colors.textInverse : colors.textPrimary} /> : (
                <Text style={[styles.buttonLabel, { color: primary ? colors.textInverse : colors.textPrimary }]}>{label}</Text>
            )}
        </Pressable>
    );
}

/** Empty, error or "not set up" state with an optional action. */
export function Message({ title, body, action, onAction, tone = "neutral" }) {
    return (
        <Card style={tone === "error" ? { borderColor: "rgba(248,113,113,0.4)" } : undefined}>
            <Text style={styles.messageTitle}>{title}</Text>
            {body ? <Text style={styles.messageBody}>{body}</Text> : null}
            {action ? <View style={{ marginTop: space[4] }}><Button label={action} onPress={onAction} variant="secondary" /></View> : null}
        </Card>
    );
}

export function Loading() {
    return <View style={{ paddingVertical: space[8] }}><ActivityIndicator color={colors.textMuted} /></View>;
}

/** One quiet line under the numbers: source · filters · updated. */
export function SourceLine({ parts }) {
    return <Text style={styles.source}>{parts.filter(Boolean).join(" · ")}</Text>;
}

export const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgBase },
    scroll: { padding: space[4], gap: space[4], paddingBottom: space[8] },
    title: { color: colors.textPrimary, fontSize: text.xxl, fontWeight: "400" },
    card: { backgroundColor: colors.bgRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: space[4], gap: space[3] },
    cardTitle: { color: colors.textPrimary, fontSize: text.base, fontWeight: "600" },
    button: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: space[4], alignItems: "center", justifyContent: "center" },
    buttonPrimary: { backgroundColor: colors.accent },
    buttonSecondary: { borderWidth: 1, borderColor: colors.border },
    buttonLabel: { fontSize: text.base, fontWeight: "600" },
    messageTitle: { color: colors.textPrimary, fontSize: text.base, fontWeight: "600" },
    messageBody: { color: colors.textSecondary, fontSize: text.sm, lineHeight: 20 },
    source: { color: colors.textMuted, fontSize: text.xs, lineHeight: 18 },
    muted: { color: colors.textMuted, fontSize: text.sm },
});
