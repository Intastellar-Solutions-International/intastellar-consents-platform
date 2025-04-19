import "./Login.css";
import logo from "../Components/Header/logo.png";
import API from "../API/api";
import Authentication from "../Authentication/Auth";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const useEffect = window.React.useEffect;

export default function Login() {
    document.title = "Intastellar Consents Solutions powered by Intastellar Solutions";
    const [email, setEmail] = React.useState();
    const [password, setPassword] = React.useState();
    const [isLoading, setLoading] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState(null);
    const type = "";

    useEffect(() => {
        Intastellar.accounts.id.renderButton("login", {
            "picker": "button",
            "theme": "light",
        });

    }, []);

    return (
        <>
            <div className="loginForm-container">
                <div className="loginForm-header">
                    <section className="loginForm-header-content">
                        <img className="loginForm-logo" src={logo} alt="Intastellar Solutions Logo" />
                        <h1>Get started with <br /> Intastellar Consents Solutions</h1>
                        <p>By logging in, you can navigate to your consents managment tool, where you can find <strong>reports</strong> about & regarding your <strong>users consents</strong> on <strong>your Websites</strong>.</p>
                        <section>
                            <p>Our business tools can help you:</p>
                            <ul>
                                <li>Manage your users consents</li>
                                <li>Generate reports</li>
                                <li>Integrate with your websites</li>
                                <li>Get insights about your users</li>
                                <li>And much more...</li>
                            </ul>
                        </section>
                    </section>
                </div>
                <div className="signin-container" style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh"
                }}>
                    <h2 className="loginForm-title">Create new account</h2>
                    <a class="loginForm-signup" href="https://www.intastellaraccounts.com/SignUp/?service=Intastellar%20Consents%20Solutions&continue=www.intastellarconsents.com/auth-login&entryFlow=cHJvZmlsZQ==&key=d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d&access_id=intastellarconsents.com&passive=true&flowName=GeneralOAuthFlow&Entry=webauthsignin&scope=profile">
                        Sign up with Intastellar
                    </a>
                    <Link to="/login" className="loginForm-signup-2">
                        Already have an account? Log in
                    </Link>
                    <img className="intastellar-accounts-logo" src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg" />
                </div>
            </div>
        </>
    )
}