import { useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider, useSession } from "../lib/session.js";
import { colors } from "../lib/theme.js";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigation() {
    const { status } = useSession();
    // Keep the splash up until we know whether someone is signed in, so the
    // guards never flash the wrong screen.
    useEffect(() => { if (status !== "loading") SplashScreen.hideAsync().catch(() => {}); }, [status]);

    // Tapping an alert notification opens the Alerts tab — while running, or
    // when the tap launched the app.
    useEffect(() => {
        if (status !== "signedIn") return undefined;
        const open = (response) => {
            if (response?.notification?.request?.content?.data?.type === "alert") router.push("/alerts");
        };
        Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
        const subscription = Notifications.addNotificationResponseReceivedListener(open);
        return () => subscription.remove();
    }, [status]);
    if (status === "loading") return null;
    const signedIn = status === "signedIn";
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBase } }}>
            <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="sign-in" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(tabs)" />
            </Stack.Protected>
            {/* Redirect target for sign-in; reachable in both states. */}
            <Stack.Screen name="auth" />
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <SessionProvider>
            <StatusBar style="light" />
            <Navigation />
        </SessionProvider>
    );
}
