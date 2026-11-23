import { useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import { WEB_APP } from "./config.js";
import { colors } from "./theme.js";
import { createHandoff } from "./api.js";
import { useSession } from "./session.js";

const browserOptions = { controlsColor: colors.accent, toolbarColor: colors.bgRaised };

/**
 * Opens a page of the web dashboard (or a full URL) in the in-app browser.
 * Dashboard pages open signed in as the app's account: the app gets a
 * one-time code and the web's /app-handoff page redeems it. If that fails,
 * the page opens normally (the web asks to sign in once).
 */
export async function openWeb(path = "/", { session, user } = {}) {
    if (/^https?:\/\//.test(path)) return WebBrowser.openBrowserAsync(path, browserOptions).catch(() => {});
    let url = `${WEB_APP}${path}`;
    if (session) {
        try {
            const code = await createHandoff(session, user);
            url = `${WEB_APP}/app-handoff?code=${encodeURIComponent(code)}&to=${encodeURIComponent(path)}`;
        } catch { /* open without hand-over */ }
    }
    return WebBrowser.openBrowserAsync(url, browserOptions).catch(() => {});
}

/** openWeb bound to the signed-in session. */
export function useOpenWeb() {
    const { session, user } = useSession();
    return useCallback((path) => openWeb(path, { session, user }), [session, user]);
}
