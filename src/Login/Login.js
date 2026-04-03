import "./Login.css";
import logo from "../Components/Header/logo.svg";
import { LPFooter } from "../Components/Footer";
import API from "../API/api.js";
import { IntastellarButton } from "@intastellar/signin-sdk-react";

export default function Login() {
    document.title = "Log in to Intastellar Consents";

    const handleLogin = (account) => {
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
    };

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
                                alt="Intastellar Consents"
                                className="int-login__logo"
                                decoding="async"
                            />
                        </div>

                        <h1 id="int-login-heading" className="int-login__headline">
                            Sign in to Intastellar Consents
                        </h1>
                        <p className="int-login__lede">
                            Access consent activity, audit logs, and reporting. Sign in with your Intastellar
                            account — authentication is handled by Intastellar Accounts.
                        </p>

                        <div className="int-login__sso">
                            <IntastellarButton
                                clientId="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                                appName="Intastellar Consents | CMP"
                                loginCallback={handleLogin}
                                theme="dark"
                                type="login"
                            />
                        </div>

                        <footer className="int-login__powered" aria-label="Identity provider">
                            <span className="int-login__powered-label">Powered by Intastellar Accounts</span>
                            <img
                                src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts-white.svg"
                                alt=""
                                className="int-login__powered-logo"
                                decoding="async"
                            />
                        </footer>
                    </div>
                </main>
            </div>
            <LPFooter />
        </>
    );
}
