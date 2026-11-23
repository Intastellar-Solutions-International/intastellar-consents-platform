import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import { useSession } from "../../lib/session.js";
import { useOpenWeb } from "../../lib/web.js";
import { colors, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Button, Card, Screen } from "../../components/ui.js";
import { canLock, lockEnabled, setLockEnabled } from "../../lib/lock.js";

/** Face ID / fingerprint lock — only offered when the phone has it set up. */
function AppLockCard() {
    const [available, setAvailable] = useState(false);
    const [on, setOn] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let alive = true;
        Promise.all([canLock().catch(() => false), lockEnabled()]).then(([can, enabled]) => { if (alive) { setAvailable(can); setOn(enabled); } });
        return () => { alive = false; };
    }, []);
    if (!available) return null;
    const toggle = async (next) => {
        setBusy(true);
        try { if (await setLockEnabled(next)) setOn(next); } finally { setBusy(false); }
    };
    return (
        <Card title={t("Security")}>
            <View style={styles.switchRow}>
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowText}>{t("App lock")}</Text>
                    <Text style={styles.hint}>{t("Ask for Face ID or fingerprint when the app opens.")}</Text>
                </View>
                <Switch accessibilityLabel={t("App lock")} value={on} disabled={busy} onValueChange={toggle}
                    trackColor={{ true: colors.accent, false: colors.bgSunken }} thumbColor={colors.textPrimary} />
            </View>
        </Card>
    );
}

function Row({ label, onPress, selected }) {
    return (
        <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={styles.row}>
            <Text style={[styles.rowText, selected && { color: colors.accentStrong }]}>{label}</Text>
            {selected ? <Text style={{ color: colors.accentStrong }}>✓</Text> : <Text style={styles.chev}>›</Text>}
        </Pressable>
    );
}

export default function More() {
    const openWeb = useOpenWeb();
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
            <AppLockCard />
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
    switchRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
    hint: { color: colors.textMuted, fontSize: text.xs, lineHeight: 17 },
    version: { color: colors.textMuted, fontSize: text.xs, textAlign: "center" },
});
