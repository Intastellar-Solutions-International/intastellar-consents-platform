import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useSession } from "../../lib/session.js";
import { openWeb } from "../../lib/web.js";
import { colors, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Button, Card, Screen } from "../../components/ui.js";

function Row({ label, onPress, selected }) {
    return (
        <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={styles.row}>
            <Text style={[styles.rowText, selected && { color: colors.accentStrong }]}>{label}</Text>
            {selected ? <Text style={{ color: colors.accentStrong }}>✓</Text> : <Text style={styles.chev}>›</Text>}
        </Pressable>
    );
}

export default function More() {
    const { user, organisations, organisationId, setOrganisationId, signOut } = useSession();
    const name = [user?.name?.first, user?.name?.last].filter(Boolean).join(" ");
    return (
        <Screen title={t("More")}>
            <Card>
                <Text style={styles.name}>{name || user?.email}</Text>
                {name ? <Text style={styles.email}>{user?.email}</Text> : null}
            </Card>
            {organisations.length > 1 && (
                <Card title={t("Organisation")}>
                    {organisations.map((o) => (
                        <Row key={o.id} label={o.name} selected={o.id === organisationId} onPress={() => setOrganisationId(o.id)} />
                    ))}
                </Card>
            )}
            <Card title={t("Web dashboard")}>
                <Row label={t("Reports")} onPress={() => openWeb("/analytics")} />
                <Row label={t("Ad connections")} onPress={() => openWeb("/settings/ad-connections")} />
                <Row label={t("Help desk & support")} onPress={() => openWeb("https://help.intastellar.eu/")} />
            </Card>
            <View style={{ gap: space[2] }}>
                <Button label={t("Sign out")} variant="secondary" onPress={signOut} />
                <Text style={styles.version}>Intastellar Analytics {Constants.expoConfig?.version}</Text>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    name: { color: colors.textPrimary, fontSize: text.lg, fontWeight: "600" },
    email: { color: colors.textMuted, fontSize: text.sm },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
    rowText: { color: colors.textPrimary, fontSize: text.base },
    chev: { color: colors.textMuted, fontSize: text.lg },
    version: { color: colors.textMuted, fontSize: text.xs, textAlign: "center" },
});
