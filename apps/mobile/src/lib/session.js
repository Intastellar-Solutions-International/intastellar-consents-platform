// Who is signed in, which organisation and domain they're looking at, and
// the selected period — shared by every tab, kept across app restarts.
//
// Sign-in goes through the Intastellar Accounts SDK (auth session →
// redirect to LOGIN_URI with ?token=…&refresh_token=…). Tokens live in
// secure storage (tokenStore.js): the one-hour access token is refreshed
// silently, so people stay signed in. Only when the refresh token is gone
// or refused do they see "Welcome back" — with their account, organisation
// and domain kept for a one-tap return.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIntastellarRN } from "@intastellar/signin-sdk-react-native";
import { APP_NAME, CLIENT_ID, LOGIN_URI } from "./config.js";
import { disablePush, refreshPushRegistration } from "./push.js";
import { tokenExpired } from "./token.js";
import { clearTokens, loadTokens, onTokenChange, refreshNow, saveTokens } from "./tokenStore.js";
import { fetchAnalyticsDomains, fetchDomains, fetchOrganisations, setOnSessionExpired, verifyAccountToken } from "./api.js";

const STATE_KEY = "ia_session";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
    // "loading" until storage is read; then "signedOut" | "signedIn"
    const [status, setStatus] = useState("loading");
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);             // signed in — or, signed out, who to welcome back
    const [organisations, setOrganisations] = useState([]);
    const [organisationId, setOrganisationId] = useState(null);
    const [domains, setDomains] = useState([]);          // domains with Analytics
    const [allDomainCount, setAllDomainCount] = useState(0); // every domain of the organisation
    const [domainsState, setDomainsState] = useState("idle"); // idle | loading | ready | error
    const [domain, setDomain] = useState(null);
    const [days, setDays] = useState(30);
    const [signInError, setSignInError] = useState(null);
    const [signingIn, setSigningIn] = useState(false);

    const applySaved = (saved) => {
        setUser(saved.user);
        setOrganisations(saved.organisations || []);
        setOrganisationId(saved.organisationId ?? saved.organisations?.[0]?.id ?? null);
        setDomain(saved.domain || null);
        setDays(saved.days || 30);
    };

    // Restore: valid token → in; expired → refresh silently (splash stays up);
    // refresh impossible → "Welcome back" with the saved account.
    useEffect(() => {
        (async () => {
            let saved = null;
            try {
                const [tokens, raw] = await Promise.all([loadTokens(), AsyncStorage.getItem(STATE_KEY)]);
                saved = raw ? JSON.parse(raw) : null;
                if (saved?.user) applySaved(saved);
                let access = tokens.access;
                if (access && tokenExpired(access)) access = await refreshNow();
                if (access && saved?.user) {
                    setToken(access);
                    setStatus("signedIn");
                    return;
                }
            } catch { /* unreadable storage → sign in again */ }
            setStatus("signedOut");
        })();
    }, []);

    // Refreshed tokens flow into the session (and from there into requests).
    useEffect(() => onTokenChange(setToken), []);

    // Persist everything but the tokens (secure storage). Kept while signed
    // out too, so "Welcome back" can return to the same place.
    useEffect(() => {
        if (status !== "signedIn") return;
        AsyncStorage.setItem(STATE_KEY, JSON.stringify({ user, organisations, organisationId, domain, days })).catch(() => {});
    }, [status, user, organisations, organisationId, domain, days]);

    // One sign-in per token: the SDK's auth session and the /auth screen can
    // both see the same redirect.
    const handledToken = useRef(null);
    const previousUser = useRef(null);
    useEffect(() => { previousUser.current = user; }, [user]);
    const completeSignIn = useCallback(async (account) => {
        if (!account?.token || handledToken.current === account.token) return;
        handledToken.current = account.token;
        setSigningIn(true);
        setSignInError(null);
        try {
            const orgs = await fetchOrganisations(account.user?.email);
            await saveTokens(account.token, account.refreshToken ?? null);
            // Whether Accounts sent a refresh token (Checkcookies.php) — never the token itself.
            console.info(`[auth] signed in — refresh token ${account.refreshToken ? "received" : "missing (app will ask again in an hour)"}`);
            // Same account as before ("Welcome back") → keep organisation and domain.
            const sameAccount = previousUser.current?.email && previousUser.current.email === account.user?.email;
            setToken(account.token);
            setUser({ name: account.user?.name, email: account.user?.email, image: account.user?.image });
            setOrganisations(orgs);
            setOrganisationId((current) => (sameAccount && orgs.some((o) => o.id === current) ? current : orgs[0]?.id ?? null));
            if (!sameAccount) setDomain(null);
            setStatus("signedIn");
        } catch (error) {
            handledToken.current = null;
            setSignInError(error?.message || "Sign-in failed.");
        } finally {
            setSigningIn(false);
        }
    }, []);

    // A redirect that launched the app: verify the token ourselves.
    const signInWithToken = useCallback(async (redirectToken, refreshToken) => {
        if (!redirectToken || handledToken.current === redirectToken) return;
        try {
            await completeSignIn({ ...(await verifyAccountToken(redirectToken)), refreshToken });
        } catch (error) {
            setSignInError(error?.message || "Sign-in failed.");
        }
    }, [completeSignIn]);

    // completeSignIn is stable (no dependencies), so the SDK's first-and-only
    // loginCallback can call it through this ref.
    const onLogin = useRef(completeSignIn);
    const sdk = useIntastellarRN({
        appName: APP_NAME,
        clientId: CLIENT_ID,
        loginUri: LOGIN_URI,
        scopes: "profile",
        loginCallback: (account) => onLogin.current(account),
    });

    const resetData = () => {
        setToken(null);
        setDomains([]);
        setDomainsState("idle");
    };

    // The session ran out and couldn't be refreshed: keep the account for
    // "Welcome back", drop the tokens.
    const sessionEnded = useCallback(async () => {
        await clearTokens({ revoke: false });
        resetData();
        setStatus("signedOut");
    }, []);

    // Signing out on purpose: stop alerts to this phone, revoke the refresh
    // token, forget the account.
    const signOut = useCallback(async () => {
        if (token) await disablePush({ token, organisationId });
        await Promise.all([
            clearTokens({ revoke: true }),
            AsyncStorage.removeItem(STATE_KEY).catch(() => {}),
            sdk.logout().catch(() => {}),
        ]);
        resetData();
        setUser(null);
        setOrganisations([]);
        setOrganisationId(null);
        setDomain(null);
        setStatus("signedOut");
    }, [sdk, token, organisationId]);

    /** "Use another account" on the Welcome back screen. */
    const forgetAccount = useCallback(async () => {
        await AsyncStorage.removeItem(STATE_KEY).catch(() => {});
        setUser(null);
        setOrganisations([]);
        setOrganisationId(null);
        setDomain(null);
    }, []);

    useEffect(() => { setOnSessionExpired(() => { sessionEnded(); }); }, [sessionEnded]);

    // email travels as X-User-Email, like the web; the server checks it against the token.
    const email = user?.email || null;
    const session = useMemo(() => (token ? { token, organisationId, email } : null), [token, organisationId, email]);

    // Keep this phone's push registration on the current organisation and language.
    useEffect(() => { if (session) refreshPushRegistration(session); }, [session]);

    // Domains of the active organisation; keep the chosen one if it's still
    // there. "idle" reads as loading until the first answer arrives.
    const fetchDomainList = useCallback(() => {
        if (!session || organisationId == null) return;
        // Only domains with Analytics — this is the Analytics app. If that
        // list can't be loaded, show every domain rather than none.
        Promise.all([fetchDomains(session), fetchAnalyticsDomains(session).catch(() => null)])
            .then(([all, withAnalytics]) => {
                const list = withAnalytics ? all.filter((d) => withAnalytics.has(d.toLowerCase())) : all;
                setAllDomainCount(all.length);
                setDomains(list);
                setDomain((current) => (current && list.includes(current) ? current : list[0] || null));
                setDomainsState("ready");
            })
            .catch(() => setDomainsState("error"));
    }, [session, organisationId]);
    useEffect(() => { fetchDomainList(); }, [fetchDomainList]);
    const reloadDomains = () => { setDomainsState("loading"); fetchDomainList(); };

    const value = {
        status, user, session, signingIn, signInWithToken, forgetAccount,
        returningUser: status === "signedOut" ? user : null,
        signInError: signInError || sdk.error, signIn: () => { setSignInError(null); return sdk.signin(); }, signOut,
        organisations, organisationId, setOrganisationId: (id) => { setOrganisationId(id); setDomain(null); setDomains([]); setDomainsState("loading"); },
        domains, allDomainCount, domainsState, reloadDomains, domain, setDomain,
        days, setDays,
    };
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
    return ctx;
}
