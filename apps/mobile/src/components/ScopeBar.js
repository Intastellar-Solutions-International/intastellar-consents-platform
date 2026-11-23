// Domain + period, one compact bar that sticks under the title on every
// data tab. Shared across tabs (session); the domain list opens as a sheet,
// with search once there are more than a handful.
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Feather from "@expo/vector-icons/Feather";
import { useSession } from "../lib/session.js";
import { colors, radius, space, text } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

const PERIODS = [7, 30, 90];
const SEARCH_FROM = 8;

export function DomainTile({ domain, size = 26 }) {
    const letter = String(domain || "?").replace(/^www\./, "").charAt(0).toUpperCase();
    return (
        <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.28 }]}>
            <Text style={[styles.tileText, { fontSize: size * 0.48 }]}>{letter}</Text>
        </View>
    );
}

export default function ScopeBar({ showPeriod = true }) {
    const { domains, domain, setDomain, days, setDays } = useSession();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? domains.filter((d) => d.includes(q)) : domains;
    }, [domains, query]);
    const pick = (fn) => { Haptics.selectionAsync().catch(() => {}); fn(); };

    return (
        <View style={styles.bar}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("Choose domain")} accessibilityHint={domain || undefined}
                style={({ pressed }) => [styles.domain, pressed && styles.pressed]} onPress={() => setOpen(true)} disabled={!domains.length}>
                <DomainTile domain={domain} />
                <Text style={styles.domainText} numberOfLines={1}>{domain || t("No domain")}</Text>
                <Feather name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
            {showPeriod && (
                <View style={styles.chips} accessibilityRole="tablist">
                    {PERIODS.map((d) => {
                        const active = d === days;
                        return (
                            <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: active }}
                                onPress={() => pick(() => setDays(d))} style={[styles.chip, active && styles.chipActive]}>
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t("{count} d", { count: d })}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            )}

            <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
                <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
                    <View style={styles.grabber} />
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle}>{t("Choose domain")}</Text>
                        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setOpen(false)}>
                            <Text style={styles.done}>{t("Done")}</Text>
                        </Pressable>
                    </View>
                    {domains.length > SEARCH_FROM && (
                        <View style={styles.search}>
                            <Feather name="search" size={16} color={colors.textMuted} />
                            <TextInput value={query} onChangeText={setQuery} placeholder={t("Search")} placeholderTextColor={colors.textMuted}
                                autoCapitalize="none" autoCorrect={false} style={styles.searchInput} clearButtonMode="while-editing" />
                        </View>
                    )}
                    <FlatList
                        data={shown}
                        keyExtractor={(d) => d}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => {
                            const active = item === domain;
                            return (
                                <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
                                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                                    onPress={() => pick(() => { setDomain(item); setOpen(false); setQuery(""); })}>
                                    <DomainTile domain={item} size={32} />
                                    <Text style={[styles.optionText, active && { color: colors.accentStrong }]} numberOfLines={1}>{item}</Text>
                                    {active ? <Feather name="check" size={18} color={colors.accentStrong} /> : null}
                                </Pressable>
                            );
                        }}
                    />
                </SafeAreaView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[2], backgroundColor: colors.bgBase },
    pressed: { opacity: 0.7 },
    domain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], height: 40, paddingLeft: 7, paddingRight: space[3], borderRadius: 20, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.borderSubtle },
    domainText: { flex: 1, color: colors.textPrimary, fontSize: text.sm, fontWeight: "500" },
    tile: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(192,159,83,0.18)" },
    tileText: { color: colors.accentStrong, fontWeight: "700" },
    chips: { flexDirection: "row", gap: 4, padding: 3, borderRadius: 20, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.borderSubtle },
    chip: { height: 32, paddingHorizontal: space[3], borderRadius: 16, justifyContent: "center" },
    chipActive: { backgroundColor: colors.accent },
    chipText: { color: colors.textSecondary, fontSize: text.xs, fontWeight: "600" },
    chipTextActive: { color: colors.textInverse },
    sheet: { flex: 1, backgroundColor: colors.bgBase },
    grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: space[2] },
    sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space[4], paddingVertical: space[3] },
    sheetTitle: { color: colors.textPrimary, fontSize: text.lg, fontWeight: "700" },
    done: { color: colors.accentStrong, fontSize: text.base, fontWeight: "600" },
    search: { flexDirection: "row", alignItems: "center", gap: space[2], marginHorizontal: space[4], marginBottom: space[2], paddingHorizontal: space[3], height: 40, borderRadius: radius.md, backgroundColor: colors.bgRaised },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: text.base },
    option: { flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
    optionText: { flex: 1, color: colors.textPrimary, fontSize: text.base },
});
