import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchLive } from "../../lib/api.js";
import { formatNumber, formatRelative } from "../../lib/format.js";
import { useOpenWeb } from "../../lib/web.js";
import { colors, radius, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Card, Message, Screen, SourceLine, styles as ui } from "../../components/ui.js";
import { SkeletonCard } from "../../components/Skeleton.js";
import Bars from "../../components/Bars.js";
import BarList from "../../components/BarList.js";
import ScopeBar from "../../components/ScopeBar.js";
import DomainGate from "../../components/DomainGate.js";

const POLL_MS = 30000;
const DEVICE_ICONS = { mobile: "smartphone", tablet: "tablet", desktop: "monitor" };

function LiveDot() {
    const [pulse] = useState(() => new Animated.Value(0));
    useEffect(() => {
        const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }));
        loop.start();
        return () => loop.stop();
    }, [pulse]);
    return (
        <View style={styles.dotWrap} accessibilityElementsHidden>
            <Animated.View style={[styles.dotRing, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} />
            <View style={styles.dot} />
        </View>
    );
}

/** Counts smoothly from the previous value to the new one. */
function useAnimatedNumber(target, duration = 600) {
    const [shown, setShown] = useState(target);
    const from = useRef(target);
    useEffect(() => {
        if (target == null) return undefined;
        const start = Date.now(), begin = from.current ?? target;
        let frame;
        const step = () => {
            const p = Math.min(1, (Date.now() - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setShown(Math.round(begin + (target - begin) * eased));
            if (p < 1) frame = requestAnimationFrame(step); else from.current = target;
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [target, duration]);
    return shown;
}

export default function Live() {
    const openWeb = useOpenWeb();
    const { session, organisationId, domain } = useSession();
    const live = useRequest(() => fetchLive(session, domain), `${organisationId}|${domain}`, { enabled: !!domain, intervalMs: POLL_MS });
    const d = live.data;
    const users = useAnimatedNumber(d?.sessions ?? null);
    const countries = (d?.countries || []).filter((c) => c.events > 0).sort((a, b) => b.events - a.events).slice(0, 5)
        .map((c) => ({ key: c.code, label: c.code, value: c.events, display: formatNumber(c.events) }));
    const recent = (d?.recent || []).slice(0, 12);

    return (
        <Screen title={t("Live")} header={<ScopeBar showPeriod={false} />} refreshing={live.refreshing} onRefresh={domain ? live.refresh : undefined}>
            <DomainGate>
                {live.loading && !d ? <><SkeletonCard lines={2} chart /><SkeletonCard lines={4} /></> : live.error && !d ? (
                    <Message tone="error" title={t("This section failed to load")} action={t("Try again")} onAction={live.retry} />
                ) : d?.noSiteKey ? (
                    <Message title={t("Analytics isn't turned on for {domain} yet", { domain })} action={t("Set up Analytics")} onAction={() => openWeb("/analytics/getting-started")} />
                ) : d ? (
                    <>
                        <Card>
                            <View style={styles.liveHead}>
                                <LiveDot />
                                <Text style={styles.liveLabel}>{t("Active users in last 30 minutes")}</Text>
                            </View>
                            <Text style={styles.hero} accessibilityLabel={`${formatNumber(d.sessions)}`}>{formatNumber(users)}</Text>
                            {d.minimal > 0 ? (
                                <Text style={ui.muted}>
                                    {d.minimal === 1
                                        ? t("+ 1 event from visitors without full consent (not counted as users)")
                                        : t("+ {count} events from visitors without full consent (not counted as users)", { count: formatNumber(d.minimal) })}
                                </Text>
                            ) : null}
                            <Bars values={d.perMinute} />
                        </Card>

                        <Card title={t("Recent activity")}>
                            {recent.length ? recent.map((r, i) => (
                                <View key={`${r.at}-${i}`} style={[styles.event, i > 0 && styles.divider]}>
                                    <Feather name={DEVICE_ICONS[r.device] || "globe"} size={16} color={colors.textMuted} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.path} numberOfLines={1}>{r.eventName || r.path || "/"}</Text>
                                        <Text style={styles.meta}>{[r.country, formatRelative(new Date(r.at).getTime())].filter(Boolean).join(" · ")}</Text>
                                    </View>
                                    <View style={[styles.consent, { backgroundColor: r.level === "full" ? colors.success : colors.textMuted }]}
                                        accessibilityLabel={r.level === "full" ? t("With consent") : t("No consent (minimal)")} />
                                </View>
                            )) : <Text style={ui.muted}>{t("No visitors right now")}</Text>}
                        </Card>

                        {countries.length > 0 && <Card title={t("Countries")}><BarList rows={countries} mono /></Card>}

                        <SourceLine parts={[t("Suspected bots excluded"), live.fetchedAt ? t("Updated {time}", { time: formatRelative(live.fetchedAt) }) : null]} />
                    </>
                ) : null}
            </DomainGate>
        </Screen>
    );
}

const styles = StyleSheet.create({
    liveHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
    liveLabel: { color: colors.textSecondary, fontSize: text.sm },
    dotWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
    dotRing: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
    hero: { color: colors.textPrimary, fontSize: 56, fontWeight: "300", fontVariant: ["tabular-nums"], letterSpacing: -1 },
    event: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2] },
    divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
    path: { color: colors.textPrimary, fontSize: text.sm, fontFamily: "Menlo" },
    meta: { color: colors.textMuted, fontSize: text.xs, marginTop: 2 },
    consent: { width: 8, height: 8, borderRadius: radius.sm },
});
