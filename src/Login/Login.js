import "./Login.css";
import logo from "../Components/Header/logo.svg";
import { LPFooter } from "../Components/Footer";
import API from "../API/api.js";
import FAQS from "../Components/FAQ";
import { IntastellarButton } from "@intastellar/signin-sdk-react";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;

export default function Login() {
    document.title = "Intastellar Consents | CMP | Data consent management platform";
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

    const faq = [
        {
            question: "Do I need to install anything to use the dashboard?",
            answer: "Nope. As soon as your banner is live, the dashboard starts showing you consent data automatically."
        },
        {
            question: "Where is the consent data stored?",
            answer: "All data stays in the EU, securely hosted and fully aligned with GDPR rules."
        },
        {
            question: "Can I manage multiple websites?",
            answer: "Your banner will keep running on your site, but access to reports and insights will pause until you upgrade."
        },
        {
            question: "What happens after my trial ends?",
            answer: "Your banner will keep running on your site, but access to reports and insights will pause until you upgrade."
        }
    ]
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
                        <h1>Your Consent Management Platform</h1>
                        <p>Track, report, and manage visitor consents across all your websites in one secure EU-hosted platform.</p>
                        <section>
                            <ul>
                                <li>📊 Consent Reports – Export-ready compliance documentation</li>
                                <li>🌍 Global View – Live tracking and world map of visitor consents</li>
                                <li>🛡️ Privacy-First Hosting – All data secured in the EU</li>
                            </ul>
                            <p>Built for small businesses, agencies, and privacy-conscious website owners.</p>
                        </section>
                        <section className="testimonials">
                            <a href="https://www.cykelfaergen.info" target="_blank" rel="noopener"><img loading="lazy" className="used_by" src="https://www.cykelfaergen.info/assets/logo/logo.svg" alt="Cykelfærgen Flensborg fjord" /></a>
                            <a href="https://laesoe-booking.dk" target="_blank" rel="noopener"><img loading="lazy" className="used_by" src="https://laesoe-booking.dk/media/2377/logo-combi.png" alt="Læsø Pakkerejser" /></a>
                            <a href="https://asasoftware.aero" target="_blank" rel="noopener"><img className="used_by" src="https://asasoftware.aero/wp-content/uploads/2020/04/ASA.svg" alt="ASA Software ApS" /></a>
                            <a href="https://www.laesoe-efterskole.dk" target="_blank" rel="noopener"><img className="used_by" src="https://www.laesoe-efterskole.dk/wp-content/uploads/2023/09/cropped-cropped-cropped-cropped-cropped-LaesoeEfterskole_Logo_Farve-1.png" alt="Læssø Efterskole" /></a>
                        </section>
                    </section>
                </div>
                <div className="signin-container" style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                }}>
                    <h2 className="loginForm-title">Access Intastellar Consents</h2>
                    <p className="loginForm-description">Sign in to manage your consents, view reports, and explore insights.</p>
                    <IntastellarButton
                        appName="Intastellar  Consents"
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
                        New here? Start your free trial
                    </Link>
                    <img className="intastellar-accounts-logo" src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg" />
                </div>
            </div>
            <section className="ppad feature-list">
                <h2>Built for Compliance, Backed by Trust</h2>
                <p>Intastellar Consents is designed around GDPR and DMA requirements from day one. All data is securely hosted in the EU, so you can focus on growing your business while staying privacy-first.</p>
            </section>
            <section className="feature-list">
                <h2>Frequently Asked Questions</h2>
                <FAQS faq={faq} />
            </section>
            <LPFooter />
        </>
    )
}