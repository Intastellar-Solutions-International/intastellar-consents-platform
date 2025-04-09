import "./Login.css";
import logo from "../Components/Header/logo.png";
import API from "../API/api";
import Authentication from "../Authentication/Auth";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const useEffect = window.React.useEffect;

export default function Login() {
    document.title = "Sign in | Intastellar Consents";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100vh"
    const [email, setEmail] = React.useState();
    const [password, setPassword] = React.useState();
    const [isLoading, setLoading] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState(null);
    const type = "";

    useEffect(() => {
        Intastellar.accounts.id.renderButton("login", {
            "picker": "button",
            "theme": "light"
        });

    }, []);

    return (
        <>
            <div className="loginForm-container">
                <form className="loginForm" onSubmit={(e) => { e.preventDefault(), Authentication.Login(API.Login.url, email, password, type, setErrorMessage, setLoading) }}>
                    <img className="loginForm-logo" src={logo} alt="Intastellar Solutions Logo" />
                    <h1 className="loginForm-title">Sign in to Intastellar Consents</h1>
                    <label>{(errorMessage != null) ? errorMessage : null}</label>
                    <label>Email:</label>
                    <input className="loginForm-inputField" type="email" placeholder="email" onChange={e => { setEmail(e.target.value); }} />
                    <label>Password:</label>
                    <input className="loginForm-inputField" type="password" placeholder="password" onChange={e => { setPassword(e.target.value); }} />
                    <button className="loginForm-inputField --btn" type="submit">{(isLoading) ? "We are loggin you in..." : "SIGNIN"}</button>
                    <a className="loginForm-inputField --link" href="/forgot-password">Forgot Password?</a>
                    <Link className="loginForm-inputField --link" to="/signup">Don't have an account? Signup</Link>
                    <p>or</p>
                    <div
                        id="login"
                        data-client_id="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                        data-app-name="Intastellar Consents Solutions"
                        data-login_uri={window.location.host + "/auth-login"}
                    ></div>
                </form>
            </div>
        </>
    )
}