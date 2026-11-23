// System tab bar: on iOS 26 it is Liquid Glass (floating, content scrolls
// underneath); earlier iOS and Android get their native tab bars.
import { NativeTabs } from "expo-router/native-tabs";
import { colors } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";

const TABS = [
    { name: "index", label: "Home", sf: { default: "house", selected: "house.fill" }, md: "home" },
    { name: "live", label: "Live", sf: "waveform.path.ecg", md: "monitoring" },
    { name: "ad-spend", label: "Ad Spend", sf: { default: "creditcard", selected: "creditcard.fill" }, md: "payments" },
    { name: "alerts", label: "Alerts", sf: { default: "bell", selected: "bell.fill" }, md: "notifications" },
    { name: "more", label: "More", sf: { default: "ellipsis.circle", selected: "ellipsis.circle.fill" }, md: "more_horiz" },
];

export default function TabLayout() {
    return (
        <NativeTabs
            tintColor={colors.accentStrong}
            iconColor={{ default: colors.textMuted, selected: colors.accentStrong }}
            labelStyle={{ default: { color: colors.textMuted }, selected: { color: colors.accentStrong } }}
            backgroundColor={colors.bgRaised}
            minimizeBehavior="onScrollDown"
        >
            {TABS.map((tab) => (
                <NativeTabs.Trigger key={tab.name} name={tab.name}>
                    <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
                    <NativeTabs.Trigger.Label>{t(tab.label)}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>
            ))}
        </NativeTabs>
    );
}
