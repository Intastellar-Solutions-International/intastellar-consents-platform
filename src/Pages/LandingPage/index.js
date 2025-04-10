const Link = window.ReactRouterDOM.Link;
const { useEffect, useRef } = window.React;
import "./style.css";
import Authentication from "../../Authentication/Auth";
export default function LandingPage() {
    const loginRef = useRef(null);
    useEffect(() => {
        Intastellar.accounts.id.renderButton("login", {
            "picker": "popup",
            "theme": "dark"
        });

    }, []);

    return (
        <>
            <header className="main-header">
                <img src="https://www.intastellarsolutions.com/assets/logos/intastellar-new-planet.svg" className="crawlerPage-logo" />
            </header>
            <main className="main-content">
                <section className="main-content-section">
                    <h1 className="main-content-section-title">Welcome to Intastellar Consents</h1>
                    <p className="main-content-section-description">Intastellar Consent is a consent management platform that helps you manage your user consents in a compliant way.</p>
                    <Link to="/login" className="main-content-section-button">Get Started</Link>
                    <div
                        id="login"
                        data-client_id="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                        data-app-name="Intastellar Consents Solutions"
                        data-login_uri={window.location.host + "/auth-login"}
                    ></div>
                </section>
            </main>
        </>
    )
}