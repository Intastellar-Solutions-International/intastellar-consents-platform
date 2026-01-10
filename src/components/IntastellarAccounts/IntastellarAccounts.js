import Authentication from "../../Authentication/Auth";
import "./Style.css";
const { useState, useEffect, useRef, useContext } = window.React;
const Link = window.ReactRouterDOM.Link;
export default function Account(props) {
    const [demoMode, isDemoMode] = useState(Authentication.DemoMode);

    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(isDemoMode);
        return unsubscribe;
    }, [])

    return <>
        <div className="user_content">
            <div className="dropdown-image-name">
                <div className="dpde">
                    <img src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg" className="intastellaraccounts-logo" />
                </div>
                <div className="img" style={
                    {
                        position: "relative",
                        width: "max-content",
                        margin: "20px auto"
                    }
                }>
                    <img src={props.profile.image} className="content-img" />
                </div>
                <div className="dropdown-name">
                    <div className="dpdn">Hi, {props.profile.name}!</div>
                    <div className="dpde">{props.profile.email}</div>
                    <div className="acc">
                        <a href="https://my.intastellaraccounts.com" target="_blank"><img src="https://www.intastellarsolutions.com/assets/icons/fav/favicon-96x96.png" className="logo-icon" />Manage Your Intastellar Account</a>
                    </div>
                </div>
                {
                    (Authentication.getOrganisation() == 1) ?
                    <>
                        <div className="dropdown-separator"></div>
                        <div className="dropdown-name" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: "200px", padding: "15px", marginInline: "auto" }}>
                            {/* Toggle for Demo mode */}
                            <div className="dpdn">Demo Mode</div>
                            <div className="dpde">
                                <label className="switch">
                                    <input type="checkbox" checked={demoMode} onChange={(e) => {
                                        Authentication.SetDemoMode(e.target.checked);
                                    }} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        <p style={{
                            margin: "0",
                            color: "#6b6b6b"
                        }}>Masks live data across dashboards</p>
                    </>
                : null}
            </div>
            <div className="sign_out_btn_container">
                <button className="sign_out_btn" onClick={() => { Authentication.Logout() }}>
                    <svg focusable="false" height="24" viewBox="0 0 24 24" width="24" className=" NMm5M"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"></path><path d="M0 0h24v24H0z" fill="none"></path></svg> Sign Out
                </button>
            </div>
        </div>
    </>
}