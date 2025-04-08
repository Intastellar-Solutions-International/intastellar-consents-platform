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