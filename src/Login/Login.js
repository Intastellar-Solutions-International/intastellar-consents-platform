import "./LoginPage.css";
import logo from "../Components/Header/logo.svg";
import API from "../API/api.js";
import { useIntastellar } from "@intastellar/signin-sdk-react";
import appStorage from '../Functions/storage.js';
import { Icon } from "../Components/UI/icons.js";

const { useState, useRef } = React;

// Looks up the account's organisations, stores the session and opens the
// dashboard. Rejects when the account can't be signed in, so the page can
// say so instead of sitting on the loading state.
function handleLogin(account) {
    return fetch(API.OrganisationData.url, {
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
        if (platform == null || platform === undefined) {
            window.location.href = "/dashboard";
        } else {
            window.location.href = `/${platform}/dashboard`;
        }
    });
}

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
function AccountIdentity({ user, state = "idle" }) {
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
            </span>
            <p className="int-login__account-name">{name || user?.email}</p>
            {name && <p className="int-login__account-email">{user.email}</p>}
        </div>
    );
}

export default function Login() {
    document.title = "Log in to Intastellar Consents — Intastellar Solutions International";
    // The account being signed in (after the Intastellar popup), and why the
    // last attempt failed.
    const [signingIn, setSigningIn] = useState(null);
    const [loginError, setLoginError] = useState(null);

    // The SDK keeps the first loginCallback it's given, so route through a ref.
    const onLogin = useRef(null);
    onLogin.current = (account) => {
        if (!account) return;
        setLoginError(null);
        setSigningIn(account);
        handleLogin(account).catch((error) => {
            console.error("Error during login:", error);
            setSigningIn(null);
            setLoginError("We couldn't find an organisation for this account. Try another account, or contact us if this keeps happening.");
        });
    };

    const { isLoading, signin, users, error: sdkError } = useIntastellar({
        clientId: "d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d",
        appName: "Intastellar Consents",
        loginCallback: (account) => onLogin.current(account),
        scopes: "profile",
        type: "signin",
    });

    const firstUser = users.length === 1 ? users[0] : null;
    const errorMessage = loginError || sdkError;

    return (
        <main className="int-login">
            <section className="int-login__card" aria-labelledby="int-login-heading">
                <img src={logo} alt="Intastellar Solutions" className="int-login__logo" decoding="async" />

                <h1 id="int-login-heading" className="int-login__headline">Welcome back</h1>
                {/* Announced to screen readers when it changes to "Signing you in…". */}
                <p className="int-login__lede" aria-live="polite">
                    {signingIn ? "Signing you in…" : "Sign in to Intastellar Consents"}
                </p>

                {signingIn ? (
                    <AccountIdentity user={signingIn.user} state="signing" />
                ) : isLoading ? (
                    <AccountIdentity state="checking" />
                ) : firstUser ? (
                    <AccountIdentity user={firstUser} />
                ) : null}

                {errorMessage && !signingIn && (
                    <p className="int-login__error" role="alert">
                        <Icon name="alert-triangle" size={16} />
                        <span>{errorMessage}</span>
                    </p>
                )}

                {!signingIn && (
                    <>
                        <button
                            type="button"
                            className="int-login__signin-btn"
                            onClick={() => signin()}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <span className="int-login__signin-btn-inner">
                                    <span className="int-login__signin-spinner" aria-hidden="true" />
                                    Checking your account…
                                </span>
                            ) : firstUser ? (
                                <span className="int-login__signin-btn-inner">
                                    Continue
                                    <Icon name="chevron-right" size={18} className="int-login__signin-btn-arrow" />
                                </span>
                            ) : (
                                <span className="int-login__signin-btn-inner">
                                    {users.length > 1 ? "Choose your account" : "Sign in with Intastellar Accounts"}
                                </span>
                            )}
                        </button>

                        {users.length > 0 && !isLoading && (
                            <p className="int-login__switch">
                                <a
                                    href={`https://www.intastellaraccounts.com/signin/v2/ws/identifier?service=Intastellar+Consents+%7C+CMP&continue=${window.location.host}&authuser=1&entryFlow=cHJvZmlsZQ%3D%3D&key=d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d&access_id=${window.location.hostname}&passive=true&flowName=GeneralOAuthFlow&Entry=webauthsignin&scope=profile`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="int-login__link"
                                >
                                    Use another account
                                </a>
                            </p>
                        )}

                        <p className="int-login__signup">
                            New to Intastellar Consents?{" "}
                            <a href="https://intastellar.eu/#get-started" className="int-login__link">Create an account</a>
                        </p>
                    </>
                )}
            </section>

            <footer className="int-login__footer">
                <span>© {new Date().getFullYear()} Intastellar Solutions</span>
                <a href="https://intastellar.eu/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
                <a href="https://intastellar.eu/legal/terms" target="_blank" rel="noopener noreferrer">Terms</a>
                <a href="https://intastellar.eu/legal/imprint" target="_blank" rel="noopener noreferrer">Legal notice</a>
                <a href="https://www.intastellarsolutions.com/contact" target="_blank" rel="noopener noreferrer">Contact</a>
            </footer>
        </main>
    );
}
