import "./Login.css";
import logo from "../Components/Header/logo.svg";
import { LPFooter } from "../Components/Footer";
import API from "../API/api.js";
import { IntastellarButton } from "@intastellar/signin-sdk-react";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;

export default function Login() {
    document.title = "Intastellar Consents | CMP | Data consent management platform";
    const handleLogin = (account) => {
        console.log("User logged in:", account);
        // Handle successful authentication
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
                <div className="loginForm-header">
                    <section className="loginForm-header-content">
                        <img className="loginForm-logo" src={logo} alt="Intastellar Solutions Logo" />
                        <h1>Get started with <br /> Intastellar Consents | CMP</h1>
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
                    <h2 className="loginForm-title">Log into Intastellar Consents | CMP</h2>
                    <IntastellarButton
                        appName="My App"
                        clientId="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                        loginCallback={handleLogin}
                        scopes="profile"
                        theme={{ theme: "light", picker: "button" }}
                    />
                    {/* <div
                        id="login"
                        data-client_id="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                        data-app-name="Intastellar Consents | CMP"
                        data-login_callback="authLogin"
                    ></div> */}
                    <Link to="/signup" className="loginForm-signup-2">
                        Create an account
                    </Link>
                    <img className="intastellar-accounts-logo" src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg" />
                </div>
            </div>
            <section className="ppad key-numbers-section">
                <a href="https://www.cykelfaergen.info" target="_blank" rel="noopener"><img loading="lazy" className="used_by" src="https://www.cykelfaergen.info/assets/logo/logo.svg" alt="Cykelfærgen Flensborg fjord" /></a>
                <a href="https://teamjacobsen.dk" target="_blank" rel="noopener"><img loading="lazy" className="used_by" src="https://teamjacobsen.dk/img-own/TB_logo_white_91x50.jpg" alt="Team Jacobsen" /></a>
                <a href="https://laesoe-booking.dk" target="_blank" rel="noopener"><img loading="lazy" className="used_by" src="https://laesoe-booking.dk/media/2377/logo-combi.png" alt="Læsø Pakkerejser" /></a>
                <a href="https://www.parkinpeace.eu" target="_blank" rel="noopener"><img loading="lazy" className="used_by" src="https://www.parkinpeace.eu/assets/logo/Park-in-Peace-farve.svg" alt="ParkinPeace" /></a>
                <a href="https://asasoftware.aero" target="_blank" rel="noopener"><img className="used_by" src="https://asasoftware.aero/wp-content/uploads/2020/04/ASA.svg" alt="ASA Software ApS" /></a>
                <a href="https://www.laesoe-efterskole.dk" target="_blank" rel="noopener"><img className="used_by" src="https://www.laesoe-efterskole.dk/wp-content/uploads/2023/09/cropped-cropped-cropped-cropped-cropped-LaesoeEfterskole_Logo_Farve-1.png" alt="Læssø Efterskole" /></a>
            </section>
            <section className="grid-container grid-cols-2">
                <section className="main-content-section">
                    <h2 className="main-content-section-title">What is Intastellar Consent?</h2>
                    <p className="main-content-section-description">Intastellar Consent is a consent management platform that helps you manage your user consents in a compliant way.</p>
                    <a target="_blank" rel="noopener" href="https://www.intastellarsolutions.com" className="main-content-section-button">Learn More</a>
                </section>
                <section className="main-content-section">
                    <h2 className="main-content-section-title">Why Intastellar Consent?</h2>
                    <p className="main-content-section-description">Intastellar Consent is built on the Intastellar platform, which is a secure and scalable platform for building consent management solutions.</p>
                    <a target="_blank" rel="noopener" href="https://www.intastellarsolutions.com" className="main-content-section-button">Explore Features</a>
                </section>
            </section>
            <LPFooter />
        </>
    )
}