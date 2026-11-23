import { useEffect, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchAlerts } from "../../lib/api.js";
import { PushUnavailable, disablePush, enablePush, pushPermission, storedPushToken } from "../../lib/push.js";
import { useOpenWeb } from "../../lib/web.js";
import { formatNumber, formatWhen } from "../../lib/format.js";
import { colors, radius, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Button, Card, Loading, Message, Screen } from "../../components/ui.js";

const METRIC_NAMES = {
    traffic_drop: "Traffic drop",
    consent_rate_below: "Consent rate",
    zero_conversions: "Conversions",
    conversion_drop: "Conversion drop",
    engaged_drop: "Engaged users drop",
};

function alertText(alert) {
    if (alert.kind === "ads") return { title: alert.title, body: alert.body };
    const pct = /rate|drop/.test(alert.metric);
    const fmt = (n) => (n == null ? "—" : `${formatNumber(n, { maximumFractionDigits: 1 })}${pct ? " %" : ""}`);
    return {
        title: alert.label || t(METRIC_NAMES[alert.metric] || alert.metric),
        body: t("Now {value} — your alert is set at {threshold}.", { value: fmt(alert.value), threshold: fmt(alert.threshold) }),
    };
}

// What the push switch shows: on | off | denied | setup | simulator
function usePushState(session) {
    const [state, setState] = useState("loading");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let alive = true;
        Promise.all([storedPushToken(), pushPermission().catch(() => "undetermined")]).then(([token, permission]) => {
            if (!alive) return;
            setState(token && permission === "granted" ? "on" : permission === "denied" ? "denied" : "off");
        });
        return () => { alive = false; };
    }, []);
    const toggle = async (next) => {
        setBusy(true);
        try {
            if (next) { await enablePush(session); setState("on"); }
            else { await disablePush(session); setState("off"); }
        } catch (error) {
            setState(error instanceof PushUnavailable ? error.reason : "off");
        } finally {
            setBusy(false);
        }
    };
    return { state, busy, toggle };
}

const PUSH_HINTS = {
    on: "Alerts arrive on this phone as soon as they fire.",
    off: "Get your alerts as notifications on this phone.",
    denied: "Notifications are turned off for Intastellar Analytics in your phone's settings.",
    setup: "Push notifications need the installed app — they don't work in Expo Go.",
    simulator: "Push notifications only work on a real phone.",
};

export default function Alerts() {
    const openWeb = useOpenWeb();
    const { session, organisationId } = useSession();
    const push = usePushState(session);
    const alerts = useRequest(() => fetchAlerts(session), `${organisationId}`, { enabled: !!session });

    return (
        <Screen title={t("Alerts")} refreshing={alerts.refreshing} onRefresh={alerts.refresh}>
            <Card>
                <View style={styles.pushRow}>
                    <View style={styles.pushIcon}><Feather name="bell" size={18} color={colors.accentStrong} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.pushTitle}>{t("Push notifications")}</Text>
                        <Text style={styles.pushHint}>{t(PUSH_HINTS[push.state] || PUSH_HINTS.off)}</Text>
                    </View>
                    <Switch
                        accessibilityLabel={t("Push notifications")}
                        value={push.state === "on"}
                        disabled={push.busy || push.state === "loading" || push.state === "simulator" || push.state === "setup"}
                        onValueChange={push.state === "denied" ? () => Linking.openSettings() : push.toggle}
                        trackColor={{ true: colors.accent, false: colors.bgSunken }}
                        thumbColor={colors.textPrimary}
                    />
                </View>
                {push.state === "denied" ? <Button label={t("Open settings")} variant="secondary" onPress={() => Linking.openSettings()} /> : null}
            </Card>

            {alerts.loading && !alerts.data ? <Loading /> : alerts.error ? (
                <Message tone="error" title={t("This section failed to load")} action={t("Try again")} onAction={alerts.retry} />
            ) : !alerts.data?.length ? (
                <Message title={t("No alerts in the last 30 days")} body={t("Alert rules are set on the web dashboard.")}
                    action={t("Set up alerts")} onAction={() => openWeb("/analytics/alerts")} />
            ) : (
                <Card style={{ gap: 0, paddingVertical: space[1] }}>
                    {alerts.data.map((alert, i) => {
                        const { title, body } = alertText(alert);
                        return (
                            <View key={alert.id} style={[styles.alert, i > 0 && styles.divider]} accessible>
                                <View style={[styles.kind, alert.kind === "ads" ? styles.kindAds : styles.kindAnalytics]}>
                                    <Feather name={alert.kind === "ads" ? "dollar-sign" : "bar-chart-2"} size={16} color={colors.textPrimary} />
                                </View>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <View style={styles.alertHead}>
                                        <Text style={styles.alertTitle} numberOfLines={2}>{title}</Text>
                                        <Text style={styles.when}>{formatWhen(alert.at)}</Text>
                                    </View>
                                    {body ? <Text style={styles.alertBody}>{body}</Text> : null}
                                    <Text style={styles.domain}>{alert.domain}</Text>
                                </View>
                            </View>
                        );
                    })}
                </Card>
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    pushRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
    pushIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(192,159,83,0.14)" },
    pushTitle: { color: colors.textPrimary, fontSize: text.base, fontWeight: "600" },
    pushHint: { color: colors.textMuted, fontSize: text.xs, lineHeight: 17 },
    alert: { flexDirection: "row", gap: space[3], paddingVertical: space[3] },
    divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
    kind: { width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    kindAnalytics: { backgroundColor: "rgba(109,187,139,0.22)" },
    kindAds: { backgroundColor: "rgba(127,140,240,0.22)" },
    alertHead: { flexDirection: "row", justifyContent: "space-between", gap: space[2] },
    alertTitle: { flex: 1, color: colors.textPrimary, fontSize: text.sm, fontWeight: "600" },
    when: { color: colors.textMuted, fontSize: text.xs },
    alertBody: { color: colors.textSecondary, fontSize: text.sm, lineHeight: 19 },
    domain: { color: colors.textMuted, fontSize: text.xs, fontFamily: "Menlo" },
});
