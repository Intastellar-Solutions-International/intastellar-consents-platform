import "./SideCart.css";
export default function SideCart({
    helpPage
}) {
    return <>
        <div className="sideCart">
            <div className="sideCart-header">
                <h2>Label reference panel</h2>
                <button className="secondary" onClick={() => {
                    document.querySelector(".sideCart").classList.remove("open");
                }}>×</button>
            </div>
            <div className="sideCart-content">
                <iframe title="Help" src={`https://support.intastellarsolutions.com/${helpPage}?v=${Date.now()}`} frameBorder="0" style={{ width: "100%", height: "100%" }} sandbox="allow-scripts allow-forms" allow="clipboard-write"></iframe>
            </div>
        </div>
    </>
}