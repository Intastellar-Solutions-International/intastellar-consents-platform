// Who is signed in, which organisation and domain they're looking at, and
// the selected period — shared by every tab, kept across app restarts.
//
// Sign-in goes through the Intastellar Accounts SDK (in-app browser →
// redirect to LOGIN_URI with ?token=…). The token is kept in the device's
// secure storage (Keychain / Keystore); the rest in AsyncStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { useIntastellarRN } from "@intastellar/signin-sdk-react-native";
import { APP_NAME, CLIENT_ID, LOGIN_URI } from "./config.js";
import { fetchDomains, fetchOrganisations, setOnSessionExpired, verifyAccountToken } from "./api.js";

const TOKEN_KEY = "ia_token";
const STATE_KEY = "ia_session";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
    // "loading" until storage is read; then "signedOut" | "signedIn"
    const [status, setStatus] = useState("loading");
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [organisations, setOrganisations] = useState([]);
    const [organisationId, setOrganisationId] = useState(null);
    const [domains, setDomains] = useState([]);
    const [domainsState, setDomainsState] = useState("idle"); // idle | loading | ready | error
    const [domain, setDomain] = useState(null);
    const [days, setDays] = useState(30);
    const [signInError, setSignInError] = useState(null);
    const [signingIn, setSigningIn] = useState(false);

    // Restore a previous session.
    useEffect(() => {
        (async () => {
            try {
                const [savedToken, raw] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), AsyncStorage.getItem(STATE_KEY)]);
                const saved = raw ? JSON.parse(raw) : null;
                if (savedToken && saved?.user) {
                    setToken(savedToken);
                    setUser(saved.user);
                    setOrganisations(saved.organisations || []);
                    setOrganisationId(saved.organisationId ?? saved.organisations?.[0]?.id ?? null);
                    setDomain(saved.domain || null);
                    setDays(saved.days || 30);
                    setStatus("signedIn");
                    return;
                }
            } catch { /* unreadable storage → sign in again */ }
            setStatus("signedOut");
        })();
    }, []);

    // Persist everything but the token (that lives in secure storage).
    useEffect(() => {
        if (status !== "signedIn") return;
        AsyncStorage.setItem(STATE_KEY, JSON.stringify({ user, organisations, organisationId, domain, days })).catch(() => {});
    }, [status, user, organisations, organisationId, domain, days]);

    // One sign-in per token: the SDK's link listener and the /auth screen
    // can both see the same redirect.
    const handledToken = useRef(null);
    const completeSignIn = useCallback(async (account) => {
        if (!account?.token || handledToken.current === account.token) return;
        handledToken.current = account.token;
        setSigningIn(true);
        setSignInError(null);
        try {
            const orgs = await fetchOrganisations(account.user?.email);
            await SecureStore.setItemAsync(TOKEN_KEY, account.token);
            setToken(account.token);
            setUser({ name: account.user?.name, email: account.user?.email, image: account.user?.image });
            setOrganisations(orgs);
            setOrganisationId(orgs[0]?.id ?? null);
            setDomain(null);
            setStatus("signedIn");
        } catch (error) {
            handledToken.current = null;
            setSignInError(error?.message || "Sign-in failed.");
        } finally {
            setSigningIn(false);
        }
    }, []);

    // A redirect that launched the app: verify the token ourselves.
    const signInWithToken = useCallback(async (token) => {
        if (!token || handledToken.current === token) return;
        try {
            await completeSignIn(await verifyAccountToken(token));
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

    const signOut = useCallback(async () => {
        await Promise.all([
            SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
            AsyncStorage.removeItem(STATE_KEY).catch(() => {}),
            sdk.logout().catch(() => {}),
        ]);
        setToken(null);
        setUser(null);
        setOrganisations([]);
        setOrganisationId(null);
        setDomains([]);
        setDomainsState("idle");
        setDomain(null);
        setStatus("signedOut");
    }, [sdk]);

    // Any request answered with "expired" ends the session.
    useEffect(() => { setOnSessionExpired(() => { signOut(); }); }, [signOut]);

    const session = useMemo(() => (token ? { token, organisationId } : null), [token, organisationId]);

    // Domains of the active organisation; keep the chosen one if it's still
    // there. "idle" reads as loading until the first answer arrives.
    const fetchDomainList = useCallback(() => {
        if (!session || organisationId == null) return;
        fetchDomains(session)
            .then((list) => {
                setDomains(list);
                setDomain((current) => (current && list.includes(current) ? current : list[0] || null));
                setDomainsState("ready");
            })
            .catch(() => setDomainsState("error"));
    }, [session, organisationId]);
    useEffect(() => { fetchDomainList(); }, [fetchDomainList]);
    const reloadDomains = () => { setDomainsState("loading"); fetchDomainList(); };

    const value = {
        status, user, session, signingIn, signInWithToken,
        signInError: signInError || sdk.error, signIn: () => { setSignInError(null); return sdk.signin(); }, signOut,
        organisations, organisationId, setOrganisationId: (id) => { setOrganisationId(id); setDomain(null); setDomains([]); setDomainsState("loading"); },
        domains, domainsState, reloadDomains, domain, setDomain,
        days, setDays,
    };
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
    return ctx;
}
