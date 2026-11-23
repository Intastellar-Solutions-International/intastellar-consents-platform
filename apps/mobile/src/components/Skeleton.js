// Placeholders shaped like the content, pulsing gently while it loads —
// the layout doesn't jump when the numbers arrive.
import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, radius, space } from "../lib/theme.js";

function usePulse() {
    const [value] = useState(() => new Animated.Value(0.45));
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(value, { toValue: 0.9, duration: 700, useNativeDriver: true }),
            Animated.timing(value, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [value]);
    return value;
}

export function Bone({ width = "100%", height = 12, style }) {
    const opacity = usePulse();
    return <Animated.View style={[styles.bone, { width, height, opacity }, style]} />;
}

export function SkeletonKpis() {
    return (
        <View style={styles.grid} accessibilityLabel="Loading" accessible>
            {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.tile}>
                    <Bone width="55%" height={10} />
                    <Bone width="70%" height={26} />
                    <Bone width="35%" height={10} />
                </View>
            ))}
        </View>
    );
}

export function SkeletonCard({ lines = 3, chart = false }) {
    return (
        <View style={styles.card}>
            <Bone width="40%" height={14} />
            {chart ? <Bone height={140} style={{ borderRadius: radius.md }} /> : null}
            {Array.from({ length: lines }, (_, i) => <Bone key={i} width={`${85 - i * 12}%`} />)}
        </View>
    );
}

const styles = StyleSheet.create({
    bone: { backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 6 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
    tile: { flexBasis: "47%", flexGrow: 1, gap: space[2], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.borderSubtle },
    card: { gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.borderSubtle },
});
