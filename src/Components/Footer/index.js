import "./Style.css";

function IconShield() {
    return (
        <svg className="footer-trust-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
            />
        </svg>
    );
}

function IconEU() {
    return (
        <svg className="footer-trust-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
            />
        </svg>
    );
}

function IconDoc() {
    return (
        <svg className="footer-trust-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zm-2-6H8v-2h8v2zm0-4H8V8h8v2z"
            />
        </svg>
    );
}

function TrustStrip({ variant }) {
    const items = [
        {
            Icon: IconShield,
            title: "Secure hosted",
            text: "Infrastructure and access controls designed for sensitive consent data.",
        },
        {
            Icon: IconEU,
            title: "Stored & processed in the EU",
            text: "Consent records are stored and processed within the European Union.",
        },
        {
            Icon: IconDoc,
            title: "Built for GDPR",
            text: "Built for GDPR requirements including audit logging and consent tracking.",
        },
    ];

    return (
        <div className={`footer-trust-strip footer-trust-strip--${variant}`} role="region" aria-label="Trust and compliance">
            <ul className="footer-trust-list">
                {items.map(({ Icon, title, text }) => (
                    <li key={title} className="footer-trust-item">
                        <span className="footer-trust-item-icon" aria-hidden="true">
                            <Icon />
                        </span>
                        <span className="footer-trust-item-body">
                            <span className="footer-trust-item-title">{title}</span>
                            <span className="footer-trust-item-text">{text}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="footer footer--app dashboard-content">
            <TrustStrip variant="dark" />
            <div className="footer-app-bottom">
                <p className="footer-copyright">&copy; {year} Intastellar Solutions International. All rights reserved.</p>
                <img
                    src="https://www.intastellar-consents.com/assets/icons/intastellar-logo-black.svg"
                    alt="Intastellar Solutions International"
                    className="footer-logo footer-logo--on-dark"
                />
            </div>
        </footer>
    );
}

export function LPFooter() {
    const year = new Date().getFullYear();
    return (
        <footer className="footer lp-footer">
            <div className="lp-footer__accent" aria-hidden="true" />
            <div className="lp-footer__inner">
                <TrustStrip variant="login" />
                <section className="lp-footer__nav" aria-label="Legal and company">
                    <nav className="lp-footer__nav-col">
                        <h3 className="lp-footer__nav-title">Legal</h3>
                        <a
                            href="https://www.intastellarsolutions.com/about/legal/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-footer__link"
                        >
                            Privacy Policy
                        </a>
                        <a
                            href="https://www.intastellarsolutions.com/about/legal/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-footer__link"
                        >
                            Terms of Service
                        </a>
                        <a
                            href="https://www.intastellarsolutions.com/about/legal/imprint"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-footer__link"
                        >
                            Legal Notice
                        </a>
                    </nav>
                    <nav className="lp-footer__nav-col">
                        <h3 className="lp-footer__nav-title">Company</h3>
                        <a
                            href="https://www.intastellarsolutions.com/about/om-os"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-footer__link"
                        >
                            About
                        </a>
                        <a
                            href="https://www.intastellarsolutions.com/contact"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-footer__link"
                        >
                            Contact Us
                        </a>
                    </nav>
                </section>
                <section className="lp-footer__brand">
                    <img
                        src="https://www.intastellar-consents.com/assets/icons/intastellar-logo-black.svg"
                        alt="Intastellar Solutions International"
                        className="lp-footer__logo"
                    />
                    <p className="lp-footer__lead">
                        Intastellar Consents is a product by Intastellar Solutions International. We operate secure
                        hosting, and your consents are stored and processed in the EU in line with GDPR.
                    </p>
                    <p className="lp-footer__copyright">&copy; {year} Intastellar Solutions International. All rights reserved.</p>
                </section>
            </div>
        </footer>
    );
}
