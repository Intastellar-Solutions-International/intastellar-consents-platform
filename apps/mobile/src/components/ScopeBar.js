// Domain picker + period switch at the top of each data screen, shared
// across tabs (stored in the session).
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../lib/session.js";
import { colors, radius, space, text } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

const PERIODS = [7, 30, 90];

export default function ScopeBar({ showPeriod = true }) {
    const { domains, domain, setDomain, days, setDays } = useSession();
    const [open, setOpen] = useState(false);
    return (
        <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("Choose domain")} style={styles.domain} onPress={() => setOpen(true)} disabled={!domains.length}>
                <Text style={styles.domainText} numberOfLines={1}>{domain || t("No domain")}</Text>
                <Text style={styles.chevron}>▾</Text>
            </Pressable>
            {showPeriod && (
                <View style={styles.segment} accessibilityRole="tablist">
                    {PERIODS.map((d) => (
                        <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: d === days }} onPress={() => setDays(d)}
                            style={[styles.segmentItem, d === days && styles.segmentActive]}>
                            <Text style={[styles.segmentText, d === days && styles.segmentTextActive]}>{t("{count} d", { count: d })}</Text>
                        </Pressable>
                    ))}
                </View>
            )}
            <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
                <SafeAreaView style={styles.sheet}>
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle}>{t("Choose domain")}</Text>
                        <Pressable accessibilityRole="button" onPress={() => setOpen(false)}><Text style={styles.close}>{t("Close")}</Text></Pressable>
                    </View>
                    <FlatList
                        data={domains}
                        keyExtractor={(d) => d}
                        renderItem={({ item }) => (
                            <Pressable accessibilityRole="button" accessibilityState={{ selected: item === domain }} style={styles.option}
                                onPress={() => { setDomain(item); setOpen(false); }}>
                                <Text style={[styles.optionText, item === domain && { color: colors.accentStrong }]}>{item}</Text>
                                {item === domain ? <Text style={{ color: colors.accentStrong }}>✓</Text> : null}
                            </Pressable>
                        )}
                    />
                </SafeAreaView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space[2] },
    domain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 40, paddingHorizontal: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
    domainText: { flex: 1, color: colors.textPrimary, fontSize: text.sm, fontFamily: "Menlo" },
    chevron: { color: colors.textMuted },
    segment: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    segmentItem: { paddingHorizontal: space[3], minHeight: 40, justifyContent: "center" },
    segmentActive: { backgroundColor: "rgba(192,159,83,0.18)" },
    segmentText: { color: colors.textSecondary, fontSize: text.sm },
    segmentTextActive: { color: colors.accentStrong, fontWeight: "600" },
    sheet: { flex: 1, backgroundColor: colors.bgBase },
    sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space[4] },
    sheetTitle: { color: colors.textPrimary, fontSize: text.lg, fontWeight: "600" },
    close: { color: colors.accentStrong, fontSize: text.base },
    option: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space[4], paddingVertical: space[4], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
    optionText: { color: colors.textPrimary, fontSize: text.base },
});
