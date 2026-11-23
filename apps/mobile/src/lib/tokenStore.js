// The current access token and its refresh token, kept in secure storage.
// Access tokens live one hour; before one expires (or when an API refuses
// it) the refresh token is traded for a new pair. One refresh at a time:
// tokens rotate, so parallel refreshes would invalidate each other.
import * as SecureStore from "expo-secure-store";
import { refreshAccessToken, revokeRefreshToken } from "@intastellar/signin-sdk-react-native";
import { CLIENT_ID, TOKEN_URL } from "./config.js";
import { tokenExpiresAt } from "./token.js";

const ACCESS_KEY = "ia_token";
const REFRESH_KEY = "ia_refresh_token";
const REFRESH_EARLY_MS = 2 * 60 * 1000;

let access = null;
let refresh = null;
let inflight = null;
const listeners = new Set();

/** Called with the new access token after every refresh (session state). */
export function onTokenChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function loadTokens() {
    [access, refresh] = await Promise.all([SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(REFRESH_KEY)]);
    return { access, refresh };
}

export async function saveTokens(nextAccess, nextRefresh) {
    access = nextAccess;
    if (nextRefresh !== undefined) refresh = nextRefresh;
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
    else await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
}

export async function clearTokens({ revoke = true } = {}) {
    const old = refresh;
    access = null; refresh = null; inflight = null;
    await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {}), SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {})]);
    if (revoke && old) await revokeRefreshToken({ refreshToken: old, clientId: CLIENT_ID, tokenUrl: TOKEN_URL });
}

export const hasRefreshToken = () => !!refresh;

/** Trades the refresh token for new tokens. Resolves the new access token, or null when sign-in is needed. */
export function refreshNow() {
    if (!refresh) return Promise.resolve(null);
    if (!inflight) {
        inflight = refreshAccessToken({ refreshToken: refresh, clientId: CLIENT_ID, tokenUrl: TOKEN_URL })
            .then(async ({ token, refreshToken }) => {
                await saveTokens(token, refreshToken);
                listeners.forEach((fn) => fn(token));
                return token;
            })
            .catch(async (error) => {
                // Only a definite "no" ends the refresh token; network trouble keeps it.
                if (/invalid_grant|invalid_request/.test(String(error?.message))) await clearTokens({ revoke: false });
                return null;
            })
            .finally(() => { inflight = null; });
    }
    return inflight;
}

/** A token good for at least two more minutes (refreshing first if needed), or the current one. */
export async function freshToken() {
    const expiresAt = tokenExpiresAt(access);
    if (refresh && expiresAt != null && expiresAt - Date.now() < REFRESH_EARLY_MS) {
        return (await refreshNow()) || access;
    }
    return access;
}
