// Push alerts: ask permission, get this phone's Expo push token, register it
// with /api/mobile-push. A registered phone receives every alert that fires
// for its organisation (api/_mobile-push.js).
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { SCANNER_HOST } from "./config.js";
import { language } from "./i18n.js";
import { colors } from "./theme.js";

const TOKEN_KEY = "ia_push_token";

// Alerts show as a banner while the app is open, too.
Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Why push can't be turned on: "simulator" | "denied" | "setup" (no EAS project / Expo Go) */
export class PushUnavailable extends Error {
    constructor(reason) { super(reason); this.reason = reason; }
}

async function call(session, body) {
    const res = await fetch(`${SCANNER_HOST}/api/mobile-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}`, Organisation: String(session.organisationId ?? ""), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Request failed (${res.status})`);
}

/** The token this phone registered, or null when push is off. */
export async function storedPushToken() {
    return AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
}

/** Permission state without asking: "granted" | "undetermined" | "denied". */
export async function pushPermission() {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
}

/** Turns push on for this phone. Throws PushUnavailable with a reason. */
export async function enablePush(session) {
    if (!Device.isDevice) throw new PushUnavailable("simulator");
    if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("alerts", {
            name: "Alerts",
            importance: AndroidImportance.HIGH,
            lightColor: colors.accent,
        });
    }
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") throw new PushUnavailable("denied");

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) throw new PushUnavailable("setup");
    let token;
    try {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
        throw new PushUnavailable("setup"); // e.g. Expo Go, which has no remote push
    }
    await call(session, { action: "register", token, platform: Platform.OS, language });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
}

/** Turns push off for this phone (also on sign-out). Never throws. */
export async function disablePush(session) {
    const token = await storedPushToken();
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    if (token && session) await call(session, { action: "unregister", token }).catch(() => {});
}

/** Re-registers on launch so the organisation and language stay current. */
export async function refreshPushRegistration(session) {
    const token = await storedPushToken();
    if (!token || !session) return;
    await call(session, { action: "register", token, platform: Platform.OS, language }).catch(() => {});
}
