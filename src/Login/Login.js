import "./Login.css";
import logo from "../Components/Header/logo.svg";
import logoBlack from "../Components/Header/logo-black.svg";
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
                <div className="int-login__split">
                    <main className="int-login__panel int-login__panel--form">
                        <div
                            className="int-login__card"
                            role="region"
                            aria-labelledby="int-login-heading"
                        >
                            <div className="int-login__brand">
                                <img
                                    src={logoBlack}
                                    alt="Intastellar Solutions"
                                    className="int-login__logo"
                                    decoding="async"
                                />
                            </div>

                            <h1 id="int-login-heading" className="int-login__headline">
                                Welcome back
                            </h1>
                            <p className="int-login__lede">
                                Sign in to continue to Intastellar Consents.
                            </p>

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
                        </div>
                    </main>

                    <aside className="int-login__panel int-login__panel--features" aria-label="Product features">
                        <div className="int-login__features-inner">
                            <div className="int-login__features-brand">
                                <img src={logo} alt="Intastellar Solutions" className="int-login__features-logo" decoding="async" />
                            </div>
                            <h2 className="int-login__features-headline">
                                Consent intelligence<br />for the modern web
                            </h2>
                            <p className="int-login__features-lede">
                                GDPR-grade consent management with real-time analytics, domain verification, and multi-client workspace management.
                            </p>
                            <ul className="int-login__features-list" aria-label="Key features">
                                <li className="int-login__feature">
                                    <span className="int-login__feature-icon" aria-hidden="true">
                                        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                                            <circle cx="10" cy="10" r="3" fill="currentColor" opacity="0.9" />
                                            <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
                                            <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1" opacity="0.55" strokeDasharray="2 2" />
                                        </svg>
                                    </span>
                                    <div className="int-login__feature-copy">
                                        <strong className="int-login__feature-title">Real-time consent monitoring</strong>
                                        <span className="int-login__feature-desc">Live interaction feed with a 30-minute rolling window and country-level breakdown.</span>
                                    </div>
                                </li>
                                <li className="int-login__feature">
                                    <span className="int-login__feature-icon" aria-hidden="true">
                                        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                                            <path d="M10 2L3.5 4.5v5c0 4.2 2.9 8.1 6.5 9.5C13.6 17.6 16.5 13.7 16.5 9.5v-5L10 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="rgba(192,159,83,0.12)" />
                                            <path d="m7 10 2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    <div className="int-login__feature-copy">
                                        <strong className="int-login__feature-title">GDPR &amp; ePrivacy compliance</strong>
                                        <span className="int-login__feature-desc">Acceptance rates, essential-only breakdown, and EU vs non-EU visitor analysis.</span>
                                    </div>
                                </li>
                                <li className="int-login__feature">
                                    <span className="int-login__feature-icon" aria-hidden="true">
                                        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                                            <rect x="2" y="13" width="3" height="5" rx="1" fill="currentColor" opacity="0.9" />
                                            <rect x="7" y="9" width="3" height="9" rx="1" fill="currentColor" opacity="0.65" />
                                            <rect x="12" y="5" width="3" height="13" rx="1" fill="currentColor" opacity="0.4" />
                                            <path d="M3.5 12 8.5 8l5 3 3.5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    <div className="int-login__feature-copy">
                                        <strong className="int-login__feature-title">Marketing recoil analysis</strong>
                                        <span className="int-login__feature-desc">Reconcile Google Ads, Meta, and GA4 click counts against consent-visible traffic — see exactly how opt-in rates hit your analytics.</span>
                                    </div>
                                </li>
                                <li className="int-login__feature">
                                    <span className="int-login__feature-icon" aria-hidden="true">
                                        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                                            <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" opacity="0.6" />
                                            <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" opacity="0.6" />
                                            <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" opacity="0.6" />
                                            <rect x="11" y="11" width="7" height="7" rx="1.5" fill="rgba(192,159,83,0.18)" stroke="currentColor" strokeWidth="1.25" />
                                        </svg>
                                    </span>
                                    <div className="int-login__feature-copy">
                                        <strong className="int-login__feature-title">Agency workspaces</strong>
                                        <span className="int-login__feature-desc">Manage multiple clients with isolated reporting environments and workspace-level domain filtering.</span>
                                    </div>
                                </li>
                            </ul>
                            <div className="int-login__features-stats">
                                <div className="int-login__features-stat">
                                    <span className="int-login__features-stat-value">30 min</span>
                                    <span className="int-login__features-stat-label">live window</span>
                                </div>
                                <div className="int-login__features-stat-divider" aria-hidden />
                                <div className="int-login__features-stat">
                                    <span className="int-login__features-stat-value">Multi</span>
                                    <span className="int-login__features-stat-label">domain support</span>
                                </div>
                                <div className="int-login__features-stat-divider" aria-hidden />
                                <div className="int-login__features-stat">
                                    <span className="int-login__features-stat-value">GDPR</span>
                                    <span className="int-login__features-stat-label">compliant</span>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
            <LPFooter />
        </>
    );
}
