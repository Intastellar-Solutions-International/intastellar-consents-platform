import "./LoginPage.css";
import logo from "../Components/Header/logo.svg";
// "Abstract golden bokeh lights on dark background" by Philipp Hubert,
// Unsplash License (free, no attribution required). Cropped and compressed.
import background from "./login-background.jpg";
import API from "../API/api.js";
import { useIntastellar } from "@intastellar/signin-sdk-react";
import appStorage from '../Functions/storage.js';
import { Icon } from "../Components/UI/icons.js";
import { TRANSLATIONS } from "./loginTranslations.js";
import { useLanguage, setLanguage } from "../i18n/index.js";
import LanguageMenu from "../Components/UI/LanguageMenu.js";

const { useState, useRef, useEffect } = React;

// Accounts removed from this login page. Intastellar Accounts keeps the
// account signed in on its own domain (we can't clear its cookies), so
// removal hides it here, in this browser, until it's used to sign in again.
const HIDDEN_ACCOUNTS_KEY = "int_login_hidden_accounts";

function readHiddenAccounts() {
    try {
        const list = JSON.parse(localStorage.getItem(HIDDEN_ACCOUNTS_KEY) || "[]");
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function writeHiddenAccounts(list) {
    try { localStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

const emailKey = (email) => String(email || "").trim().toLowerCase();

// The token the SDK stored on this site after the last sign-in — set for
// this host's parent domain, and by older code for the host itself.
function clearSignInCookie() {
    const parts = window.location.hostname.split(".");
    const parent = parts.length > 2 ? parts.slice(1).join(".") : window.location.hostname;
    for (const domain of ["", `; domain=.${parent}`]) {
        document.cookie = `inta_acc=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domain}`;
    }
}

// How long the organisation lookup after sign-in may take.
const SIGN_IN_TIMEOUT_MS = 30000;
// How long to wait on the popup before offering to try again.
const POPUP_STALL_MS = 90000;

// The two products the login page can open; the last choice is remembered
// on this device.
const PRODUCTS = [
    { id: "cmp", icon: "shield-check" },
    { id: "analytics", icon: "bar-chart" },
];
const PRODUCT_KEY = "login_product";

function readProduct() {
    try {
        const saved = localStorage.getItem(PRODUCT_KEY);
        return PRODUCTS.some((p) => p.id === saved) ? saved : "cmp";
    } catch { return "cmp"; }
}

// Looks up the account's organisations, stores the session and opens the
// chosen product (CMP dashboard or Analytics). Rejects when the account can't be signed in — with
// err.name "AbortError" when it took longer than SIGN_IN_TIMEOUT_MS — so the
// page can say so instead of sitting on the loading state.
function handleLogin(account, product = "cmp") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIGN_IN_TIMEOUT_MS);
    return fetch(API.OrganisationData.url, {
            signal: controller.signal,
            withCredentials: false,
            method: "POST",
            headers: {
                LoginType: "oauth",
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
                organisationMember: account?.user?.email,
            }),
        })
    .then((response) => response.json())
    .then((response) => {
        if (response === "Err_Logon_Fail" || !Array.isArray(response)) {
            throw new Error("organisation lookup rejected");
        }
        localStorage.setItem("platform", "gdpr");
        appStorage.setItem("organisation", JSON.stringify(response[0]));

        localStorage.setItem(
            "globals",
            JSON.stringify({
                ...account,
                organisation_access:
                    response.map((organisation) => ({
                        organisation_id: organisation.id,
                        organisation_name: organisation.name,
                        organisation_access: organisation.users.find(
                            (user) => user.email === account?.user?.email
                        )?.role,
                    })) || [],
            })
        );

        const platform = localStorage.getItem("platform");
        if (product === "analytics") {
            window.location.href = "/analytics";
        } else if (platform == null || platform === undefined) {
            window.location.href = "/dashboard";
        } else {
            window.location.href = `/${platform}/dashboard`;
        }
    })
    .finally(() => clearTimeout(timer));
}

// Icons for the three selling points; their text is in loginTranslations.js.
const POINT_ICONS = {
    cmp: ["shield-check", "bar-chart", "share"],
    analytics: ["fingerprint", "trending-up", "bar-chart"],
};

function fullNameOf(user) {
    return [user?.name?.first, user?.name?.last].filter(Boolean).join(" ");
}

function initialsOf(user) {
    const name = fullNameOf(user) || user?.email || "";
    return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

// Photo, name and email of the account being signed in. `state`:
//   "idle"     — recognised account, waiting for Continue
//   "checking" — shimmering placeholder while the SDK looks for an account
//   "signing"  — gold arc circling the photo while the dashboard loads
// onRemove: a cross on the photo's corner, labelled removeLabel ("Remove
// this account") for screen readers and as its tooltip; idle state only.
function AccountIdentity({ user, state = "idle", onRemove, removeLabel }) {
    if (state === "checking") {
        return (
            <div className="int-login__account int-login__account--checking" aria-hidden="true">
                <span className="int-login__avatar int-login__skeleton" />
                <span className="int-login__skeleton int-login__skeleton-line" />
                <span className="int-login__skeleton int-login__skeleton-line int-login__skeleton-line--email" />
            </div>
        );
    }
    const name = fullNameOf(user);
    return (
        <div className={`int-login__account${state === "signing" ? " int-login__account--signing" : ""}`}>
            <span className="int-login__avatar">
                {/* The name below says who it is, so the photo is decorative. */}
                {user?.image
                    ? <img src={user.image} alt="" className="int-login__avatar-image" />
                    : <span className="int-login__avatar-initials" aria-hidden="true">{initialsOf(user)}</span>}
                {onRemove && state === "idle" && (
                    <button
                        type="button"
                        className="int-login__remove"
                        onClick={onRemove}
                        aria-label={removeLabel}
                        title={removeLabel}
                    >
                        <Icon name="x" size={16} />
                    </button>
                )}
            </span>
            <p className="int-login__account-name">{name || user?.email}</p>
            {name && <p className="int-login__account-email">{user.email}</p>}
        </div>
    );
}

export default function Login() {
    // The platform-wide language (src/i18n): chosen here, it carries on into
    // the app after sign-in.
    const lang = useLanguage();
    const t = TRANSLATIONS[lang];

    const changeLanguage = (code) => setLanguage(code);
    // The account being signed in (after the Intastellar popup), and why the
    // last attempt failed.
    const [signingIn, setSigningIn] = useState(null);
    const [loginError, setLoginError] = useState(null);
    const [hiddenAccounts, setHiddenAccounts] = useState(readHiddenAccounts);
    const [product, setProduct] = useState(readProduct);
    const chooseProduct = (id) => {
        setProduct(id);
        try { localStorage.setItem(PRODUCT_KEY, id); } catch { /* private mode */ }
    };
    // The page speaks about the chosen product: "<key>_analytics" texts
    // replace "<key>" when Analytics is selected.
    const tp = (key) => (product === "analytics" && t[`${key}_analytics`]) || t[key];

    useEffect(() => {
        document.title = tp("documentTitle");
    }, [lang, product]);
    const signinButton = useRef(null);
    // Confirmation after removing an account: { message: translation key,
    // email: the removed account, for Undo }.
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    // The Intastellar Accounts popup while it's open (the SDK doesn't say
    // when it closes, so we watch it).
    const [popupOpen, setPopupOpen] = useState(false);
    // Still open after POPUP_STALL_MS: stop spinning, offer Try again.
    const [popupStalled, setPopupStalled] = useState(false);
    const popup = useRef(null);
    const popupWatch = useRef(null);
    const popupStallTimer = useRef(null);
    const stopWatchingPopup = () => {
        clearInterval(popupWatch.current);
        clearTimeout(popupStallTimer.current);
        popup.current = null;
        setPopupOpen(false);
        setPopupStalled(false);
    };
    useEffect(() => () => {
        clearInterval(popupWatch.current);
        clearTimeout(popupStallTimer.current);
    }, []);
    // The account being signed in, so a timed-out lookup can be retried
    // without reopening the popup.
    const lastAccount = useRef(null);

    // The SDK keeps the first loginCallback it's given, so route through a ref.
    const onLogin = useRef(null);
    onLogin.current = (account) => {
        if (!account) return;
        stopWatchingPopup();
        setLoginError(null);
        setSigningIn(account);
        lastAccount.current = account;
        // Signing in with a removed account brings it back.
        const signedIn = emailKey(account.user?.email);
        if (hiddenAccounts.includes(signedIn)) writeHiddenAccounts(hiddenAccounts.filter((e) => e !== signedIn));
        handleLogin(account, product).catch((error) => {
            console.error("Error during login:", error);
            setSigningIn(null);
            setLoginError(error?.name === "AbortError" ? "signInTimedOut" : "lookupFailed");
        });
    };

    const { isLoading, signin, users, error: sdkError } = useIntastellar({
        clientId: "d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d",
        appName: "Intastellar Consents",
        loginCallback: (account) => onLogin.current(account),
        scopes: "profile",
        type: "signin",
    });

    const visibleUsers = users.filter((user) => !hiddenAccounts.includes(emailKey(user.email)));
    const firstUser = visibleUsers.length === 1 ? visibleUsers[0] : null;

    // "Welcome back" only for someone with a signed-in Intastellar account.
    // Until the check finishes we don't know yet, so the heading stays
    // invisible (its space kept) instead of flashing the wrong text.
    const knownUser = Boolean(signingIn) || visibleUsers.length > 0;
    const headingPending = isLoading && !signingIn;

    // Opens the sign-in popup and keeps a handle on it: window.open is
    // wrapped just for the SDK's synchronous call so we learn which window it
    // opened, then restored. No window (blocked) → the SDK shows its error.
    const startSignin = () => {
        // Try again after a stall: start over with a fresh window.
        if (popup.current) {
            try { popup.current.close(); } catch { /* already gone */ }
            stopWatchingPopup();
        }
        setLoginError(null);
        const realOpen = window.open;
        let opened = null;
        window.open = function (...args) {
            opened = realOpen.apply(this, args);
            return opened;
        };
        try {
            signin();
        } finally {
            window.open = realOpen;
        }
        if (!opened) return;
        popup.current = opened;
        setPopupOpen(true);
        clearInterval(popupWatch.current);
        popupWatch.current = setInterval(() => {
            // Closed without finishing → back to the normal button.
            if (popup.current?.closed) stopWatchingPopup();
        }, 500);
        clearTimeout(popupStallTimer.current);
        popupStallTimer.current = setTimeout(() => setPopupStalled(true), POPUP_STALL_MS);
    };

    // After a timed-out organisation lookup: same account, no new popup.
    const retrySignIn = () => {
        if (lastAccount.current) onLogin.current(lastAccount.current);
    };

    const cancelPopup = () => {
        try { popup.current?.close(); } catch { /* already gone */ }
        stopWatchingPopup();
        requestAnimationFrame(() => signinButton.current?.focus());
    };

    const showHidden = (list) => {
        writeHiddenAccounts(list);
        setHiddenAccounts(list);
    };

    const removeAccount = (user) => {
        const next = [...new Set([...hiddenAccounts, emailKey(user.email)])];
        showHidden(next);
        clearSignInCookie();
        setLoginError(null);
        setToast({ message: "accountRemoved", email: emailKey(user.email) });
        clearTimeout(toastTimer.current);
        // Long enough to reach Undo.
        toastTimer.current = setTimeout(() => setToast(null), 6000);
        // The button that had focus is gone; continue from the sign-in button.
        requestAnimationFrame(() => signinButton.current?.focus());
    };
    // Puts the removed account back; the sign-in button stays focused, now
    // reading "Continue" again.
    const undoRemove = () => {
        if (!toast?.email) return;
        showHidden(hiddenAccounts.filter((e) => e !== toast.email));
        clearTimeout(toastTimer.current);
        setToast(null);
        requestAnimationFrame(() => signinButton.current?.focus());
    };

    // Our own errors are translation keys; the SDK's come as English text.
    const errorMessage = loginError ? t[loginError] : sdkError;

    return (
        <main className="int-login" style={{ "--login-background": `url(${background})` }}>
            <LanguageMenu value={lang} onChange={changeLanguage} label={t.language} className="int-login__language" />

            <section className="int-login__card" aria-labelledby="int-login-heading">
                <img src={logo} alt="Intastellar Solutions" className="int-login__logo" decoding="async" />

                <h1 id="int-login-heading" className={`int-login__headline${headingPending ? " int-login__intro--pending" : ""}`}>
                    {knownUser ? t.welcomeBack : t.signIn}
                </h1>
                {/* Announced to screen readers when it changes to "Signing you in…". */}
                <p className={`int-login__lede${headingPending ? " int-login__intro--pending" : ""}`} aria-live="polite">
                    {signingIn ? t.signingIn : popupStalled ? t.popupStalled : popupOpen ? t.finishInWindow : knownUser ? tp("ledeKnown") : t.ledeNew}
                </p>

                {signingIn ? (
                    <AccountIdentity user={signingIn.user} state="signing" />
                ) : popupOpen && firstUser ? (
                    // The arc stops once we've stopped expecting an answer.
                    <AccountIdentity user={firstUser} state={popupStalled ? "idle" : "signing"} />
                ) : isLoading ? (
                    <AccountIdentity state="checking" />
                ) : firstUser ? (
                    <AccountIdentity user={firstUser} onRemove={() => removeAccount(firstUser)} removeLabel={t.removeAccount} />
                ) : null}

                {errorMessage && !signingIn && (
                    <p className="int-login__error" role="alert">
                        <Icon name="alert-triangle" size={16} />
                        <span>
                            {errorMessage}
                            {loginError === "signInTimedOut" && lastAccount.current && (
                                <>
                                    {" "}
                                    <button type="button" className="int-login__text-btn int-login__text-btn--inline" onClick={retrySignIn}>
                                        {t.tryAgain}
                                    </button>
                                </>
                            )}
                        </span>
                    </p>
                )}

                {!signingIn && (
                    <>
                        {/* Where to go after signing in. Locked once the popup is open. */}
                        <fieldset className="int-login__product" disabled={popupOpen}>
                            {/* The descriptions are for screen readers; the selling
                                points below describe each product. */}
                            <legend className="int-login__product-label">{t.productLabel}</legend>
                            <div className="int-login__product-options">
                                {PRODUCTS.map((p) => (
                                    <label
                                        key={p.id}
                                        className={`int-login__product-option${product === p.id ? " int-login__product-option--selected" : ""}`}
                                    >
                                        <input
                                            type="radio"
                                            name="login-product"
                                            value={p.id}
                                            checked={product === p.id}
                                            onChange={() => chooseProduct(p.id)}
                                        />
                                        <Icon name={p.icon} size={16} className="int-login__product-icon" />
                                        <span className="int-login__product-name">{t[`product_${p.id}`]}</span>
                                        <span className="int-login__sr-only">{t[`product_${p.id}Hint`]}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <button
                            type="button"
                            ref={signinButton}
                            className="int-login__signin-btn"
                            onClick={startSignin}
                            disabled={isLoading || (popupOpen && !popupStalled)}
                        >
                            {popupStalled ? (
                                <span className="int-login__signin-btn-inner">{t.tryAgain}</span>
                            ) : popupOpen ? (
                                <span className="int-login__signin-btn-inner">
                                    <span className="int-login__signin-spinner" aria-hidden="true" />
                                    {t.waitingPopup}
                                </span>
                            ) : isLoading ? (
                                <span className="int-login__signin-btn-inner">
                                    <span className="int-login__signin-spinner" aria-hidden="true" />
                                    {t.checking}
                                </span>
                            ) : firstUser ? (
                                <span className="int-login__signin-btn-inner">
                                    {t.continue}
                                    <Icon name="chevron-right" size={18} className="int-login__signin-btn-arrow" />
                                </span>
                            ) : (
                                <span className="int-login__signin-btn-inner">
                                    {visibleUsers.length > 1 ? t.chooseAccount : t.signInWith}
                                </span>
                            )}
                        </button>

                        {popupOpen ? (
                            <p className="int-login__popup-actions">
                                <button type="button" className="int-login__text-btn" onClick={() => popup.current?.focus()}>
                                    {t.showWindow}
                                </button>
                                <button type="button" className="int-login__text-btn" onClick={cancelPopup}>
                                    {t.cancel}
                                </button>
                            </p>
                        ) : !isLoading && (
                            // What the button does, and what this site gets from it.
                            <p className="int-login__hint">
                                <Icon name="shield-check" size={16} />
                                <span>
                                    {t.popupHint} {t.passwordHint}{" "}
                                    <a href="https://intastellar.eu/legal/privacy" target="_blank" rel="noopener noreferrer" className="int-login__link">
                                        {t.privacyLink}
                                    </a>
                                </span>
                            </p>
                        )}

                        {visibleUsers.length > 0 && !isLoading && !popupOpen && (
                            <p className="int-login__switch">
                                <a
                                    href={`https://www.intastellaraccounts.com/signin/v2/ws/identifier?service=Intastellar+Consents+%7C+CMP&continue=${window.location.host}&authuser=1&entryFlow=cHJvZmlsZQ%3D%3D&key=d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d&access_id=${window.location.hostname}&passive=true&flowName=GeneralOAuthFlow&Entry=webauthsignin&scope=profile`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="int-login__link"
                                >
                                    {t.useAnother}
                                </a>
                            </p>
                        )}

                        <p className="int-login__signup">
                            {tp("newHere")}{" "}
                            <a href="https://intastellar.eu/#get-started" className="int-login__link">{t.createAccount}</a>
                        </p>
                    </>
                )}
            </section>

            <ul className="int-login__points" aria-label={tp("pointsLabel")}>
                {tp("points").map((point, i) => (
                    <li key={`${product}-${i}`} className="int-login__point">
                        <Icon name={POINT_ICONS[product][i]} size={18} className="int-login__point-icon" />
                        <span className="int-login__point-title">{point.title}</span>
                        <span className="int-login__point-text">{point.text}</span>
                    </li>
                ))}
            </ul>

            {/* Always rendered so screen readers announce the text when it appears. */}
            <div className={`int-login__toast${toast ? " int-login__toast--visible" : ""}`} role="status" aria-live="polite">
                {toast && (
                    <>
                        <Icon name="check-circle" size={18} />
                        <span>{t[toast.message]}</span>
                        <button type="button" className="int-login__toast-action" onClick={undoRemove}>
                            {t.undo}
                        </button>
                    </>
                )}
            </div>

            <footer className="int-login__footer">
                <span>© {new Date().getFullYear()} Intastellar Solutions</span>
                <a href="https://intastellar.eu/legal/privacy" target="_blank" rel="noopener noreferrer">{t.privacy}</a>
                <a href="https://intastellar.eu/legal/terms" target="_blank" rel="noopener noreferrer">{t.terms}</a>
                <a href="https://intastellar.eu/legal/imprint" target="_blank" rel="noopener noreferrer">{t.legalNotice}</a>
                <a href="https://www.intastellarsolutions.com/contact" target="_blank" rel="noopener noreferrer">{t.contact}</a>
            </footer>
        </main>
    );
}
