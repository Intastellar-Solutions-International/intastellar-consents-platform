import * as WebBrowser from "expo-web-browser";
import { WEB_APP } from "./config.js";
import { colors } from "./theme.js";

/** Opens a page of the web dashboard (or a full URL) in the in-app browser. */
export function openWeb(path = "/") {
    const url = /^https?:\/\//.test(path) ? path : `${WEB_APP}${path}`;
    return WebBrowser.openBrowserAsync(url, { controlsColor: colors.accent, toolbarColor: colors.bgRaised }).catch(() => {});
}
