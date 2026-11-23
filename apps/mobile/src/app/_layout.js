import { useEffect } from "react";
import { Stack } from "expo-router";
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
