// Sign-in, app-style: brand mark on a soft gold glow, the product's three
// selling points, one big button pinned to the bottom. Copy comes from the
// web login (src/Login/loginTranslations.js) so both say the same thing in
// every language.
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Feather from "@expo/vector-icons/Feather";
import { TRANSLATIONS } from "../../../../src/Login/loginTranslations.js";
import { useSession } from "../lib/session.js";
import { openWeb } from "../lib/web.js";
import { language, t } from "../lib/i18n.js";
import { colors, radius, space, text } from "../lib/theme.js";

const L = { ...TRANSLATIONS.en, ...(TRANSLATIONS[language] || {}) };
const POINT_ICONS = ["shield", "trending-up", "mouse-pointer"];

/** Fades and lifts children in, `delay` ms after mount. */
function Rise({ delay = 0, children, style }) {
    const [progress] = useState(() => new Animated.Value(0));
    useEffect(() => {
        Animated.timing(progress, { toValue: 1, duration: 520, delay, useNativeDriver: true }).start();
    }, [progress, delay]);
    const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
    return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

function Glow() {
    const { width, height } = useWindowDimensions();
    return (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
                <RadialGradient id="glow" cx="50%" cy="24%" rx="70%" ry="38%">
                    <Stop offset="0" stopColor={colors.accent} stopOpacity="0.26" />
                    <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
                </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={width} height={height} fill="url(#glow)" />
        </Svg>
    );
}

export default function SignIn() {
    const { signIn, signingIn, signInError } = useSession();
    const [browserOpen, setBrowserOpen] = useState(false);
    const busy = browserOpen || signingIn;

    const start = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setBrowserOpen(true);
        try { await signIn(); } finally { setBrowserOpen(false); }
    };

    const errorText = !signInError ? null
        : /organisation/i.test(signInError) ? L.lookupFailed : t("Sign-in didn't work. Please try again.");

    return (
        <View style={styles.root}>
            <Glow />
            <SafeAreaView style={styles.safe}>
                <View style={styles.hero}>
                    <Rise>
                        <Image source={require("../../assets/logo-mark.png")} style={styles.mark} resizeMode="contain" accessibilityLabel="Intastellar" />
                    </Rise>
                    <Rise delay={90} style={styles.heading}>
                        <Text style={styles.title} accessibilityRole="header">Intastellar Analytics</Text>
                        <Text style={styles.lede}>{L.ledeNew}</Text>
                    </Rise>
                </View>

                <View style={styles.points} accessibilityLabel={L.pointsLabel_analytics}>
                    {(L.points_analytics || []).map((point, i) => (
                        <Rise key={point.title} delay={200 + i * 80} style={styles.point}>
                            <View style={styles.pointIcon}><Feather name={POINT_ICONS[i] || "check"} size={18} color={colors.accentStrong} /></View>
                            <View style={styles.pointText}>
                                <Text style={styles.pointTitle}>{point.title}</Text>
                                <Text style={styles.pointBody}>{point.text}</Text>
                            </View>
                        </Rise>
                    ))}
                </View>

                <Rise delay={460} style={styles.actions}>
                    {errorText ? <Text style={styles.error} accessibilityLiveRegion="polite">{errorText}</Text> : null}
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ busy }}
                        onPress={start}
                        disabled={busy}
                        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, busy && styles.buttonBusy]}
                    >
                        {busy ? (
                            <View style={styles.buttonRow}>
                                <ActivityIndicator color={colors.textInverse} />
                                <Text style={styles.buttonLabel}>{L.signingIn}</Text>
                            </View>
                        ) : (
                            <Text style={styles.buttonLabel}>{L.signInWith}</Text>
                        )}
                    </Pressable>
                    <Text style={styles.hint}>{t("Your password stays with Intastellar Accounts; the app only receives your basic profile.")}</Text>
                    <Text style={styles.signup}>
                        {L.newHere_analytics}{" "}
                        <Text style={styles.link} accessibilityRole="link" onPress={() => openWeb("https://intastellar.eu/#get-started")}>{L.createAccount}</Text>
                    </Text>
                    <View style={styles.legal}>
                        <Text style={styles.legalLink} accessibilityRole="link" onPress={() => openWeb("https://intastellar.eu/legal/privacy")}>{L.privacy}</Text>
                        <Text style={styles.legalDot}>·</Text>
                        <Text style={styles.legalLink} accessibilityRole="link" onPress={() => openWeb("https://intastellar.eu/legal/terms")}>{L.terms}</Text>
                    </View>
                </Rise>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgBase },
    safe: { flex: 1, paddingHorizontal: space[6] },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[5], paddingTop: space[6] },
    mark: { width: 220, height: 84 },
    heading: { alignItems: "center", gap: space[2] },
    title: { color: colors.textPrimary, fontSize: 30, fontWeight: "600", letterSpacing: -0.4, textAlign: "center" },
    lede: { color: colors.textSecondary, fontSize: text.base, textAlign: "center" },
    points: { gap: space[3], paddingVertical: space[4] },
    point: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: "rgba(63,63,63,0.72)", borderWidth: 1, borderColor: colors.borderSubtle },
    pointIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(192,159,83,0.14)" },
    pointText: { flex: 1, gap: 2 },
    pointTitle: { color: colors.textPrimary, fontSize: text.sm, fontWeight: "600" },
    pointBody: { color: colors.textMuted, fontSize: text.xs, lineHeight: 17 },
    actions: { gap: space[3], paddingTop: space[2], paddingBottom: space[4] },
    error: { color: colors.dangerText, fontSize: text.sm, textAlign: "center" },
    button: { height: 54, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    buttonPressed: { transform: [{ scale: 0.98 }], backgroundColor: colors.accentStrong },
    buttonBusy: { opacity: 0.85 },
    buttonRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
    buttonLabel: { color: colors.textInverse, fontSize: text.base, fontWeight: "700" },
    hint: { color: colors.textMuted, fontSize: text.xs, textAlign: "center", lineHeight: 17 },
    signup: { color: colors.textSecondary, fontSize: text.sm, textAlign: "center" },
    link: { color: colors.accentStrong, fontWeight: "600" },
    legal: { flexDirection: "row", justifyContent: "center", gap: space[2] },
    legalLink: { color: colors.textMuted, fontSize: text.xs },
    legalDot: { color: colors.textMuted, fontSize: text.xs },
});
