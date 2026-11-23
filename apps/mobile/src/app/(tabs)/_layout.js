import { Tabs } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";

function tabIcon(name) {
    function TabIcon({ color, size }) {
        return <Feather name={name} color={color} size={size} />;
    }
    return TabIcon;
}

export default function TabLayout() {
    return (
        <Tabs
            screenListeners={{ tabPress: () => { Haptics.selectionAsync().catch(() => {}); } }}
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.accentStrong,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarStyle: { backgroundColor: colors.bgRaised, borderTopColor: colors.borderSubtle },
                sceneStyle: { backgroundColor: colors.bgBase },
            }}
        >
            <Tabs.Screen name="index" options={{ title: t("Home"), tabBarIcon: tabIcon("home") }} />
            <Tabs.Screen name="live" options={{ title: t("Live"), tabBarIcon: tabIcon("activity") }} />
            <Tabs.Screen name="ad-spend" options={{ title: t("Ad Spend"), tabBarIcon: tabIcon("dollar-sign") }} />
            <Tabs.Screen name="alerts" options={{ title: t("Alerts"), tabBarIcon: tabIcon("bell") }} />
            <Tabs.Screen name="more" options={{ title: t("More"), tabBarIcon: tabIcon("menu") }} />
        </Tabs>
    );
}
