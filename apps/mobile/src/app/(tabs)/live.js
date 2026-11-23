import { StyleSheet, Text, View } from "react-native";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchLive } from "../../lib/api.js";
import { formatNumber, formatRelative } from "../../lib/format.js";
import { useOpenWeb } from "../../lib/web.js";
import { colors, radius, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Card, Loading, Message, Screen, SourceLine, styles as ui } from "../../components/ui.js";
import Bars from "../../components/Bars.js";
import ScopeBar from "../../components/ScopeBar.js";
import DomainGate from "../../components/DomainGate.js";

const POLL_MS = 30000;

export default function Live() {
    const openWeb = useOpenWeb();
    const { session, organisationId, domain } = useSession();
    const live = useRequest(() => fetchLive(session, domain), `${organisationId}|${domain}`, { enabled: !!domain, intervalMs: POLL_MS });
    const d = live.data;
    const countries = (d?.countries || []).filter((c) => c.events > 0).sort((a, b) => b.events - a.events).slice(0, 5);
    const maxEvents = Math.max(...countries.map((c) => c.events), 1);

    return (
        <Screen title={t("Live")} header={<ScopeBar showPeriod={false} />} refreshing={live.refreshing} onRefresh={domain ? live.refresh : undefined}>
            <DomainGate>
                {live.loading && !d ? <Loading /> : live.error && !d ? (
                    <Message tone="error" title={t("This section failed to load")} action={t("Try again")} onAction={live.retry} />
                ) : d?.noSiteKey ? (
                    <Message title={t("Analytics isn't turned on for {domain} yet", { domain })} action={t("Set up Analytics")} onAction={() => openWeb("/analytics/getting-started")} />
                ) : d ? (
                    <>
                        <Card>
                            <Text style={ui.muted}>{t("Active users in last 30 minutes")}</Text>
                            <Text style={styles.hero}>{formatNumber(d.sessions)}</Text>
                            {d.minimal > 0 ? (
                                <Text style={ui.muted}>
                                    {d.minimal === 1
                                        ? t("+ 1 event from visitors without full consent (not counted as users)")
                                        : t("+ {count} events from visitors without full consent (not counted as users)", { count: formatNumber(d.minimal) })}
                                </Text>
                            ) : null}
                            <Bars values={d.perMinute} />
                        </Card>
                        <Card title={t("Countries")}>
                            {countries.length ? countries.map((c) => (
                                <View key={c.code} style={styles.row} accessible accessibilityLabel={t("{events} events · {users} active users", { events: c.events, users: c.activeUsers })}>
                                    <Text style={styles.code}>{c.code}</Text>
                                    <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(4, (c.events / maxEvents) * 100)}%` }]} /></View>
                                    <Text style={styles.count}>{formatNumber(c.events)}</Text>
                                </View>
                            )) : <Text style={ui.muted}>{t("No visitors right now")}</Text>}
                        </Card>
                        <SourceLine parts={[t("Suspected bots excluded"), live.fetchedAt ? t("Updated {time}", { time: formatRelative(live.fetchedAt) }) : null]} />
                    </>
                ) : null}
            </DomainGate>
        </Screen>
    );
}

const styles = StyleSheet.create({
    hero: { color: colors.textPrimary, fontSize: 48, fontWeight: "300", fontVariant: ["tabular-nums"] },
    row: { flexDirection: "row", alignItems: "center", gap: space[3] },
    code: { width: 28, color: colors.textSecondary, fontSize: text.sm, fontFamily: "Menlo" },
    track: { flex: 1, height: 8, borderRadius: radius.sm, backgroundColor: colors.bgSunken, overflow: "hidden" },
    fill: { height: "100%", backgroundColor: colors.data, borderRadius: radius.sm },
    count: { minWidth: 44, textAlign: "right", color: colors.textPrimary, fontSize: text.sm, fontVariant: ["tabular-nums"] },
});
