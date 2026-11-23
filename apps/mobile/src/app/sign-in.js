import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../lib/session.js";
import { Button } from "../components/ui.js";
import { colors, space, text } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

export default function SignIn() {
    const { signIn, signingIn, signInError } = useSession();
    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.body}>
                <Image source={require("../../assets/icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
                <Text style={styles.title} accessibilityRole="header">Intastellar Analytics</Text>
                <Text style={styles.lede}>{t("Consent-aware traffic, ad spend and conversions from the same code — no second install.")}</Text>
            </View>
            <View style={styles.actions}>
                {signInError ? <Text style={styles.error} accessibilityLiveRegion="polite">{t("Sign-in didn't work. Please try again.")}</Text> : null}
                <Button label={t("Sign in with Intastellar")} onPress={signIn} loading={signingIn} />
                <Text style={styles.note}>{t("Use the account you use on the web dashboard.")}</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgBase, padding: space[6], justifyContent: "space-between" },
    body: { flex: 1, justifyContent: "center", gap: space[3] },
    logo: { width: 64, height: 64, borderRadius: 14, marginBottom: space[2] },
    title: { color: colors.textPrimary, fontSize: text.xxl, fontWeight: "600" },
    lede: { color: colors.textSecondary, fontSize: text.base, lineHeight: 22 },
    actions: { gap: space[3] },
    error: { color: colors.dangerText, fontSize: text.sm },
    note: { color: colors.textMuted, fontSize: text.xs, textAlign: "center" },
});
