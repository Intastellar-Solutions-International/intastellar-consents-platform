import "./Style.css";
export default function Footer() {
    const year = new Date().getFullYear();
    return <>
        <footer className="footer dashboard-content">
            <p>&copy; {year} Intastellar Solutions International. All rights reserved.</p>
            <img src="https://www.intastellar-consents.com/assets/icons/intastellar-logo-black.svg" alt="Intastellar Solutions International" className="footer-logo" />
        </footer>
    </>
}

export function LPFooter() {
    const year = new Date().getFullYear();
    return <>
        <footer className="footer lp-footer dashboard-content">
            <section className="footer-nav-container">
                <nav className="footer-nav">
                    <h3>Legal</h3>
                    <a href="https://www.intastellarsolutions.com/about/legal/privacy" target="_blank" className="links">Privacy Policy</a>
                    <a href="https://www.intastellarsolutions.com/about/legal/terms" target="_blank" className="links">Terms of Service</a>
                    <a href="https://www.intastellarsolutions.com/about/legal/imprint" target="_blank" className="links">Impressum</a>
                </nav>
                <nav className="footer-nav">
                    <h3>Company</h3>
                    <a href="https://www.intastellarsolutions.com/about/om-os" target="_blank" className="links">Who we are</a>
                    <a href="https://www.intastellarsolutions.com/contact" target="_blank" className="links">Contact Us</a>
                </nav>
            </section>
            <section className="footer-logo-container">
                <img src="https://www.intastellar-consents.com/assets/icons/intastellar-logo-black.svg" alt="Intastellar Solutions International" className="footer-logo" />
                <p className="copy-info">Data processing in accordance with GDPR. Intastellar Consents is a product by Intastellar Solutions International.</p>
                <p className="copy-info">&copy; {year} Intastellar Solutions International. All rights reserved.</p>
            </section>
        </footer>
    </>
}