import "./Login.css";
import logo from "../Components/Header/logo.svg";
import { LPFooter } from "../Components/Footer";
import API from "../API/api.js";
import { IntastellarButton } from "@intastellar/signin-sdk-react";
import { useState } from "react";

export default function Login() {
    document.title = "Log in to Intastellar Consents";
    const [loading, setLoading] = useState(true);
    const handleLogin = (account) => {
        console.log("User logged in:", account);
        // Handle successful authentication

        if (account) {
            console.log(account?.account_domain);
            fetch(API.OrganisationData.url, {
                withCredentials: false,
                method: "POST",
                headers: {
                    'LoginType': 'oauth',
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({
                    organisationMember: account?.user?.email,
                })
            }).then((response) => {
                return response.json();
            }).then(response => {

                if (response === "Err_Logon_Fail") {
                    console.error("Error logging in");
                    return;
                }

                localStorage.setItem("platform", "gdpr");

                localStorage.setItem("organisation", response[0]);
                localStorage.setItem("globals", JSON.stringify(account));

                if (localStorage.getItem("platform") === null || localStorage.getItem("platform") === undefined) {
                    window.location.href = "/dashboard";
                } else {
                    window.location.href = "/" + localStorage.getItem("platform") + "/dashboard";
                }
            }).catch((error) => {
                console.error("Error during login:", error);
                // Optionally redirect to login page or show an error message
            })
        }

    };
    /* useEffect(() => {
        document.body.classList.add("loginForm-body");
        Intastellar.accounts.id.renderButton("login", {
            "picker": "button",
            "theme": "light"
        });

        window.authLogin = function (response) {
            if (response) {
                fetch(API.Login.url, {
                    withCredentials: false,
                    method: "POST",
                    headers: {
                        'LoginType': 'oauth',
                        'Content-Type': 'application/json; charset=utf-8'
                    },
                    body: JSON.stringify({
                        email: response?.user?.email,
                        account_domain: response?.account_domain,
                    })
                }).then((response) => {
                    return response.json();
                }).then(response => {
                    if (response === "Err_Logon_Fail") {
                        console.error("Error logging in");
                        return;
                    }

                    localStorage.setItem("organisation", response.organisation);
                    localStorage.setItem("globals", JSON.stringify(response));

                    if (localStorage.getItem("platform") === null || localStorage.getItem("platform") === undefined) {
                        window.location.href = "/dashboard";
                    } else {
                        window.location.href = "/" + localStorage.getItem("platform") + "/dashboard";
                    }
                }).catch((error) => {
                    console.error("Error during login:", error);
                    // Optionally redirect to login page or show an error message
                })
            }
        }

    }, []); */

    return (
        <>
            <div className="loginForm-container">
                <section className="loginForm-logo-section">
                    <img src={logo} alt="Intastellar Consents Logo" className="loginForm-logo" />
                    <h1 className="loginForm-title">Sign in to Intastellar Consents</h1>
                    <p className="loginForm-description">Access consent activity and reporting.</p>
                    <div className="loginForm-button-container">
                        <IntastellarButton
                            clientId="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                            appName="Intastellar Consents | CMP"
                            loginCallback={handleLogin}
                            theme="dark"
                            type="login"
                        /> 
                        <section className="intastellar-accounts-logo-container">
                            <p className="poweredBy">Powered by Intastellar Accounts</p>
                            <img src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts-white.svg" alt="Intastellar Accounts Logo" className="intastellar-accounts-logo" />
                        </section>
                    </div>
                </section>
            </div>
            <LPFooter />
        </>
    )
}