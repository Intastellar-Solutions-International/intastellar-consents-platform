// Covers the app with a lock screen when the app lock is on: at launch, and
// when the app comes back after RELOCK_AFTER_MS in the background.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, StyleSheet, Text, View } from "react-native";
import { lockEnabled, RELOCK_AFTER_MS, unlock } from "../lib/lock.js";
import { colors, space, text } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { Button } from "./ui.js";

export default function LockGate({ active, children }) {
    const [locked, setLocked] = useState(false);
    const backgroundAt = useRef(null);

    const tryUnlock = useCallback(async () => {
        if (await unlock().catch(() => false)) setLocked(false);
    }, []);

    // At launch (once signed in).
    useEffect(() => {
        if (!active) return;
        lockEnabled().then((on) => { if (on) setLocked(true); });
    }, [active]);

    useEffect(() => {
        if (!active) return undefined;
        const sub = AppState.addEventListener("change", async (state) => {
            if (state === "background") backgroundAt.current = Date.now();
            if (state === "active" && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS && await lockEnabled()) setLocked(true);
        });
        return () => sub.remove();
    }, [active]);

    // Ask straight away when the lock screen appears.
    useEffect(() => {
        if (!locked) return;
        unlock().then((ok) => { if (ok) setLocked(false); }).catch(() => {});
    }, [locked]);

    return (
        <View style={{ flex: 1 }}>
            {children}
            {locked && (
                <View style={styles.cover} accessibilityViewIsModal>
                    <Image source={require("../../assets/logo-mark.png")} style={styles.mark} resizeMode="contain" accessibilityIgnoresInvertColors />
                    <Text style={styles.title}>{t("Intastellar Analytics is locked")}</Text>
                    <Button label={t("Unlock")} onPress={tryUnlock} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    cover: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bgBase, alignItems: "center", justifyContent: "center", gap: space[5], padding: space[6] },
    mark: { width: 160, height: 61 },
    title: { color: colors.textPrimary, fontSize: text.lg, fontWeight: "600", textAlign: "center" },
});
