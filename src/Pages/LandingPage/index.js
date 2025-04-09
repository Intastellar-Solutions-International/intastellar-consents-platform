const Link = window.ReactRouterDOM.Link;
const { useEffect } = window.React;
import "./style.css";
export default function LandingPage() {
    useEffect(() => {
        Intastellar.accounts.id.render("loginButton");
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
                    <div id="loginButton" data-client_id="" data-app-name="Example App" data-login_callback="login"></div>
                </section>
            </main>
        </>
    )
}