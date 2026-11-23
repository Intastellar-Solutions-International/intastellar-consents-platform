// Where Intastellar Accounts' redirect (…/auth?token=…) lands.
// - Token in the link: finish the sign-in here. When the redirect launched
//   the app, the SDK's link listener wasn't running yet and never sees it.
// - No token (e.g. Expo Go reopening the last link): go to sign-in instead
//   of waiting for a sign-in that never started.
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useSession } from "../lib/session.js";
import { Button } from "../components/ui.js";
import { colors, space, text } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

export default function AuthRedirect() {
    const { token } = useLocalSearchParams();
    const { status, signInError, signIn, signInWithToken } = useSession();
    const value = Array.isArray(token) ? token[0] : token;

    useEffect(() => {
        if (value && status === "signedOut") signInWithToken(value);
    }, [value, status, signInWithToken]);

    if (status === "signedIn") return <Redirect href="/" />;
    if (!value) return <Redirect href="/sign-in" />;
    if (signInError) {
        return (
            <View style={styles.wrap}>
                <Text style={styles.error}>{t("Sign-in didn't work. Please try again.")}</Text>
                <Button label={t("Sign in with Intastellar")} onPress={signIn} />
            </View>
        );
    }
    return (
        <View style={styles.wrap} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.textMuted} />
            <Text style={styles.text}>{t("Signing in…")}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bgBase, alignItems: "center", justifyContent: "center", gap: space[4], padding: space[6] },
    text: { color: colors.textSecondary, fontSize: text.base },
    error: { color: colors.dangerText, fontSize: text.base, textAlign: "center" },
});
