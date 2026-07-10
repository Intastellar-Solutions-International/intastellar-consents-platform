import "./Login.css";
import logo from "../Components/Header/logo.svg";
import API from "../API/api";
import Authentication from "../Authentication/Auth";
import { LPFooter } from "../Components/Footer";
import { IntastellarButton } from "@intastellar/signin-sdk-react";
import appStorage from '../Functions/storage.js';
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const useEffect = window.React.useEffect;

export default function Login() {
    document.title = "Intastellar Consents | CMP powered by Intastellar Solutions";

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

                appStorage.setItem("organisation", response[0]);
                appStorage.setItem("globals", JSON.stringify(account));

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

    return (
        <>
            <div className="loginForm-container">
                <div className="loginForm-header">
                    <section className="loginForm-header-content">
                        <img className="loginForm-logo" src={logo} alt="Intastellar Solutions Logo" />
                        <h1>Get started with <br /> Intastellar Consents | CMP</h1>
                        <div className="icc-product-parent-ribbon icc-product-parent-ribbon--signup" role="note">
                            <span className="icc-product-parent-ribbon__product">Intastellar Consents</span>
                            <span className="icc-product-parent-ribbon__sep" aria-hidden="true">
                                ·
                            </span>
                            <span className="icc-product-parent-ribbon__rest">
                                from{" "}
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
                        <p>By logging in, you can navigate to your consents managment tool, where you can find <strong>reports</strong> about & regarding your <strong>users consents</strong> on <strong>your Websites</strong>.</p>
                        <section>
                            <p>Our business tools can help you:</p>
                            <ul>
                                <li>Manage your users consents</li>
                                <li>Generate reports</li>
                                <li>Integrate with your websites</li>
                                <li>Get insights about your users</li>
                                <li>And much more...</li>
                            </ul>
                        </section>
                    </section>
                </div>
                <div className="signin-container" style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "70vh"
                }}>
                    <h2 className="loginForm-title">Create new account</h2>
                    <IntastellarButton
                        appName="Intastellar  Consents"
                        clientId="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                        loginCallback={handleLogin}
                        scopes="profile"
                        type="signup"
                        theme={{ theme: "light", picker: "button" }}
                    />
                    <Link to="/login" className="loginForm-signup-2">
                        Already have an account? Log in
                    </Link>
                    <img className="intastellar-accounts-logo" src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg" />
                </div>
            </div>
            <LPFooter />
        </>
    )
}