// Optional app lock with Face ID / fingerprint (falls back to the phone's
// passcode). The preference is per device.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { t } from "./i18n.js";

const KEY = "ia_app_lock";
export const RELOCK_AFTER_MS = 60 * 1000; // back after more than a minute away → lock

export async function lockEnabled() {
    return (await AsyncStorage.getItem(KEY).catch(() => null)) === "on";
}

/** Whether this phone can lock: biometrics set up (or at least a passcode). */
export async function canLock() {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    return hardware && enrolled;
}

export async function unlock() {
    const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("Unlock Intastellar Analytics"),
        cancelLabel: t("Cancel"),
    });
    return result.success;
}

/** Turning the lock on needs one successful unlock, so nobody locks themselves out. */
export async function setLockEnabled(on) {
    if (on && !(await unlock())) return false;
    await AsyncStorage.setItem(KEY, on ? "on" : "off");
    return true;
}
