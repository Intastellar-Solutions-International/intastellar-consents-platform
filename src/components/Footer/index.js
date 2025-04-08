import "./Style.css";
export default function Footer() {
    const year = new Date().getFullYear();
    return <>
        <footer className="footer dashboard-content">
            <p>&copy; {year} Intastellar Solutions International. All rights reserved.</p>
            <p><a href="https://www.intastellarsolutions.com/about/legal/terms" target="_blank" className="links">Terms of Service</a></p>
        </footer>
    </>
}