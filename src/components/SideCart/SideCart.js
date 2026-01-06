import "./SideCart.css";
export default function SideCart({
    helpPage
}) {
    return <>
        <div className="sideCart">
            <div className="sideCart-header">
                <h2>Help</h2>
                <button className="secondary" onClick={() => {
                    document.querySelector(".sideCart").classList.remove("open");
                }}>×</button>
            </div>
            <div className="sideCart-content">
                <iframe title="Help" src={`https://support.intastellarsolutions.com/${helpPage}`} frameBorder="0" style={{ width: "100%", height: "100vh" }} sandbox="allow-scripts allow-forms" allow="clipboard-write"></iframe>
            </div>
        </div>
    </>
}