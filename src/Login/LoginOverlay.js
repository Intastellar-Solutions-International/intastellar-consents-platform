import "./Login.css";
import logo from "../Components/Header/logo.png";
import API from "../API/api";
import Authentication from "../Authentication/Auth";
import appStorage from '../Functions/storage.js';

export default function LoginOverLay() {
    document.title = "Signin | Intastellar Consents";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100vh"
    const [email, setEmail] = React.useState();
    const [password, setPassword] = React.useState();
    const [isLoading, setLoading] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState(null);

    if(JSON.parse(appStorage.getItem("globals"))?.token !== undefined || JSON.parse(appStorage.getItem("globals"))?.status){
        window.location.href = "/dashboard";
    }

    return (
        <>
            <div className="loginForm-overlay">
                <form className="loginForm" onSubmit={(e) => { e.preventDefault(), Authentication.Login(API.Login.url, email, password, setErrorMessage, setLoading) }}>
                    <img className="loginForm-logo --hideMobile" src={logo} alt="Intastellar Solutions Logo" />
                    <h1 className="loginForm-title">Signin</h1>
                    <label>{(errorMessage != null) ? errorMessage : null }</label>
                    <label>Email:</label>
                    <input className="loginForm-inputField" type="email" placeholder="email" onChange={e => { setEmail(e.target.value); }} />
                    <label>Password:</label>
                    <input className="loginForm-inputField" type="password" placeholder="password" onChange={e => { setPassword(e.target.value); }} />
                    <button className="loginForm-inputField --btn" type="submit">{ (isLoading) ? "We are loggin you in..." : "SIGNIN" }</button>
                </form>
            </div>       
        </>
    )
}