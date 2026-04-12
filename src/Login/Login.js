import "./Login.css";
import logo from "../Components/Header/logo.svg";
import { LPFooter } from "../Components/Footer";
import API from "../API/api.js";
import { useIntastellar } from "@intastellar/signin-sdk-react";

function handleLogin(account) {
    if (!account) return;

    fetch(API.OrganisationData.url, {
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
                if (response === "Err_Logon_Fail") {
                    console.error("Login failed: organisation lookup rejected");
                    return;
                }

                localStorage.setItem("platform", "gdpr");
                localStorage.setItem("organisation", JSON.stringify(response[0]));

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
            })
            .catch((error) => {
                console.error("Error during login:", error);
            });
}

export default function Login() {
    document.title = "Log in to Intastellar Consents — Intastellar Solutions International";
    const { isLoading, signin, users } = useIntastellar({
        clientId: "d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d",
        appName: "Intastellar Consents",
        loginCallback: handleLogin,
        scopes: "profile",
        type: "signin",
    });

    return (
        <>
            <div className="int-login">
                <main className="int-login__main">
                    <div
                        className="int-login__card"
                        role="region"
                        aria-labelledby="int-login-heading"
                    >
                        <div className="int-login__brand">
                            <img
                                src={logo}
                                alt="Intastellar Solutions"
                                className="int-login__logo"
                                decoding="async"
                            />
                        </div>

                        <div className="icc-product-parent-ribbon" role="note">
                            <span className="icc-product-parent-ribbon__product">Intastellar Consents</span>
                            <span className="icc-product-parent-ribbon__sep" aria-hidden="true">
                                ·
                            </span>
                            <span className="icc-product-parent-ribbon__rest">
                                a consent product from{" "}
                                <a
                                    href="https://www.intastellarsolutions.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="icc-product-parent-ribbon__link"
                                >
                                    Intastellar Solutions International
                                </a>
                            </span>
                        </div>

                        <h1 id="int-login-heading" className="int-login__headline">
                            Sign in to Intastellar Consents
                        </h1>
                        <p className="int-login__lede">
                            Access consent activity, audit logs, and reporting. Sign in with your Intastellar
                            account.
                        </p>

                        <ul className="int-login__trust" aria-label="Security and privacy">
                            <li className="int-login__trust-item">Secure authentication</li>
                            <li className="int-login__trust-item">Your data is protected</li>
                            <li className="int-login__trust-item">Audit logs are private</li>
                        </ul>

                        <div className="int-login__sso">
                            <button
                                type="button"
                                className="int-login__signin-btn"
                                onClick={() => signin()}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <span className="int-login__signin-btn-inner">
                                        <span className="int-login__signin-spinner" aria-hidden="true" />
                                        Signing in…
                                    </span>
                                ) : users.length == 1 ? (
                                    <span className="int-login__signin-btn-inner">
                                        <img src={users[0].image} className="int-login__signin-btn-inner-image" />
                                        <span className="int-login__signin-btn-inner-text">
                                            Continue as {users[0].name.first}
                                            <span className="int-login__signin-btn-inner-text-email">{users[0].email}</span>
                                        </span>
                                    </span>
                                    ) : users.length > 1 ? (
                                        <span className="int-login__signin-btn-inner">
                                            Choose your account
                                        </span>
                                    ) : (
                                        <span className="int-login__signin-btn-inner">
                                            Sign in with Intastellar Accounts
                                        </span>
                                    )}
                            </button>
                        </div>

                        <p className="int-login__not-you">
                            <a
                                href={`https://www.intastellaraccounts.com/signin/v2/ws/identifier?service=Intastellar+Consents+%7C+CMP&continue=${window.location.host}&authuser=1&entryFlow=cHJvZmlsZQ%3D%3D&key=d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d&access_id=${window.location.hostname}&passive=true&flowName=GeneralOAuthFlow&Entry=webauthsignin&scope=profile`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="int-login__not-you-link"
                            >
                                Not you? Switch account
                            </a>
                        </p>

                        <footer
                            className="int-login__identity"
                            aria-label="Single sign-on and identity provider"
                        >
                            <div className="int-login__identity-strip">
                                <div className="int-login__identity-icon" aria-hidden="true">
                                    <svg
                                        className="int-login__identity-svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        focusable="false"
                                    >
                                        <path
                                            d="M12 2.5 4.5 5.25v5.5c0 4.85 3.35 9.4 7.5 10.75 4.15-1.35 7.5-5.9 7.5-10.75v-5.5L12 2.5z"
                                            stroke="currentColor"
                                            strokeWidth="1.35"
                                            strokeLinejoin="round"
                                            fill="rgba(192, 159, 83, 0.14)"
                                        />
                                        <path
                                            d="m9 12 2.25 2.25L15.5 10"
                                            stroke="currentColor"
                                            strokeWidth="1.35"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                                <div className="int-login__identity-copy">
                                    <p className="int-login__identity-kicker">Single sign-on (SSO)</p>
                                    <p className="int-login__identity-lede">
                                        <strong className="int-login__identity-product">Intastellar Accounts</strong> is
                                        your identity provider. One verified login for Intastellar products — this app
                                        never receives your password.
                                    </p>
                                </div>
                            </div>
                            <a
                                href="https://my.intastellaraccounts.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="int-login__identity-brand"
                            >
                                <span className="int-login__identity-brand-label">Secured by</span>
                                <img
                                    src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts-white.svg"
                                    alt="Intastellar Accounts"
                                    className="int-login__identity-logo"
                                    decoding="async"
                                />
                            </a>
                            <p className="int-login__identity-trustline">
                                Identity trust · Encrypted session · Centralised access control
                            </p>
                        </footer>
                    </div>
                </main>
            </div>
            <LPFooter />
        </>
    );
}
