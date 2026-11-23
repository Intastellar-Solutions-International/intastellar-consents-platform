// iOS 26 Liquid Glass for surfaces that float above content (top bar
// capsules). Real glass only when the system has it, the API is present
// (some iOS 26 betas crash without it) and "Reduce transparency" is off —
// otherwise the same shape, solid, as before.
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { colors } from "../lib/theme.js";

const systemGlass = (() => {
    try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

export function useLiquidGlass() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (!systemGlass) return undefined;
        AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced).catch(() => {});
        const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduced);
        return () => sub.remove();
    }, []);
    return systemGlass && !reduced;
}

/** A glass surface; `style` sets shape/size, the fallback adds the solid look. */
export default function Glass({ style, interactive = false, children, ...rest }) {
    const glass = useLiquidGlass();
    if (!glass) {
        return <View style={[{ backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.borderSubtle }, style]} {...rest}>{children}</View>;
    }
    return (
        <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} style={[{ overflow: "hidden" }, style]} {...rest}>
            {children}
        </GlassView>
    );
}
