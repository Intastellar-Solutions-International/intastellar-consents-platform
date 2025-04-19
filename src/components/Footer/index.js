import "./Style.css";
import logo from "../Header/logo.png";
export default function Footer() {
    const year = new Date().getFullYear();
    return <>
        <footer className="footer dashboard-content">
            <img src={logo} alt="Intastellar Solutions International" className="footer-logo" />
            <p>&copy; {year} Intastellar Solutions International. All rights reserved.</p>
            <p><a href="https://www.intastellarsolutions.com/about/legal/terms" target="_blank" className="links">Terms of Service</a></p>
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
                    <a href="https://www.intastellarsolutions.com/about/om-os" target="_blank" className="links">About Us</a>
                    <a href="https://www.intastellarsolutions.com/blog" target="_blank" className="links">Blog</a>
                    <a href="https://www.intastellarsolutions.com/contact" target="_blank" className="links">Contact Us</a>
                </nav>
                <nav className="footer-nav">
                    <h3>Follow Us</h3>
                    <a href="https://www.linkedin.com/company/intastellarsolutions" target="_blank" className="links">LinkedIn</a>
                    <a href="https://www.facebook.com/intastellarsolutions" target="_blank" className="links">Facebook</a>
                    <a href="https://www.instagram.com/intastellarsolutions/" target="_blank" className="links">Instagram</a>
                </nav>
            </section>
            <section className="footer-logo-container">
                <img src={logo} alt="Intastellar Solutions International" className="footer-logo" />
                <p>&copy; {year} Intastellar Solutions International. All rights reserved.</p>
            </section>
        </footer>
    </>
}