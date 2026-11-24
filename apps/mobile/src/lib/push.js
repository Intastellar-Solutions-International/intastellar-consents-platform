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
import { freshToken } from "./tokenStore.js";
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

/** A refused request: `status` (HTTP) and Expo's `code` when it refused a push. */
export class PushRequestError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

async function call(session, body) {
    const res = await fetch(`${SCANNER_HOST}/api/mobile-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${(await freshToken()) || session.token}`, Organisation: String(session.organisationId ?? ""), ...(session.email ? { "X-User-Email": session.email } : {}), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new PushRequestError(err?.error || `Request failed (${res.status})`, res.status, err?.code);
    }
}

/** Sends one test notification to this phone (server allows one per 30 s). */
export async function sendTestPush(session) {
    const token = await storedPushToken();
    if (!token) throw new PushRequestError("Push is off", 404);
    await call(session, { action: "test", token });
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
